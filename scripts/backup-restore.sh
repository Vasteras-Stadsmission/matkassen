#!/bin/bash

# PostgreSQL backup recovery script
# Usage: ./scripts/backup-restore.sh <backup_filename>

set -euo pipefail

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
    echo "Example: $0 matkassen_backup_20250830_020000.dump"
    echo ""
    echo "Available backups:"
    $COMPOSE_CMD $COMPOSE_FILES --profile backup exec db-backup \
        rclone lsf "elastx:$SWIFT_CONTAINER/${SWIFT_PREFIX:-backups}" --include "matkassen_backup_*" | tail -20 || true
    exit 1
fi

require_prod

BACKUP_FILENAME="$1"

echo "Starting database restoration process for: $BACKUP_FILENAME"
echo "WARNING: This will replace all data in the target database."
read -p "Are you sure you want to continue? (y/N): " -r REPLY
echo
case "$REPLY" in
    y|Y|yes|YES) ;;
    *) echo "Restoration cancelled."; exit 0;;
esac

echo "Restoring database from Object Store..."
$COMPOSE_CMD $COMPOSE_FILES --profile backup exec db-backup sh -lc '
    set -euo pipefail
    SRC_PATH="elastx:${SWIFT_CONTAINER}/${SWIFT_PREFIX:-backups}/"
    FILE="'$BACKUP_FILENAME'"
    echo "Source: ${SRC_PATH}${FILE}"

    # Create secure .pgpass file instead of using PGPASSWORD environment variable
    # This prevents password exposure in process lists and logs
    PGPASS_FILE="/tmp/.pgpass"
    echo "${POSTGRES_HOST}:5432:${POSTGRES_DB}:${POSTGRES_USER}:${POSTGRES_PASSWORD}" > "$PGPASS_FILE"
    chmod 600 "$PGPASS_FILE"
    export PGPASSFILE="$PGPASS_FILE"

    # Use pg_restore for .dump files, psql for .sql.gz files
    if [[ "$FILE" == *.dump ]]; then
        echo "Using pg_restore for custom format backup"
        rclone cat "${SRC_PATH}${FILE}" | pg_restore \
            -h "$POSTGRES_HOST" \
            -U "$POSTGRES_USER" \
            -d "$POSTGRES_DB" \
            --jobs=4 \
            --no-owner \
            --no-privileges \
            --clean \
            --if-exists
    else
        echo "Using psql for SQL format backup"
        rclone cat "${SRC_PATH}${FILE}" | gunzip -c | psql \
            -h "$POSTGRES_HOST" \
            -U "$POSTGRES_USER" \
            -d "$POSTGRES_DB" \
            --quiet
    fi

    # Clean up .pgpass file
    rm -f "$PGPASS_FILE"
'

echo "Database restoration completed successfully."
echo "Note: Ensure the application was stopped during restore to avoid connections."
echo "If you paused the app manually, remember to start it again."
