#!/bin/bash

# PostgreSQL encrypted backup script for Elastx Object Store
#
# Pipeline:
#   pg_dump --format=custom → gpg --symmetric AES256 → /tmp/<file>.dump.gpg
#   → rclone copy to Swift → set X-Delete-After expiry header
#   → download → decrypt → pg_restore --list (round-trip validation)
#   → Slack notify
#
# Encryption: symmetric AES256 with DB_BACKUP_PASSPHRASE (passed via fd 3,
# never via argv). Binary armor (no --armor) since the destination is object
# storage, not email.
#
# Validation runs end-to-end including decryption — a wrong passphrase or
# corrupted upload fails the same night, before anyone needs the backup.

set -euo pipefail
set -o errtrace

# Disable command echo to keep the passphrase out of any trace logs
set +x

notify_slack() {
        # Sends a Slack message via bot API with readable formatting
        local status=${1:-"failure"}
        local msg=${2:-"Database backup failed"}
        local host=$(hostname)
        local emoji="❌"; [ "$status" = "success" ] && emoji="✅"
        local drill_emoji="⏭️"; case "${DRILL_STATUS:-skipped}" in
            success) drill_emoji="✅";;
            failure) drill_emoji="❌";;
        esac

        # Defaults if variables are not set (e.g., early failure)
        local _file=${BACKUP_FILENAME:-unknown}
        local _size=${BACKUP_SIZE:-unknown}
        local _elapsed=${ELAPSED:-unknown}
        local _drill=${DRILL_STATUS:-skipped}

        if [ -n "${SLACK_BOT_TOKEN:-}" ] && [ -n "${SLACK_CHANNEL_ID:-}" ]; then
                # Prefer blocks for better readability; fall back to plain text on error
                local payload
                payload=$(cat <<EOF
{\
    "channel": "${SLACK_CHANNEL_ID}",\
    "text": "[matkassen] ${msg}",\
    "blocks": [\
        {"type":"section","text":{"type":"mrkdwn","text":"*[matkassen]* ${emoji} ${msg}"}},\
        {"type":"section","fields":[\
            {"type":"mrkdwn","text":"*File*\\n${_file}"},\
            {"type":"mrkdwn","text":"*Size*\\n${_size}"},\
            {"type":"mrkdwn","text":"*Duration*\\n${_elapsed}s"},\
            {"type":"mrkdwn","text":"*Drill*\\n${drill_emoji} ${_drill}"},\
            {"type":"mrkdwn","text":"*Host*\\n${host}"}\
        ]}\
    ]
}
EOF
)
                curl -sS https://slack.com/api/chat.postMessage \
                    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
                    -H "Content-type: application/json; charset=utf-8" \
                    --data "$payload" | grep -q '"ok":true' || true
        fi
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
VALIDATION_PLAINTEXT=""
VALIDATION_OUTPUT=""
VALIDATION_ERRORS=""
EXPIRY_OK=""
LOCK_FD=9
LOCK_FILE="/tmp/backup.lock"

cleanup() {
    rm -f "${PGPASS_FILE:-}" "$ENCRYPTED_FILE" \
        "${VALIDATION_DOWNLOAD:-}" "${VALIDATION_PLAINTEXT:-}" \
        "${VALIDATION_OUTPUT:-}" "${VALIDATION_ERRORS:-}"
}

# BACKUP_STAGE is updated before each major step. If set -e aborts the
# script mid-pipeline (pg_dump/gpg/rclone failure), the ERR trap uses this
# to report which stage failed to Slack. Without this, a pg_dump or rclone
# failure would kill the script silently — no alert, no log summary.
BACKUP_STAGE="startup"
FAIL_NOTIFIED=0

fail() {
    local msg=$1
    log "ERROR: $msg"
    FAIL_NOTIFIED=1
    notify_slack failure "$msg"
    exit 1
}

