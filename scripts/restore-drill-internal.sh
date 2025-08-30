#!/bin/sh
# Internal restore drill: run inside db-backup container
# - Without args: picks latest backup and (by default) posts Slack
# - With a filename arg: restores that file; Slack can be suppressed with DRILL_NOTIFY=false
set -eu

log() { printf "%s %s\n" "[$(date +%F_%T)]" "$*"; }

notify_slack() {
  msg="$1"
  [ "${DRILL_NOTIFY:-true}" = "true" ] || return 0
  if [ -n "${SLACK_BOT_TOKEN:-}" ] && [ -n "${SLACK_CHANNEL_ID:-}" ]; then
    curl -sS https://slack.com/api/chat.postMessage \
      -H "Authorization: Bearer ${SLACK_BOT_TOKEN}" \
      -H "Content-type: application/json; charset=utf-8" \
      --data "{\"channel\":\"${SLACK_CHANNEL_ID}\",\"text\":\"$msg\"}" >/dev/null || true
  fi
}

TMP_DB="restore_drill_$(date +%Y%m%d_%H%M%S)"
SRC_PREFIX="elastx:${SWIFT_CONTAINER}/${SWIFT_PREFIX:-backups}"

log "Starting restore drill into $TMP_DB"
FILE_ARG="${1:-}"
if [ -n "$FILE_ARG" ]; then
  LATEST="$FILE_ARG"
  # Basic existence check
  if ! rclone lsf "$SRC_PREFIX" --include "$LATEST" | grep -qx "$LATEST"; then
    log "Specified backup not found: $LATEST"
    exit 1
  fi
else
  LATEST=$(rclone lsf "$SRC_PREFIX" --format tp --csv --separator "," | sort -t, -k1,1r | head -n1 | cut -d, -f2 || true)
  if [ -z "$LATEST" ]; then
    log "No backups found; aborting drill."
    notify_slack ":warning: Restore drill skipped (no backups found)."
    exit 0
  fi
fi

log "Creating temp DB and restoring..."
PGPASSWORD="$POSTGRES_PASSWORD" createdb -h "$POSTGRES_HOST" -U "$POSTGRES_USER" "$TMP_DB"
trap 'PGPASSWORD="$POSTGRES_PASSWORD" dropdb -h "$POSTGRES_HOST" -U "$POSTGRES_USER" "$TMP_DB" >/dev/null 2>&1 || true' EXIT

rclone cat "$SRC_PREFIX/$LATEST" | gunzip -c | PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$TMP_DB" --quiet

OUT=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$TMP_DB" -At -c "SELECT 'tables', count(*) FROM information_schema.tables WHERE table_schema IN ('public','drizzle');")

log "Restore drill OK: $LATEST -> $TMP_DB => $OUT"
notify_slack ":white_check_mark: Restore drill OK. Backup $LATEST restored to temp DB and verified ($OUT)."

exit 0
