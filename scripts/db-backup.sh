#!/bin/bash

################################################################################
# DESIGN NOTE: Encrypted Database Backup
################################################################################
# This script performs GDPR-compliant encrypted backups of the PostgreSQL database.
#
# Flow:
#   1. Validate DB_BACKUP_PASSPHRASE is set (fail fast if missing)
#   2. Run pg_dump with --format=custom (compressed binary format, includes built-in compression)
#   3. Pipe directly to gpg --symmetric (AES256 encryption)
#   4. Write encrypted output to: <target_dir>/<timestamp>.sql.gpg
#   5. Generate SHA256 checksum: <timestamp>.sql.gpg.sha256
#
# Encryption:
#   - gpg --symmetric --cipher-algo AES256 --armor
#   - Passphrase: DB_BACKUP_PASSPHRASE environment variable (stored in GitHub Secrets)
#
# Security:
#   - No intermediate files (direct pipe: pg_dump → gpg → storage)
#   - Command echo disabled (set +x) to prevent passphrase exposure in logs
#   - Exits loudly if DB_BACKUP_PASSPHRASE is unset
#   - Passphrase never logged, only presence/absence reported
#
# Output:
#   - <timestamp>.sql.gpg: Encrypted backup
#   - <timestamp>.sql.gpg.sha256: SHA256 checksum for integrity verification
#
# Environment Variables:
#   DB_BACKUP_PASSPHRASE (required): Symmetric encryption passphrase
#   BACKUP_TARGET_DIR (optional): Storage directory (default: /var/backups/matkassen)
#   POSTGRES_HOST (optional): Database host (default: localhost)
#   POSTGRES_USER (required): Database user
#   POSTGRES_DB (required): Database name
################################################################################

set -euo pipefail
set -o errtrace

# Disable command echo to prevent passphrase exposure in logs
set +x

# Script configuration
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_TARGET_DIR="${BACKUP_TARGET_DIR:-/var/backups/matkassen}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
BACKUP_FILENAME="matkassen_backup_${TIMESTAMP}.sql.gpg"
CHECKSUM_FILENAME="${BACKUP_FILENAME}.sha256"

# Ensure target directory exists
mkdir -p "$BACKUP_TARGET_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Critical validation: DB_BACKUP_PASSPHRASE must be set
if [ -z "${DB_BACKUP_PASSPHRASE:-}" ]; then
    log "ERROR: DB_BACKUP_PASSPHRASE environment variable is not set"
    log "This variable must be configured in GitHub Secrets and passed to the backup script"
    log "See docs/deployment-guide.md for setup instructions"
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
    log "ERROR: gpg is not available for encryption"
    log "Install gpg: apt-get install gnupg"
    exit 1
fi

log "Starting encrypted database backup process"
log "Target: $BACKUP_TARGET_DIR/$BACKUP_FILENAME"

# Create secure .pgpass file for database authentication
PGPASS_FILE=$(mktemp -t .pgpass.XXXXXX)
chmod 600 "$PGPASS_FILE"
echo "${POSTGRES_HOST}:5432:${POSTGRES_DB}:${POSTGRES_USER}:${POSTGRES_PASSWORD}" > "$PGPASS_FILE"
export PGPASSFILE="$PGPASS_FILE"

# Cleanup function
cleanup() {
    rm -f "$PGPASS_FILE"
}
trap cleanup EXIT ERR

START_TS=$(date +%s)

# Perform encrypted backup (no intermediate files)
log "Running pg_dump → gpg → $BACKUP_FILENAME"

# gpg: use --passphrase-fd 3 with file descriptor
# This keeps stdin free for pg_dump pipe and avoids process list exposure
# Note: --format=custom includes built-in compression (no --compress flag needed)
pg_dump \
    -h "$POSTGRES_HOST" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --no-password \
    --format=custom \
    --no-owner \
    --no-privileges \
    | gpg --symmetric --cipher-algo AES256 --armor --batch \
        --passphrase-fd 3 --pinentry-mode loopback \
        --output "$BACKUP_TARGET_DIR/$BACKUP_FILENAME" \
        3<<<"$DB_BACKUP_PASSPHRASE"

# Verify encrypted file was created
if [ ! -f "$BACKUP_TARGET_DIR/$BACKUP_FILENAME" ] || [ ! -s "$BACKUP_TARGET_DIR/$BACKUP_FILENAME" ]; then
    log "ERROR: Encrypted backup file is missing or empty"
    exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_TARGET_DIR/$BACKUP_FILENAME" | cut -f1)
log "Encrypted backup created successfully. Size: $BACKUP_SIZE"

# Generate SHA256 checksum for integrity verification
log "Generating SHA256 checksum"
cd "$BACKUP_TARGET_DIR"
sha256sum "$BACKUP_FILENAME" > "$CHECKSUM_FILENAME"

if [ ! -f "$CHECKSUM_FILENAME" ]; then
    log "WARNING: Failed to generate checksum file"
else
    log "Checksum file created: $CHECKSUM_FILENAME"
fi

END_TS=$(date +%s)
ELAPSED=$((END_TS - START_TS))

log "Encrypted backup completed successfully in ${ELAPSED}s"
log "Encrypted file: $BACKUP_TARGET_DIR/$BACKUP_FILENAME"
log "Checksum file: $BACKUP_TARGET_DIR/$CHECKSUM_FILENAME"
log "Encryption method: gpg (symmetric AES256)"

# Security reminder
log "REMINDER: This backup is encrypted with DB_BACKUP_PASSPHRASE"
log "Store the passphrase securely - backups cannot be restored without it"
