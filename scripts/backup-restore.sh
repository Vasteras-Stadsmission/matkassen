#!/bin/bash

# PostgreSQL encrypted backup recovery script
#
# Usage: ./scripts/backup-restore.sh <backup_filename>
#
# Filename must end in .dump.gpg (the format produced by backup-db.sh).
# The script downloads the encrypted backup from Swift to the backup
# container's tmpfs, then streams gpg --decrypt | pg_restore so the
# decrypted dump never lands on disk.

set -euo pipefail

# Disable command echo to keep the passphrase out of any trace logs
set +x

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.backup.yml"
COMPOSE_CMD="docker compose"
if ! docker compose version >/dev/null 2>&1; then
    echo "Error: docker compose (v2) is required. Please install Docker Compose v2 and use 'docker compose', not 'docker-compose'."
    exit 1
fi

ENV_NAME=${ENV_NAME:-}
require_prod() {
    if [ "${ENV_NAME}" != "production" ]; then
        echo "Refusing: restores allowed only in ENV_NAME=production (current: ${ENV_NAME:-unset})."
        echo "Tip: set ENV_NAME=production and ensure the 'backup' profile is enabled for the db-backup service."
        exit 1
    fi
}

if [ $# -ne 1 ]; then
    echo "Usage: $0 <backup_filename>"
    echo ""
    echo "Example: $0 matkassen_backup_20250830_020000.dump.gpg"
    echo ""
    echo "Available backups:"
    $COMPOSE_CMD $COMPOSE_FILES --profile backup exec db-backup \
        rclone lsf "elastx:$SWIFT_CONTAINER/${SWIFT_PREFIX:-backups}" --include "matkassen_backup_*.dump.gpg" | tail -20 || true
    exit 1
fi

require_prod

BACKUP_FILENAME="$1"

# Reject any filename that isn't an encrypted backup. Older unencrypted
# .dump files in Swift are not supported — they predate this script.
if [[ "$BACKUP_FILENAME" != *.dump.gpg ]]; then
    echo "Error: filename must end in .dump.gpg (got: $BACKUP_FILENAME)"
    echo "Encrypted backups produced by backup-db.sh have the .dump.gpg extension."
    exit 1
fi

# Note: the outer shell does NOT need DB_BACKUP_PASSPHRASE — the db-backup
# container has it in its ambient env via docker-compose.backup.yml. The
# inner shell below checks that; requiring it here too would block a
# legitimate restore if the operator just forgot to export it locally.

echo "Starting database restoration process for: $BACKUP_FILENAME"
echo "WARNING: This will replace all data in the target database."
read -p "Are you sure you want to continue? (y/N): " -r REPLY
echo
case "$REPLY" in
    y|Y|yes|YES) ;;
    *) echo "Restoration cancelled."; exit 0;;
esac

echo "Restoring database from Object Store..."

# The container already has DB_BACKUP_PASSPHRASE in its env via
# docker-compose.backup.yml. We do NOT pass it via `-e` because that
# would put the secret in docker's argv (visible to `ps`).
# POSTGRES_DB is forwarded ONLY when the caller has explicitly set it
# (restore drills against a scratch database, e.g.
# POSTGRES_DB=matkassen_restore_drill). Without the guard, an unset
# value would clobber the container's own POSTGRES_DB with empty string.
EXEC_ENV_ARGS=(-e "BACKUP_FILENAME=$BACKUP_FILENAME")
if [ -n "${POSTGRES_DB:-}" ]; then
    EXEC_ENV_ARGS+=(-e "POSTGRES_DB=$POSTGRES_DB")
fi
# Use bash explicitly rather than sh. On Alpine, /bin/sh is BusyBox ash,
# which supports the herestring below (3<<<"$PASS") only via the
# ASH_BASH_COMPAT build flag. The image has bash installed, so pinning
# to bash removes that implicit dependency.
$COMPOSE_CMD $COMPOSE_FILES --profile backup exec \
    "${EXEC_ENV_ARGS[@]}" \
    db-backup bash -c '
    set -euo pipefail
    set +x

    SRC_PATH="elastx:${SWIFT_CONTAINER}/${SWIFT_PREFIX:-backups}/"
    FILE="$BACKUP_FILENAME"
    echo "Source: ${SRC_PATH}${FILE}"

    if [ -z "${DB_BACKUP_PASSPHRASE:-}" ]; then
        echo "Error: DB_BACKUP_PASSPHRASE missing inside container"
        exit 1
    fi

    DOWNLOAD_FILE=$(mktemp -t restore_download.XXXXXX)
    PGPASS_FILE=$(mktemp -t .pgpass.XXXXXX)
    chmod 600 "$DOWNLOAD_FILE" "$PGPASS_FILE"
    cleanup() { rm -f "$DOWNLOAD_FILE" "$PGPASS_FILE"; }
    trap cleanup EXIT ERR

    echo "${POSTGRES_HOST}:5432:${POSTGRES_DB}:${POSTGRES_USER}:${POSTGRES_PASSWORD}" > "$PGPASS_FILE"
    export PGPASSFILE="$PGPASS_FILE"

    echo "Downloading encrypted backup..."
    rclone copyto "${SRC_PATH}${FILE}" "$DOWNLOAD_FILE" --retries=3

    echo "Decrypting and restoring (streaming, no plaintext on disk)..."
    # Decrypt to stdout, pipe straight into pg_restore. No --jobs because
    # parallel restore needs a seekable file; we accept slower restore in
    # exchange for never writing the decrypted dump to disk.
    # --exit-on-error: a broken restore must fail immediately, not limp
    # through partial DDL/COPY and leave the target DB half-restored.
    # This matters most here because the target is usually prod.
    # Passphrase via `builtin printf | --passphrase-fd 0` rather than
    # herestring — anonymous pipe, no $TMPDIR spill. `builtin` forces
    # the bash builtin even if printf is shadowed.
    builtin printf '%s' "$DB_BACKUP_PASSPHRASE" \
        | gpg --decrypt --batch --quiet --passphrase-fd 0 --pinentry-mode loopback \
            "$DOWNLOAD_FILE" \
        | pg_restore \
            -h "$POSTGRES_HOST" \
            -U "$POSTGRES_USER" \
            -d "$POSTGRES_DB" \
            --no-password \
            --no-owner \
            --no-privileges \
            --clean \
            --if-exists \
            --exit-on-error
'

echo "Database restoration completed successfully."
echo "Note: Ensure the application was stopped during restore to avoid connections."
echo "If you paused the app manually, remember to start it again."
