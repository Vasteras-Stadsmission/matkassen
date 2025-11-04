#!/bin/bash

################################################################################
# Encrypted Database Restore Script
################################################################################
# This script restores an encrypted PostgreSQL database backup.
#
# Flow:
#   1. Validate DB_BACKUP_PASSPHRASE is set
#   2. Validate encrypted backup file exists
#   3. Verify SHA256 checksum (if checksum file exists)
#   4. Require --force flag as safety confirmation
#   5. Decrypt backup using gpg --symmetric
#   6. Pipe decrypted data directly to pg_restore → PostgreSQL
#
# Safety:
#   - Requires --force flag to prevent accidental restores
#   - Validates passphrase before attempting restore
#   - Verifies checksum integrity (if .sha256 file exists)
#   - No intermediate plaintext files (direct pipe: gpg → pg_restore → db)
#
# Usage:
#   ./db-restore.sh <encrypted_backup_file> --force
#
# Examples:
#   ./db-restore.sh /var/backups/matkassen/matkassen_backup_20250101_120000.sql.gpg --force
#
# Environment Variables:
#   DB_BACKUP_PASSPHRASE (required): Decryption passphrase
#   POSTGRES_HOST (optional): Database host (default: localhost)
#   POSTGRES_USER (required): Database user
#   POSTGRES_DB (required): Database name
################################################################################

set -euo pipefail
set -o errtrace

# Disable command echo to prevent passphrase exposure
set +x

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Parse arguments
ENCRYPTED_FILE=""
FORCE_FLAG=false

for arg in "$@"; do
    case "$arg" in
        --force)
            FORCE_FLAG=true
            ;;
        *)
            if [ -z "$ENCRYPTED_FILE" ]; then
                ENCRYPTED_FILE="$arg"
            else
                log "ERROR: Unexpected argument: $arg"
                exit 1
            fi
            ;;
    esac
done

# Validate arguments
if [ -z "$ENCRYPTED_FILE" ]; then
    log "ERROR: No encrypted backup file specified"
    log "Usage: $0 <encrypted_backup_file> --force"
    log "Example: $0 /var/backups/matkassen/matkassen_backup_20250101_120000.sql.gpg --force"
    exit 1
fi

if [ ! "$FORCE_FLAG" = true ]; then
    log "ERROR: Restore requires --force flag as safety confirmation"
    log "This operation will REPLACE ALL DATA in the database: $POSTGRES_DB"
    log "Usage: $0 $ENCRYPTED_FILE --force"
    exit 1
fi

# Validate file exists
if [ ! -f "$ENCRYPTED_FILE" ]; then
    log "ERROR: Encrypted backup file not found: $ENCRYPTED_FILE"
    exit 1
fi

# Validate DB_BACKUP_PASSPHRASE
if [ -z "${DB_BACKUP_PASSPHRASE:-}" ]; then
    log "ERROR: DB_BACKUP_PASSPHRASE environment variable is not set"
    log "This must be the same passphrase used during backup encryption"
    exit 1
fi

# Validate required database credentials
if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    log "ERROR: POSTGRES_PASSWORD environment variable is not set"
    log "Database authentication requires POSTGRES_PASSWORD"
    exit 1
fi

# Validate gpg is available
if ! command -v gpg >/dev/null 2>&1; then
    log "ERROR: gpg is not available for decryption"
    log "Install gpg: apt-get install gnupg"
    exit 1
fi

log "Starting encrypted database restore"
log "Source: $ENCRYPTED_FILE"
log "Target: $POSTGRES_DB on ${POSTGRES_HOST:-localhost}"

# Verify checksum if available
CHECKSUM_FILE="${ENCRYPTED_FILE}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
    log "Verifying SHA256 checksum"
    cd "$(dirname "$ENCRYPTED_FILE")"
    if sha256sum -c "$(basename "$CHECKSUM_FILE")" >/dev/null 2>&1; then
        log "Checksum verification passed"
    else
        log "ERROR: Checksum verification failed"
        log "The backup file may be corrupted or tampered with"
        exit 1
    fi
else
    log "WARNING: No checksum file found ($CHECKSUM_FILE)"
    log "Proceeding without integrity verification"
fi

log "Using gpg for decryption"

# Create secure .pgpass file
PGPASS_FILE=$(mktemp -t .pgpass.XXXXXX)
chmod 600 "$PGPASS_FILE"
echo "${POSTGRES_HOST:-localhost}:5432:${POSTGRES_DB}:${POSTGRES_USER}:${POSTGRES_PASSWORD}" > "$PGPASS_FILE"
export PGPASSFILE="$PGPASS_FILE"

# Cleanup function
cleanup() {
    rm -f "$PGPASS_FILE"
}
trap cleanup EXIT ERR

START_TS=$(date +%s)

# Perform restore (decrypt → pg_restore → database)
log "Decrypting and restoring database (this may take several minutes)"
log "WARNING: This will REPLACE ALL DATA in database: $POSTGRES_DB"

# gpg: use --passphrase-fd 3 with file descriptor
# This keeps stdin free for the pipe to pg_restore
gpg --decrypt --batch --passphrase-fd 3 --pinentry-mode loopback "$ENCRYPTED_FILE" \
    3<<<"$DB_BACKUP_PASSPHRASE" | pg_restore \
    -h "${POSTGRES_HOST:-localhost}" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --no-password \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --verbose

RESTORE_EXIT_CODE=$?

END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))

if [ $RESTORE_EXIT_CODE -eq 0 ]; then
    log "Database restore completed successfully in ${ELAPSED}s"
    log "Restored from: $ENCRYPTED_FILE"
    log "Database: $POSTGRES_DB"
else
    log "ERROR: Database restore failed with exit code $RESTORE_EXIT_CODE"
    log "Check PostgreSQL logs for details"
    exit $RESTORE_EXIT_CODE
fi

log "IMPORTANT: Verify application functionality after restore"
log "Run database migrations if schema changes occurred: pnpm run db:migrate"
