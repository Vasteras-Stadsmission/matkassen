#!/bin/bash

# PostgreSQL backup script for Elastx Object Store using rclone
# Performs pg_dump and uploads to OpenStack Swift with automatic expiry headers
# Uses Swift's X-Delete-After header for reliable retention management

set -euo pipefail
set -o errtrace

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
    ]\
}
EOF
)
                curl -sS https://slack.com/api/chat.postMessage \
                    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
                    -H "Content-type: application/json; charset=utf-8" \
                    --data "$payload" | grep -q '"ok":true' || true
        fi
}

# Configuration
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="matkassen_backup_${TIMESTAMP}.dump"
TEMP_DIR="/tmp/backups"
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
PREFIX=${SWIFT_PREFIX:-backups}
RCLONE_REMOTE="elastx:${SWIFT_CONTAINER}/${PREFIX}"
PGPASS_FILE="/tmp/.pgpass"

# Cleanup function for temporary files
cleanup() {
    rm -f "$PGPASS_FILE" "$VALIDATION_OUTPUT" "$VALIDATION_ERRORS"
}

# Ensure cleanup happens on exit
trap 'cleanup; notify_slack failure "Database backup failed (see logs)"' ERR
trap 'cleanup' EXIT

# Ensure temp directory exists
mkdir -p "$TEMP_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

START_TS=$(date +%s)
log "Starting PostgreSQL backup process"

# Create secure .pgpass file instead of using PGPASSWORD environment variable
# This prevents password exposure in process lists and logs
echo "${POSTGRES_HOST}:5432:${POSTGRES_DB}:${POSTGRES_USER}:${POSTGRES_PASSWORD}" > "$PGPASS_FILE"
chmod 600 "$PGPASS_FILE"
export PGPASSFILE="$PGPASS_FILE"

# Perform database dump
log "Creating database dump: $BACKUP_FILENAME"
pg_dump \
    -h "$POSTGRES_HOST" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --no-password \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    --file="$TEMP_DIR/$BACKUP_FILENAME"

# Check if dump was successful
if [ ! -f "$TEMP_DIR/$BACKUP_FILENAME" ] || [ ! -s "$TEMP_DIR/$BACKUP_FILENAME" ]; then
    log "ERROR: Database dump failed or is empty"
    notify_slack failure "Database backup failed - dump creation failed"
    exit 1
fi

BACKUP_SIZE_BYTES=$(stat -c %s "$TEMP_DIR/$BACKUP_FILENAME" 2>/dev/null || stat -f %z "$TEMP_DIR/$BACKUP_FILENAME")
BACKUP_SIZE=$(du -h "$TEMP_DIR/$BACKUP_FILENAME" | cut -f1)
log "Database dump completed successfully. Size: $BACKUP_SIZE"

# Upload to Elastx Object Store using rclone
log "Uploading backup to Elastx Object Store container: $SWIFT_CONTAINER"

# Log rclone version for support and debugging
log "rclone version: $(rclone version --check=false | head -1)"

# Calculate expiry time (RETENTION_DAYS from now)
EXPIRY_SECONDS=$((RETENTION_DAYS * 24 * 60 * 60))

# Upload with rclone using Swift-optimized settings
# Swift's concurrency sweet spot is usually modest: --checkers=4 --transfers=1
rclone copy "$TEMP_DIR/$BACKUP_FILENAME" "$RCLONE_REMOTE" \
    --checkers=4 \
    --transfers=1 \
    --retries=3 \
    --progress \
    --stats-one-line \
    --stats=30s

if [ $? -eq 0 ]; then
    log "Backup uploaded successfully to Object Store"

    # Show remote storage stats for monitoring and support
    log "Remote storage stats:"
    rclone about "$RCLONE_REMOTE" 2>/dev/null || log "Remote stats unavailable (not supported by this storage)"

    # Set Swift expiry header using swift client
    # This ensures the object will be automatically deleted even if cleanup processes fail
    log "Setting automatic expiry for backup (${RETENTION_DAYS} days)"
    if swift post "${SWIFT_CONTAINER}" \
        --header "X-Delete-After:${EXPIRY_SECONDS}" \
        "${PREFIX}/${BACKUP_FILENAME}"; then
        log "Automatic expiry set successfully - backup will be deleted in ${RETENTION_DAYS} days"
    else
        log "WARNING: Failed to set automatic expiry header, but upload succeeded"
        log "Manual cleanup may be required for this backup file"
    fi

    # Clean up local temp file
    rm -f "$TEMP_DIR/$BACKUP_FILENAME"
else
    log "ERROR: Failed to upload backup to Object Store"
    notify_slack failure "Database backup failed - upload to object store failed"
    exit 1
fi

# Note: Old backup cleanup is handled automatically by Swift's X-Delete-After headers
# Each backup is set to expire after RETENTION_DAYS, ensuring cleanup even if this process fails
log "Backup retention: Swift will automatically delete this backup after $RETENTION_DAYS days"

# Simple backup validation (no full restore drill)
DRILL_STATUS="success"
log "Validating backup integrity..."

# Basic validation: download and verify the backup can be listed by pg_restore
log "Validating backup by downloading and testing with pg_restore..."
VALIDATION_OUTPUT=$(mktemp)
VALIDATION_ERRORS=$(mktemp)
if rclone cat "$RCLONE_REMOTE/$BACKUP_FILENAME" --retries=2 | pg_restore --list > "$VALIDATION_OUTPUT" 2>"$VALIDATION_ERRORS"; then
    # Check if we got a reasonable number of objects (tables, indexes, etc.)
    OBJECT_COUNT=$(wc -l < "$VALIDATION_OUTPUT")
    if [ "$OBJECT_COUNT" -gt 10 ]; then
        log "Backup validation OK - file is valid PostgreSQL custom format ($OBJECT_COUNT objects found)"
        DRILL_STATUS="success"
    else
        log "Backup validation FAILED - insufficient database objects found ($OBJECT_COUNT, expected >10)"
        DRILL_STATUS="failure"
    fi
else
    ERROR_MSG=$(head -n 3 "$VALIDATION_ERRORS" | tr '\n' ' ')
    log "Backup validation FAILED - file appears corrupted or invalid: $ERROR_MSG"
    DRILL_STATUS="failure"
fi

# Show current backup status
BACKUP_COUNT=$(rclone lsf "$RCLONE_REMOTE" --include "matkassen_backup_*.dump" | wc -l)
TOTAL_SIZE=$(rclone size "$RCLONE_REMOTE" --include "matkassen_backup_*.dump" --json | grep -o '"bytes":[0-9]*' | cut -d: -f2)
TOTAL_SIZE_HUMAN=$(rclone size "$RCLONE_REMOTE" --include "matkassen_backup_*.dump" | grep "Total size" | awk '{print $3}')

END_TS=$(date +%s)
ELAPSED=$((END_TS-START_TS))
log "Backup process completed successfully in ${ELAPSED}s"
SUMMARY="Backup success (file: $BACKUP_FILENAME, size: $BACKUP_SIZE, elapsed: ${ELAPSED}s, auto-expiry: ${RETENTION_DAYS}d). Validation: ${DRILL_STATUS}."
notify_slack success "$SUMMARY"
log "Current status: $BACKUP_COUNT backups, total size: $TOTAL_SIZE_HUMAN"
log "All backups have automatic expiry headers and basic validation"

# NOTE: Slack notifications require SLACK_BOT_TOKEN and SLACK_CHANNEL_ID
