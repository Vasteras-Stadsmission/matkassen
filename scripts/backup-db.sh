#!/bin/bash

# PostgreSQL encrypted backup script for Elastx Object Store
#
# Pipeline:
#   pg_dump --format=custom → gpg --symmetric AES256 → /tmp/<file>.dump.gpg
#   → rclone copy to Swift → set X-Delete-After expiry header
#   → download + decrypt + full pg_restore into matkassen_nightly_validate
#     → sentinel query → drop scratch DB
#   → ping healthchecks.io (success or fail)
#
# Encryption: symmetric AES256 with DB_BACKUP_PASSPHRASE fed on a pipe
# (via `builtin printf`) to gpg's --passphrase-fd, never via argv or a
# filesystem-backed herestring. Binary armor (no --armor) since the
# destination is object storage, not email.
#
# Validation does a real pg_restore every night — a wrong passphrase,
# DDL version skew, corrupted COPY block, or missing sentinel table all
# fail the same night, before anyone needs the backup.

set -euo pipefail
set -o errtrace

# Disable command echo to keep the passphrase out of any trace logs
set +x

ping_healthcheck() {
        # Reports this run to healthchecks.io, which emails when a run fails
        # or none arrives on schedule, and stays quiet otherwise. The ping
        # has no body: nothing from the backup leaves the container.
        if [ -z "${HEALTHCHECKS_PING_KEY:-}" ]; then
                return 0
        fi
        local suffix=""
        if [ "$1" = "fail" ]; then
                suffix="/fail"
        fi
        # URL via stdin (curl -K -), so the key never shows in the process list.
        printf 'url = "https://hc-ping.com/%s/backup%s"\n' "$HEALTHCHECKS_PING_KEY" "$suffix" \
                | curl -fsS -m 10 --retry 3 -o /dev/null -X POST -K - \
                || log "WARNING: healthchecks.io ping failed"
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Configuration
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="matkassen_backup_${TIMESTAMP}.dump.gpg"
TEMP_DIR="/tmp/backups"
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
PREFIX=${SWIFT_PREFIX:-backups}
RCLONE_REMOTE="elastx:${SWIFT_CONTAINER}/${PREFIX}"
ENCRYPTED_FILE="$TEMP_DIR/$BACKUP_FILENAME"
PGPASS_FILE=""
VALIDATION_DOWNLOAD=""
VALIDATION_OUTPUT=""
VALIDATION_ERRORS=""
EXPIRY_OK=""
SCRATCH_CREATED=""
LOCK_FD=9
LOCK_FILE="/tmp/backup.lock"

# Fixed scratch DB used by nightly validation. A single constant name makes
# every callsite assertable (see assert_scratch_db), so a bug that wipes
# $SCRATCH_DB_NAME cannot silently become `dropdb ""` or, much worse,
# `pg_restore --clean -d "$POSTGRES_DB"` against prod.
SCRATCH_DB_NAME="matkassen_nightly_validate"

# Guard against any path accidentally passing an unexpected DB name to
# createdb/dropdb/pg_restore. This is belt-and-suspenders — every
# callsite uses $SCRATCH_DB_NAME literally — but the guard means a future
# refactor that parameterises the name cannot regress into prod-dropping
# behavior without tripping this check.
assert_scratch_db() {
    local name=${1:-}
    if [ -z "$name" ] \
        || [ "$name" != "$SCRATCH_DB_NAME" ] \
        || [ "$name" = "$POSTGRES_DB" ] \
        || [ "$name" = "postgres" ] \
        || [ "$name" = "template0" ] \
        || [ "$name" = "template1" ]; then
        fail "Refusing DB operation on '$name' - only '$SCRATCH_DB_NAME' is allowed"
    fi
}

cleanup() {
    # Disable errexit inside the trap: we want to run every cleanup
    # step even if an earlier one fails. Without this, a future addition
    # (e.g. a second rclone call, another rm on a special path) could
    # silently skip the remaining cleanup and leak resources.
    set +e

    # Drop the scratch DB FIRST, while $PGPASS_FILE still exists on disk.
    # assert_scratch_db guarantees this can only target the fixed scratch
    # name, never $POSTGRES_DB. A failure here is logged but doesn't flip
    # DRILL_STATUS — the upload and validation already ran; a stuck
    # scratch DB is a next-run cleanup concern, not "the backup failed".
    if [ -n "${SCRATCH_CREATED:-}" ] && [ -n "${PGPASS_FILE:-}" ] && [ -f "$PGPASS_FILE" ]; then
        assert_scratch_db "$SCRATCH_DB_NAME"
        PGPASSFILE="$PGPASS_FILE" dropdb \
            --if-exists \
            -h "$POSTGRES_HOST" \
            -U "$POSTGRES_USER" \
            "$SCRATCH_DB_NAME" 2>/dev/null \
            || log "WARNING: failed to drop scratch DB '$SCRATCH_DB_NAME' on cleanup"
    fi
    rm -f "${PGPASS_FILE:-}" "$ENCRYPTED_FILE" \
        "${VALIDATION_DOWNLOAD:-}" \
        "${VALIDATION_OUTPUT:-}" "${VALIDATION_ERRORS:-}"
}

# BACKUP_STAGE is updated before each major step. If set -e aborts the
# script mid-pipeline (pg_dump/gpg/rclone failure), the ERR trap uses this
# to report which stage failed. Without this, a pg_dump or rclone
# failure would kill the script silently — no alert, no log summary.
BACKUP_STAGE="startup"
FAIL_NOTIFIED=0

fail() {
    local msg=$1
    log "ERROR: $msg"
    FAIL_NOTIFIED=1
    ping_healthcheck fail
    exit 1
}

on_error() {
    local rc=$?
    # fail() already reported the failure
    [ "$FAIL_NOTIFIED" -eq 1 ] && return
    log "ERROR: Backup aborted in stage '$BACKUP_STAGE' (exit $rc)"
    ping_healthcheck fail
}
trap 'on_error' ERR
trap 'cleanup' EXIT

# Prevent concurrent runs (cron + manual backup-manage.sh test).
# flock is available in the Alpine container but not on macOS (dev/test).
if command -v flock >/dev/null 2>&1; then
    exec 9>"$LOCK_FILE"
    if ! flock -n $LOCK_FD; then
        fail "Backup aborted - another backup is already running (lock held on $LOCK_FILE)"
    fi
fi

# Fail fast on missing encryption passphrase. The variable is required in
# both deploy.sh and update.sh for production; if it's unset here the env
# wiring into the container is broken (see docker-compose.backup.yml).
if [ -z "${DB_BACKUP_PASSPHRASE:-}" ]; then
    fail "Backup aborted - DB_BACKUP_PASSPHRASE missing in container (check docker-compose.backup.yml and host .env.backup)"
fi

if ! command -v gpg >/dev/null 2>&1; then
    fail "Backup aborted - gpg missing from container image"
fi

mkdir -p "$TEMP_DIR"

START_TS=$(date +%s)
log "Starting encrypted PostgreSQL backup process"

# Use a .pgpass file rather than PGPASSWORD to keep the password out of
# /proc/<pid>/environ for any sibling process inspection. mktemp avoids
# a fixed filename that would collide if two runs overlap.
# The db-name field is '*' (wildcard) so the same credentials work for
# pg_dump against $POSTGRES_DB, createdb/dropdb against $SCRATCH_DB_NAME,
# and psql -d $SCRATCH_DB_NAME for the sentinel query.
BACKUP_STAGE="pgpass-setup"
PGPASS_FILE=$(mktemp -t .pgpass.XXXXXX)
chmod 600 "$PGPASS_FILE"
echo "${POSTGRES_HOST}:5432:*:${POSTGRES_USER}:${POSTGRES_PASSWORD}" > "$PGPASS_FILE"
export PGPASSFILE="$PGPASS_FILE"

# Pre-flight cleanup: if a previous run crashed after creating the scratch
# DB but before dropping it, remove it now. Exact-name only — this is NOT
# a prefix-match sweep.
assert_scratch_db "$SCRATCH_DB_NAME"
dropdb --if-exists -h "$POSTGRES_HOST" -U "$POSTGRES_USER" "$SCRATCH_DB_NAME" 2>/dev/null \
    || log "WARNING: pre-flight cleanup of '$SCRATCH_DB_NAME' failed - may not have existed"

# pg_dump → gpg, no intermediate plaintext file. The passphrase is fed on
# fd 3 so it never lands in argv.
BACKUP_STAGE="pg_dump|gpg"
log "Creating encrypted database dump: $BACKUP_FILENAME"
# Feed the passphrase via process substitution on fd 3 rather than a
# herestring. `builtin printf` forces the bash builtin (no fork, no
# argv exposure) even if `printf` is ever shadowed. Process substitution
# uses /dev/fd/N on Linux (no filesystem spill); herestrings write the
# expansion to an unlinked file in $TMPDIR which is on the host disk
# and theoretically recoverable from crash dumps. gpg keeps reading
# plaintext from fd 0 (the pg_dump pipe).
pg_dump \
    -h "$POSTGRES_HOST" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --no-password \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    | gpg --symmetric --cipher-algo AES256 --batch \
        --passphrase-fd 3 --pinentry-mode loopback \
        --output "$ENCRYPTED_FILE" \
        3< <(builtin printf '%s' "$DB_BACKUP_PASSPHRASE")

if [ ! -f "$ENCRYPTED_FILE" ] || [ ! -s "$ENCRYPTED_FILE" ]; then
    fail "Database backup failed - dump/encrypt produced no output"
fi

BACKUP_SIZE=$(du -h "$ENCRYPTED_FILE" | cut -f1)
log "Encrypted dump complete. Size: $BACKUP_SIZE"

BACKUP_STAGE="rclone upload"
log "Uploading backup to Elastx Object Store container: $SWIFT_CONTAINER"
RCLONE_VERSION_OUTPUT=$(rclone version --check=false 2>/dev/null || true)
RCLONE_VERSION=${RCLONE_VERSION_OUTPUT%%$'\n'*}
[ -n "$RCLONE_VERSION" ] || RCLONE_VERSION="unknown"
log "rclone version: $RCLONE_VERSION"

EXPIRY_SECONDS=$((RETENTION_DAYS * 24 * 60 * 60))

rclone copy "$ENCRYPTED_FILE" "$RCLONE_REMOTE" \
    --checkers=4 \
    --transfers=1 \
    --retries=3 \
    --progress \
    --stats-one-line \
    --stats=30s

log "Backup uploaded successfully"

log "Remote storage stats:"
rclone about "$RCLONE_REMOTE" 2>/dev/null || log "Remote stats unavailable (not supported by this storage)"

# X-Delete-After is a defense-in-depth retention mechanism. Even if every
# subsequent run fails, Swift will still GC objects after RETENTION_DAYS.
# Handled as a soft failure: upload already succeeded, so we continue.
BACKUP_STAGE="swift expiry header"
log "Setting automatic expiry for backup (${RETENTION_DAYS} days)"
if swift post "${SWIFT_CONTAINER}" \
    --header "X-Delete-After:${EXPIRY_SECONDS}" \
    "${PREFIX}/${BACKUP_FILENAME}"; then
    EXPIRY_OK="yes"
    log "Automatic expiry set - backup will be deleted in ${RETENTION_DAYS} days"
else
    EXPIRY_OK="no"
    log "WARNING: Failed to set automatic expiry header (upload still succeeded)"
    log "Manual cleanup may be required for this backup file"
fi

# Full-restore validation: download → decrypt → pg_restore into a
# throwaway scratch DB on the same Postgres instance → sentinel query →
# drop the scratch DB. This is strictly stronger than `pg_restore --list`:
# pg_restore actually applies every DDL and every COPY block, so DDL
# version skew, corrupted COPY data, index rebuild failures, and missing
# extensions all surface here. On success we've proven the backup is
# actually restorable, not just parseable. This replaces the documented
# quarterly manual drill.
#
# Same-instance caveat: the scratch DB shares postgres_data, WAL, and
# checkpoint pressure with prod. For matkassen's data size this is
# immaterial, but note that this is NOT a cross-host disaster-recovery
# drill — if the whole host is lost, you still need to restore onto a
# fresh cluster. That scenario is not exercised nightly.
BACKUP_STAGE="validation"
DRILL_STATUS="success"
log "Validating backup by full restore into scratch DB '$SCRATCH_DB_NAME'"

VALIDATION_DOWNLOAD=$(mktemp -t backup_download.XXXXXX)
VALIDATION_OUTPUT=$(mktemp -t backup_validation.XXXXXX)
VALIDATION_ERRORS=$(mktemp -t backup_errors.XXXXXX)
chmod 600 "$VALIDATION_DOWNLOAD" "$VALIDATION_OUTPUT" "$VALIDATION_ERRORS"

if ! rclone copyto "$RCLONE_REMOTE/$BACKUP_FILENAME" "$VALIDATION_DOWNLOAD" --retries=3; then
    log "Validation FAILED - unable to download backup file"
    DRILL_STATUS="failure"
elif ! assert_scratch_db "$SCRATCH_DB_NAME" || \
     ! createdb -h "$POSTGRES_HOST" -U "$POSTGRES_USER" "$SCRATCH_DB_NAME" 2>"$VALIDATION_ERRORS"; then
    ERROR_MSG=$(head -n 3 "$VALIDATION_ERRORS" | tr '\n' ' ')
    log "Validation FAILED - could not create scratch DB: $ERROR_MSG"
    log "Hint: the backup user needs CREATEDB privilege. Run: ALTER USER $POSTGRES_USER CREATEDB;"
    DRILL_STATUS="failure"
else
    SCRATCH_CREATED=1
    # Stream decrypt | pg_restore into the scratch DB. --exit-on-error
    # means any DDL or COPY failure fails pg_restore, which fails the
    # pipeline under pipefail. --clean --if-exists is belt-and-suspenders
    # for a freshly created empty DB. --no-owner/--no-privileges so the
    # scratch role doesn't need to match the dump's role grants.
    # Truncate the shared error file once, then both gpg and pg_restore
    # append — avoids a race where one process opens O_TRUNC while the
    # other has already written.
    : >"$VALIDATION_ERRORS"
    assert_scratch_db "$SCRATCH_DB_NAME"
    if builtin printf '%s' "$DB_BACKUP_PASSPHRASE" \
        | gpg --decrypt --batch --yes --quiet --passphrase-fd 0 --pinentry-mode loopback \
            "$VALIDATION_DOWNLOAD" 2>>"$VALIDATION_ERRORS" \
        | pg_restore \
            -h "$POSTGRES_HOST" \
            -U "$POSTGRES_USER" \
            -d "$SCRATCH_DB_NAME" \
            --no-password \
            --no-owner \
            --no-privileges \
            --clean \
            --if-exists \
            --exit-on-error 2>>"$VALIDATION_ERRORS"; then
        # Sentinel: the 'households' table must exist and be queryable
        # via the same role that restored it. Cheap check (no count scan).
        SENTINEL=$(psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$SCRATCH_DB_NAME" \
            -tAc "SELECT to_regclass('public.households') IS NOT NULL" 2>"$VALIDATION_ERRORS" || echo "error")
        if [ "$SENTINEL" = "t" ]; then
            log "Validation OK - full restore succeeded, 'households' table present and queryable"
        else
            ERROR_MSG=$(head -n 3 "$VALIDATION_ERRORS" | tr '\n' ' ')
            log "Validation FAILED - sentinel query returned '$SENTINEL': $ERROR_MSG"
            DRILL_STATUS="failure"
        fi
    else
        ERROR_MSG=$(head -n 5 "$VALIDATION_ERRORS" | tr '\n' ' ')
        log "Validation FAILED - pg_restore errored: $ERROR_MSG"
        DRILL_STATUS="failure"
    fi
fi

# The scratch DB gets dropped by the EXIT trap (cleanup()), which runs
# even on validation failure. Download file is a tmpfs encrypted blob —
# plaintext never lands on disk in this validation path.
rm -f "$VALIDATION_DOWNLOAD"

# Best-effort stats for the log line — don't let a transient rclone failure
# here prevent the healthchecks.io ping from firing.
BACKUP_COUNT=$(rclone lsf "$RCLONE_REMOTE" --include "matkassen_backup_*.dump.gpg" 2>/dev/null | wc -l) || BACKUP_COUNT="?"
TOTAL_SIZE_HUMAN=$(rclone size "$RCLONE_REMOTE" --include "matkassen_backup_*.dump.gpg" 2>/dev/null | grep "Total size" | awk '{print $3}') || TOTAL_SIZE_HUMAN="?"

END_TS=$(date +%s)
ELAPSED=$((END_TS-START_TS))

EXPIRY_LABEL="${RETENTION_DAYS}d"
[ "$EXPIRY_OK" != "yes" ] && EXPIRY_LABEL="FAILED"

if [ "$DRILL_STATUS" = "success" ]; then
    log "Backup process completed successfully in ${ELAPSED}s (file: $BACKUP_FILENAME, size: $BACKUP_SIZE, auto-expiry: ${EXPIRY_LABEL}, validation: ${DRILL_STATUS})"
    if [ "$EXPIRY_OK" = "yes" ]; then
        ping_healthcheck success
    else
        # The backup is usable, but nothing deletes it after RETENTION_DAYS,
        # so personal data would outlive the retention period. Alert.
        log "WARNING: backup has no automatic expiry; delete it by hand after ${RETENTION_DAYS} days"
        ping_healthcheck fail
    fi
else
    log "Backup uploaded but validation failed in ${ELAPSED}s (file: $BACKUP_FILENAME, size: $BACKUP_SIZE, auto-expiry: ${EXPIRY_LABEL}). Manual verification required."
    ping_healthcheck fail
    exit 1
fi

log "Current status: $BACKUP_COUNT encrypted backups, total size: $TOTAL_SIZE_HUMAN"