on_error() {
    local rc=$?
    # fail() already notified — don't double-post to Slack
    [ "$FAIL_NOTIFIED" -eq 1 ] && return
    log "ERROR: Backup aborted in stage '$BACKUP_STAGE' (exit $rc)"
    notify_slack failure "Backup aborted in stage '$BACKUP_STAGE' (exit $rc)"
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
    fail "Backup aborted - DB_BACKUP_PASSPHRASE missing in container (check docker-compose.backup.yml and host .env)"
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
BACKUP_STAGE="pgpass-setup"
PGPASS_FILE=$(mktemp -t .pgpass.XXXXXX)
chmod 600 "$PGPASS_FILE"
echo "${POSTGRES_HOST}:5432:${POSTGRES_DB}:${POSTGRES_USER}:${POSTGRES_PASSWORD}" > "$PGPASS_FILE"
export PGPASSFILE="$PGPASS_FILE"

# pg_dump → gpg, no intermediate plaintext file. The passphrase is fed on
# fd 3 so it never lands in argv.
BACKUP_STAGE="pg_dump|gpg"
log "Creating encrypted database dump: $BACKUP_FILENAME"
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
        3<<<"$DB_BACKUP_PASSPHRASE"

if [ ! -f "$ENCRYPTED_FILE" ] || [ ! -s "$ENCRYPTED_FILE" ]; then
    fail "Database backup failed - dump/encrypt produced no output"
fi

BACKUP_SIZE=$(du -h "$ENCRYPTED_FILE" | cut -f1)
log "Encrypted dump complete. Size: $BACKUP_SIZE"

BACKUP_STAGE="rclone upload"
log "Uploading backup to Elastx Object Store container: $SWIFT_CONTAINER"
log "rclone version: $(rclone version --check=false | head -1)"

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

# Round-trip validation: download → decrypt → pg_restore --list. This also
# exercises the passphrase, so a wrong passphrase fails the same night.
BACKUP_STAGE="validation"
DRILL_STATUS="success"
log "Validating backup round-trip (download → decrypt → pg_restore --list)"

VALIDATION_DOWNLOAD=$(mktemp -t backup_download.XXXXXX)
VALIDATION_PLAINTEXT=$(mktemp -t backup_plaintext.XXXXXX)
VALIDATION_OUTPUT=$(mktemp -t backup_validation.XXXXXX)
VALIDATION_ERRORS=$(mktemp -t backup_errors.XXXXXX)
chmod 600 "$VALIDATION_DOWNLOAD" "$VALIDATION_PLAINTEXT" "$VALIDATION_OUTPUT" "$VALIDATION_ERRORS"

if ! rclone copyto "$RCLONE_REMOTE/$BACKUP_FILENAME" "$VALIDATION_DOWNLOAD" --retries=3; then
    log "Backup validation FAILED - unable to download backup file for validation"
    DRILL_STATUS="failure"
elif ! gpg --decrypt --batch --yes --quiet --passphrase-fd 3 --pinentry-mode loopback \
        --output "$VALIDATION_PLAINTEXT" "$VALIDATION_DOWNLOAD" \
        3<<<"$DB_BACKUP_PASSPHRASE" 2>"$VALIDATION_ERRORS"; then
    ERROR_MSG=$(head -n 3 "$VALIDATION_ERRORS" | tr '\n' ' ')
    log "Backup validation FAILED - decryption failed: $ERROR_MSG"
    DRILL_STATUS="failure"
elif ! pg_restore --list "$VALIDATION_PLAINTEXT" >"$VALIDATION_OUTPUT" 2>"$VALIDATION_ERRORS"; then
    ERROR_MSG=$(head -n 3 "$VALIDATION_ERRORS" | tr '\n' ' ')
    log "Backup validation FAILED - decrypted file is not a valid pg dump: $ERROR_MSG"
    DRILL_STATUS="failure"
else
    # Assert a sentinel core table is present in the TOC. A raw line-count
    # threshold would falsely fail on a small schema and silently pass an
    # incomplete dump. `households` is a load-bearing table that has
    # existed since day one — if it's missing, something is genuinely
    # wrong with the dump.
    if grep -qE 'TABLE[[:space:]]+public[[:space:]]+households([[:space:]]|$)' "$VALIDATION_OUTPUT"; then
        TOC_LINES=$(grep -cv -e '^$' -e '^;' "$VALIDATION_OUTPUT" || true)
        log "Backup validation OK (sentinel table 'households' present, $TOC_LINES TOC entries)"
    else
        log "Backup validation FAILED - sentinel table 'households' is missing from the dump TOC"
        DRILL_STATUS="failure"
    fi
fi

# Per-iteration cleanup so plaintext doesn't sit on tmpfs longer than needed
rm -f "$VALIDATION_PLAINTEXT" "$VALIDATION_DOWNLOAD"

# Best-effort stats for the log line — don't let a transient rclone failure
# here prevent the Slack notification from firing.
BACKUP_COUNT=$(rclone lsf "$RCLONE_REMOTE" --include "matkassen_backup_*.dump.gpg" 2>/dev/null | wc -l) || BACKUP_COUNT="?"
TOTAL_SIZE_HUMAN=$(rclone size "$RCLONE_REMOTE" --include "matkassen_backup_*.dump.gpg" 2>/dev/null | grep "Total size" | awk '{print $3}') || TOTAL_SIZE_HUMAN="?"

END_TS=$(date +%s)
ELAPSED=$((END_TS-START_TS))

EXPIRY_LABEL="${RETENTION_DAYS}d"
[ "$EXPIRY_OK" != "yes" ] && EXPIRY_LABEL="FAILED"

if [ "$DRILL_STATUS" = "success" ]; then
    log "Backup process completed successfully in ${ELAPSED}s"
    SUMMARY="Encrypted backup success (file: $BACKUP_FILENAME, size: $BACKUP_SIZE, elapsed: ${ELAPSED}s, auto-expiry: ${EXPIRY_LABEL}). Validation: ${DRILL_STATUS}."
    notify_slack success "$SUMMARY"
else
    log "Backup uploaded but validation failed in ${ELAPSED}s"
    SUMMARY="Backup uploaded but validation failed (file: $BACKUP_FILENAME, size: $BACKUP_SIZE, elapsed: ${ELAPSED}s, auto-expiry: ${EXPIRY_LABEL}). Manual verification required."
    notify_slack failure "$SUMMARY"
    exit 1
fi

log "Current status: $BACKUP_COUNT encrypted backups, total size: $TOTAL_SIZE_HUMAN"
