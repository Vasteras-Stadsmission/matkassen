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

if [ -z "${DB_BACKUP_PASSPHRASE:-}" ]; then
    echo "Error: DB_BACKUP_PASSPHRASE is not set in the calling shell."
    echo "Export it before running: export DB_BACKUP_PASSPHRASE=..."
    exit 1
fi

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
# POSTGRES_DB is forwarded so callers can override it for restore drills
# against a scratch database (e.g. POSTGRES_DB=matkassen_restore_drill).
$COMPOSE_CMD $COMPOSE_FILES --profile backup exec \
    -e BACKUP_FILENAME="$BACKUP_FILENAME" \
    -e POSTGRES_DB="${POSTGRES_DB:-}" \
    db-backup sh -lc '
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
    gpg --decrypt --batch --quiet --passphrase-fd 3 --pinentry-mode loopback \
        "$DOWNLOAD_FILE" 3<<<"$DB_BACKUP_PASSPHRASE" \
        | pg_restore \
            -h "$POSTGRES_HOST" \
            -U "$POSTGRES_USER" \
            -d "$POSTGRES_DB" \
            --no-password \
            --no-owner \
            --no-privileges \
            --clean \
            --if-exists
'

echo "Database restoration completed successfully."
echo "Note: Ensure the application was stopped during restore to avoid connections."
echo "If you paused the app manually, remember to start it again."
