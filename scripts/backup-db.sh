#!/bin/bash

# PostgreSQL backup script for Elastx Object Store using rclone
# Performs pg_dump and uploads to OpenStack Swift with retention management

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

trap 'notify_slack failure "Database backup failed (see logs)"' ERR

# Configuration
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="matkassen_backup_${TIMESTAMP}.sql.gz"
TEMP_DIR="/tmp/backups"
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
PREFIX=${SWIFT_PREFIX:-backups}
RCLONE_REMOTE="elastx:${SWIFT_CONTAINER}/${PREFIX}"

# Ensure temp directory exists
mkdir -p "$TEMP_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

START_TS=$(date +%s)
log "Starting PostgreSQL backup process"

# Perform database dump
log "Creating database dump: $BACKUP_FILENAME"
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h "$POSTGRES_HOST" \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    --no-password \
    --format=plain \
    --no-owner \
    --no-privileges \
    | gzip > "$TEMP_DIR/$BACKUP_FILENAME"

# Check if dump was successful
if [ ! -f "$TEMP_DIR/$BACKUP_FILENAME" ] || [ ! -s "$TEMP_DIR/$BACKUP_FILENAME" ]; then
    log "ERROR: Database dump failed or is empty"
    exit 1
fi

BACKUP_SIZE_BYTES=$(stat -c %s "$TEMP_DIR/$BACKUP_FILENAME" 2>/dev/null || stat -f %z "$TEMP_DIR/$BACKUP_FILENAME")
BACKUP_SIZE=$(du -h "$TEMP_DIR/$BACKUP_FILENAME" | cut -f1)
log "Database dump completed successfully. Size: $BACKUP_SIZE"

# Upload to Elastx Object Store using rclone
log "Uploading backup to Elastx Object Store container: $SWIFT_CONTAINER"
rclone copy "$TEMP_DIR/$BACKUP_FILENAME" "$RCLONE_REMOTE" \
    --progress \
    --stats-one-line \
    --stats=30s

if [ $? -eq 0 ]; then
    log "Backup uploaded successfully to Object Store"
    # Clean up local temp file
    rm -f "$TEMP_DIR/$BACKUP_FILENAME"
else
    log "ERROR: Failed to upload backup to Object Store"
    exit 1
fi

# Clean up old backups using rclone's built-in retention
log "Cleaning up backups older than $RETENTION_DAYS days"
rclone delete "$RCLONE_REMOTE" \
    --min-age "${RETENTION_DAYS}d" \
    --include "matkassen_backup_*.sql.gz" \
    --dry-run=false

if [ $? -eq 0 ]; then
    log "Old backups cleaned up successfully"
else
    log "WARNING: Failed to clean up old backups"
fi

# Restore drill right after upload (always on)
DRILL_STATUS="failure"
log "Running post-backup restore drill..."
if DRILL_NOTIFY=false /usr/local/bin/restore-drill-internal.sh "$BACKUP_FILENAME" 2>&1 | sed 's/^/[drill] /'; then
    DRILL_STATUS="success"
else
    DRILL_STATUS="failure"
fi

# Show current backup status
BACKUP_COUNT=$(rclone lsf "$RCLONE_REMOTE" --include "matkassen_backup_*.sql.gz" | wc -l)
TOTAL_SIZE=$(rclone size "$RCLONE_REMOTE" --include "matkassen_backup_*.sql.gz" --json | grep -o '"bytes":[0-9]*' | cut -d: -f2)
TOTAL_SIZE_HUMAN=$(rclone size "$RCLONE_REMOTE" --include "matkassen_backup_*.sql.gz" | grep "Total size" | awk '{print $3}')

END_TS=$(date +%s)
ELAPSED=$((END_TS-START_TS))
log "Backup process completed successfully in ${ELAPSED}s"
SUMMARY="Backup success (file: $BACKUP_FILENAME, size: $BACKUP_SIZE, elapsed: ${ELAPSED}s). Drill: ${DRILL_STATUS}."
notify_slack success "$SUMMARY"
log "Current status: $BACKUP_COUNT backups, total size: $TOTAL_SIZE_HUMAN"

# NOTE: Slack notifications require SLACK_BOT_TOKEN and SLACK_CHANNEL_ID
