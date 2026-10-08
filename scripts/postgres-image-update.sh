#!/bin/bash

# Applies a PostgreSQL minor/patch image change from docker-compose.yml to the
# running db container.
#
# Routine deploys (update.sh) deliberately never recreate PostgreSQL, so a new
# db image in docker-compose.yml only takes effect when this script runs. It
# is started by .github/workflows/postgres_image_update.yml (staging first,
# production after environment approval) and can also be run on the VPS.
# See "PostgreSQL image updates" in docs/deployment-guide.md.
#
# The db image is the only thing it changes. It refuses, before any
# downtime, when:
# - the target is another PostgreSQL major version (that needs pg_upgrade or
#   dump/restore and is a planned migration, never automatic);
# - anything else in the db service configuration, or the volume and network
#   it resolves to, differs from the running container, because recreating
#   the container would apply that change too;
# - Compose plans anything besides recreating the db container (for example
#   replacing a network whose options changed);
# - the image changes glibc, whose collations order text indexes;
# - production cannot first take and validate a fresh encrypted backup.
#
# Downtime is one PostgreSQL fast shutdown and start, normally seconds. The
# restart itself cannot be interrupted by a dropped SSH session or cancelled
# run. The replaced image is tagged matkassen-postgres-rollback:previous so no
# cleanup removes it. If anything fails after the restart begins, the script
# prints the database logs and the command that recreates the container on
# that image. It never rolls back on its own. A re-run when PostgreSQL already
# runs the target image repeats the verification instead of restarting.
#
# Optional environment:
#   ENV_NAME                  must match ENV_NAME in .env when set
#   EXPECTED_DB_IMAGE         refuse unless docker-compose.yml on this host
#                             specifies exactly this image
#   EXPECTED_DB_IMAGE_DIGEST  repository@sha256 digest that staging tested;
#                             pulled and tagged as the configured image so
#                             production runs exactly what staging ran
#
# The last line of a successful run is
#   POSTGRES_IMAGE_RESULT image=<reference> digest=<repository@sha256:...>
# which the workflow passes from the staging job to the production job.

set -Eeuo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/matkassen}"
LOCK_FILE="${LOCK_FILE:-/tmp/matkassen-deploy.lock}"
MIN_ROOT_KB=$((5 * 1024 * 1024))
IMAGE_PATTERN='^[a-z0-9][a-z0-9._/-]*:[A-Za-z0-9_][A-Za-z0-9._-]*$'
DIGEST_PATTERN='^[a-z0-9][a-z0-9._/-]*@sha256:[0-9a-f]{64}$'
# Local-only tag outside the postgres repository, so neither update.sh's
# retention nor the dangling-image prune can remove the image to go back to.
ROLLBACK_IMAGE="matkassen-postgres-rollback:previous"

# Shares update.sh's lock so a deploy and a database update never overlap.
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    echo "❌ A deployment or database update is already in progress. Exiting."
    exit 1
fi

RESTART_STARTED=0
SUCCEEDED=0
ROLLBACK_COMMAND=""

fail() {
    echo "❌ $1"
    exit 1
}

on_exit() {
    local rc=$?
    if [ "$rc" -ne 0 ] && [ "$RESTART_STARTED" -eq 1 ] && [ "$SUCCEEDED" -eq 0 ]; then
        echo ""
        echo "❌ The PostgreSQL update failed after the restart began."
        echo "Database container state and recent logs:"
        sudo docker compose ps -a db || true
        sudo docker compose logs --tail 100 db || true
        echo ""
        echo "The previous image is kept as $ROLLBACK_IMAGE. If PostgreSQL does not"
        echo "recover, recreate it on that image (same major version and data volume)"
        echo "from $APP_DIR with:"
        echo "  $ROLLBACK_COMMAND"
        echo "Then check https://<domain>/api/health and the web container."
    fi
}
trap on_exit EXIT

# Runs one SQL statement as the application role inside the db container.
# Credentials come from the container's own environment and are never printed,
# so the single-quoted variables must expand inside the container.
# shellcheck disable=SC2016
db_sql() {
    local seconds=$1
    local sql=$2
    timeout "$seconds" sudo docker compose exec -T db bash -c \
        'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"' \
        _ "$sql"
}

# Reads one variable from an image's configuration (not from a container,
# whose environment holds credentials).
image_env() {
    sudo docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$1" \
        | sed -n "s/^$2=//p"
}

# shellcheck disable=SC2016 # $PGDATA expands inside the container.
db_data_major() {
    sudo docker compose exec -T db bash -c 'cat "$PGDATA/PG_VERSION"' | tr -d '[:space:]'
}

db_server_version() {
    db_sql 30 "SHOW server_version" | awk '{ print $1 }'
}

# Volumes (by resolved name), bind mounts and networks of a container, or of
# the db service as docker-compose.yml would create it now. The service hash
# does not cover top-level volume or network names, so a renamed volume would
# otherwise pass preflight and start PostgreSQL on an empty data directory.
container_storage() {
    sudo docker inspect --format '{{range .Mounts}}{{.Type}} {{if eq .Type "volume"}}{{.Name}}{{else}}{{.Source}}{{end}} {{.Destination}}{{println}}{{end}}{{range $name, $_ := .NetworkSettings.Networks}}network {{$name}}{{println}}{{end}}' "$1" \
        | sed '/^$/d' | sort
}

# The rendered configuration holds credentials; only names and paths leave
# the Python filter.
configured_storage() {
    sudo docker compose config --format json db | python3 -c '
import json, sys
config = json.load(sys.stdin)
db = config["services"]["db"]
volumes = config.get("volumes") or {}
networks = config.get("networks") or {}
lines = []
for mount in db.get("volumes") or []:
    source = mount.get("source", "")
    if mount.get("type") == "volume":
        source = (volumes.get(source) or {}).get("name") or source
    lines.append("%s %s %s" % (mount.get("type"), source, mount.get("target")))
for network in db.get("networks") or {}:
    lines.append("network %s" % ((networks.get(network) or {}).get("name") or network))
print("\n".join(sorted(lines)))
'
}

web_is_healthy() {
    local body
    body=$(sudo docker compose exec -T web curl -fsS --max-time 10 http://localhost:3000/api/health 2>/dev/null) \
        || return 1
    printf '%s' "$body" | python3 -c '
import json, sys
health = json.load(sys.stdin)
ok = health.get("status") == "healthy" and health.get("checks", {}).get("database") == "ok"
sys.exit(0 if ok else 1)
' 2>/dev/null
}

# glibc version of an image. Text indexes use the libc collation, so a new
# glibc can change sort order and silently invalidate them.
glibc_version() {
    sudo docker run --rm --network none --entrypoint ldd "$1" --version | awk 'NR == 1 { print $NF }'
}

# Asks Compose what recreating db would do, without doing it. Compose also
# reconciles the networks and volumes db uses: for a network whose options
# changed it would stop db and then fail to replace the network that web still
# uses, leaving PostgreSQL down. Only a plan that recreates the db container
# and nothing else passes. Compose v5 reports the action in "text", v2 in
# "status".
compose_plans_db_recreate_only() {
    local plan
    if ! plan=$(sudo docker compose --progress json --dry-run up -d --no-deps --force-recreate --pull never db 2>&1); then
        printf '%s\n' "$plan"
        return 1
    fi
    if ! printf '%s\n' "$plan" | python3 -c '
import json, re, sys
container = re.compile(r"Container (?:[0-9a-f]+_)?%s$" % re.escape(sys.argv[1]))
allowed = {"Recreate", "Recreated", "Starting", "Started"}
recreate = False
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        event = json.loads(line)
    except ValueError:
        event = None
    if not isinstance(event, dict):
        sys.exit("unexpected output: " + line)
    if event.get("level") == "warning":
        continue
    action = event.get("text") or event.get("status")
    if not container.match(event.get("id", "")) or action not in allowed:
        sys.exit("unexpected step: %s %s" % (event.get("id"), action))
    recreate = recreate or action == "Recreate"
if not recreate:
    sys.exit("the plan does not recreate the db container")
' "$DB_CONTAINER_NAME"; then
        printf '%s\n' "$plan"
        return 1
    fi
}

# Checks that PostgreSQL in the given container runs the target image on the
# existing data. Used after a restart and when a re-run finds nothing to do.
verify_db_serves_target() {
    local container=$1
    local version
    [ "$(sudo docker inspect --format '{{.Config.Image}}' "$container")" = "$TARGET_IMAGE" ] \
        || fail "The db container does not use $TARGET_IMAGE."
    [ "$(sudo docker inspect --format '{{.Image}}' "$container")" = "$TARGET_IMAGE_ID" ] \
        || fail "The db container does not run image $TARGET_IMAGE_ID."
    [ "$(sudo docker inspect --format '{{.State.Health.Status}}' "$container")" = "healthy" ] \
        || fail "PostgreSQL is not healthy."
    [ "$(container_storage "$container")" = "$RUNNING_STORAGE" ] \
        || fail "The db container does not use the same data volume and network."
    [ "$(db_data_major)" = "$DATA_MAJOR" ] || fail "The data directory major version changed."
    version=$(db_server_version)
    [ "$version" = "$TARGET_VERSION" ] || fail "PostgreSQL reports $version, expected $TARGET_VERSION."
    [ "$(db_sql 30 "SELECT to_regclass('public.households') IS NOT NULL")" = "t" ] \
        || fail "The application schema (households table) is missing."
    echo "✅ PostgreSQL $version serves the existing data volume and application schema."
}

# Watches the db container for a short while: it must stay the same healthy
# container without restarting. Both paths run this before reporting success,
# so an intermittently restarting database cannot pass on a lucky re-run.
verify_db_stable() {
    local container=$1
    local restarts
    restarts=$(sudo docker inspect --format '{{.RestartCount}}' "$container")
    echo "Checking once more for restart loops..."
    sleep 15
    [ "$(sudo docker compose ps -q db)" = "$container" ] || fail "The db container changed during the stability check."
    [ "$(sudo docker inspect --format '{{.State.Health.Status}}' "$container")" = "healthy" ] \
        || fail "PostgreSQL is not healthy after the stability check."
    [ "$(sudo docker inspect --format '{{.RestartCount}}' "$container")" = "$restarts" ] \
        || fail "PostgreSQL restarted during the stability check."
    echo "✅ PostgreSQL stayed up and healthy."
}

# Checks that web and, on production, the backup scheduler reach PostgreSQL.
verify_clients() {
    local attempt backup_container
    echo "Waiting for web to report a healthy database connection..."
    for attempt in $(seq 1 30); do
        if web_is_healthy; then
            break
        fi
        [ "$attempt" -lt 30 ] || fail "Web did not report healthy within 90 seconds."
        sleep 3
    done
    echo "✅ Web reports a healthy database connection."
    if [ "$HOST_ENV_NAME" = "production" ]; then
        backup_container=$("${BACKUP_COMPOSE[@]}" ps -q db-backup)
        [ -n "$backup_container" ] || fail "The db-backup container is not running."
        # shellcheck disable=SC2016 # Variables expand inside the backup container.
        "${BACKUP_COMPOSE[@]}" exec -T db-backup sh -c 'pg_isready -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
            || fail "The backup container cannot reach PostgreSQL."
        echo "✅ The backup container reaches PostgreSQL."
    fi
}

cd "$APP_DIR"
BACKUP_COMPOSE=(sudo docker compose --env-file "$APP_DIR/.env" -f "$APP_DIR/docker-compose.yml" -f "$APP_DIR/docker-compose.backup.yml" --profile backup)

echo "=== Preflight (nothing is changed in this phase) ==="
sudo systemctl is-active --quiet docker || fail "Docker is not active."

HOST_ENV_NAME=$(sed -n 's/^ENV_NAME="\{0,1\}\([a-z]*\)"\{0,1\}$/\1/p' "$APP_DIR/.env")
case "$HOST_ENV_NAME" in
    staging | production) ;;
    *) fail "Could not read ENV_NAME (staging or production) from $APP_DIR/.env." ;;
esac
if [ -n "${ENV_NAME:-}" ] && [ "$ENV_NAME" != "$HOST_ENV_NAME" ]; then
    fail "This host is $HOST_ENV_NAME, but the caller expected $ENV_NAME."
fi
echo "Environment: $HOST_ENV_NAME (checkout $(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown))"

DB_CONTAINER=$(sudo docker compose ps -q db)
[ -n "$DB_CONTAINER" ] || fail "PostgreSQL container is not running."
[ "$(sudo docker inspect --format '{{.State.Health.Status}}' "$DB_CONTAINER")" = "healthy" ] \
    || fail "PostgreSQL container is not healthy; fix that before updating its image."
WEB_CONTAINER=$(sudo docker compose ps -q web)
[ -n "$WEB_CONTAINER" ] || fail "Web container is not running."
web_is_healthy || fail "Web is not healthy before the update; fix that first so the result can be verified."
WEB_RESTARTS_BEFORE=$(sudo docker inspect --format '{{.RestartCount}}' "$WEB_CONTAINER")

DB_CONTAINER_NAME=$(sudo docker inspect --format '{{.Name}}' "$DB_CONTAINER")
DB_CONTAINER_NAME=${DB_CONTAINER_NAME#/}
RUNNING_IMAGE=$(sudo docker inspect --format '{{.Config.Image}}' "$DB_CONTAINER")
RUNNING_IMAGE_ID=$(sudo docker inspect --format '{{.Image}}' "$DB_CONTAINER")
RUNNING_STORAGE=$(container_storage "$DB_CONTAINER")
TARGET_IMAGE=$(sudo docker compose config --images db)
[[ "$RUNNING_IMAGE" =~ $IMAGE_PATTERN ]] || fail "Unexpected running image reference: $RUNNING_IMAGE"
[[ "$TARGET_IMAGE" =~ $IMAGE_PATTERN ]] \
    || fail "docker-compose.yml must pin db to repository:tag (got $TARGET_IMAGE)."
TARGET_REPOSITORY=${TARGET_IMAGE%:*}
echo "Running image:    $RUNNING_IMAGE ($RUNNING_IMAGE_ID)"
echo "Configured image: $TARGET_IMAGE"
if [ -n "${EXPECTED_DB_IMAGE:-}" ] && [ "$EXPECTED_DB_IMAGE" != "$TARGET_IMAGE" ]; then
    fail "This host's checkout configures $TARGET_IMAGE, but staging applied $EXPECTED_DB_IMAGE. Deploy the same release to both environments first."
fi

# Recreating the container applies the whole db service definition. Render it
# with the running image swapped back in: if that matches the running
# container's Compose hash, the image is the only thing that will change.
RUNNING_CONFIG_HASH=$(sudo docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$DB_CONTAINER")
CONFIG_HASH_WITH_RUNNING_IMAGE=$(printf 'services: {db: {image: "%s"}}\n' "$RUNNING_IMAGE" \
    | sudo docker compose -f "$APP_DIR/docker-compose.yml" -f - config --hash db \
    | awk '$1 == "db" { print $2 }')
if [ -z "$RUNNING_CONFIG_HASH" ] || [ "$RUNNING_CONFIG_HASH" != "$CONFIG_HASH_WITH_RUNNING_IMAGE" ]; then
    fail "The db service configuration differs from the running container in more than its image (volumes, environment, ports, healthcheck, ...). Recreating it would apply those changes too; plan that as an infrastructure change instead."
fi
if [ -z "$RUNNING_STORAGE" ] || [ "$(configured_storage)" != "$RUNNING_STORAGE" ]; then
    fail "The db service would use a different volume or network than the running container. Recreating it could start PostgreSQL on an empty data directory; refusing."
fi
echo "✅ The image is the only pending change to the db service."

AVAILABLE_ROOT_KB=$(df -Pk / | awk 'NR == 2 { print $4 }')
if [ -z "$AVAILABLE_ROOT_KB" ] || [ "$AVAILABLE_ROOT_KB" -lt "$MIN_ROOT_KB" ]; then
    df -h /
    fail "Less than 5 GiB is available on the root filesystem."
fi

echo "Pulling the target image (PostgreSQL keeps running)..."
if [ -n "${EXPECTED_DB_IMAGE_DIGEST:-}" ]; then
    [[ "$EXPECTED_DB_IMAGE_DIGEST" =~ $DIGEST_PATTERN ]] \
        || fail "EXPECTED_DB_IMAGE_DIGEST is not a repository@sha256 digest."
    [ "${EXPECTED_DB_IMAGE_DIGEST%@*}" = "$TARGET_REPOSITORY" ] \
        || fail "EXPECTED_DB_IMAGE_DIGEST is for another repository than $TARGET_REPOSITORY."
    timeout 900 sudo docker pull "$EXPECTED_DB_IMAGE_DIGEST"
    sudo docker tag "$EXPECTED_DB_IMAGE_DIGEST" "$TARGET_IMAGE"
else
    timeout 900 sudo docker compose pull db
fi
TARGET_IMAGE_ID=$(sudo docker image inspect --format '{{.Id}}' "$TARGET_IMAGE")
TARGET_DIGESTS=$(sudo docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$TARGET_IMAGE")
if [ -n "${EXPECTED_DB_IMAGE_DIGEST:-}" ]; then
    TARGET_DIGEST=$EXPECTED_DB_IMAGE_DIGEST
    printf '%s\n' "$TARGET_DIGESTS" | grep -qxF "$TARGET_DIGEST" \
        || fail "$TARGET_IMAGE does not resolve to the tested digest $TARGET_DIGEST."
else
    TARGET_DIGEST=$(printf '%s\n' "$TARGET_DIGESTS" \
        | awk -v prefix="$TARGET_REPOSITORY@sha256:" 'index($0, prefix) == 1 { print; exit }')
fi
[[ "$TARGET_DIGEST" =~ $DIGEST_PATTERN ]] || fail "Could not determine the registry digest of $TARGET_IMAGE."
echo "Target digest: $TARGET_DIGEST"

TARGET_MAJOR=$(image_env "$TARGET_IMAGE" PG_MAJOR)
TARGET_PG_VERSION=$(image_env "$TARGET_IMAGE" PG_VERSION)
TARGET_VERSION=${TARGET_PG_VERSION%%-*}
TARGET_PGDATA=$(image_env "$TARGET_IMAGE" PGDATA)
RUNNING_PGDATA=$(image_env "$RUNNING_IMAGE_ID" PGDATA)
DATA_MAJOR=$(db_data_major)
RUNNING_VERSION=$(db_server_version)
[[ "$TARGET_MAJOR" =~ ^[0-9]+$ ]] && [[ "$TARGET_VERSION" =~ ^[0-9]+\.[0-9]+$ ]] \
    || fail "$TARGET_IMAGE does not look like an official PostgreSQL image (PG_MAJOR/PG_VERSION missing)."
[[ "$DATA_MAJOR" =~ ^[0-9]+$ ]] || fail "Could not read the data directory's PG_VERSION."
echo "PostgreSQL $RUNNING_VERSION (data directory major $DATA_MAJOR) -> $TARGET_VERSION"
if [ "$TARGET_MAJOR" != "$DATA_MAJOR" ]; then
    fail "Refusing a major version change ($DATA_MAJOR -> $TARGET_MAJOR). That needs pg_upgrade or dump/restore as a planned migration; this script only applies minor/patch updates."
fi
if [ -z "$TARGET_PGDATA" ] || [ "$TARGET_PGDATA" != "$RUNNING_PGDATA" ]; then
    fail "The target image keeps its data in '$TARGET_PGDATA' instead of '$RUNNING_PGDATA'; refusing."
fi
if [ "${TARGET_VERSION#*.}" -lt "${RUNNING_VERSION#*.}" ] 2>/dev/null; then
    echo "⚠️ This is a minor-version downgrade. Storage is compatible within a major version."
fi

if [ "$RUNNING_IMAGE" = "$TARGET_IMAGE" ] && [ "$RUNNING_IMAGE_ID" = "$TARGET_IMAGE_ID" ]; then
    # Also the path a re-run takes after an interrupted or failed run, so the
    # result is only reported once everything checks out again.
    echo "PostgreSQL already runs $TARGET_IMAGE; verifying instead of restarting."
    verify_db_serves_target "$DB_CONTAINER"
    verify_clients
    verify_db_stable "$DB_CONTAINER"
    echo "✅ PostgreSQL already runs $TARGET_IMAGE ($TARGET_DIGEST). Nothing to restart."
    echo "POSTGRES_IMAGE_RESULT image=$TARGET_IMAGE digest=$TARGET_DIGEST"
    exit 0
fi

RUNNING_GLIBC=$(glibc_version "$RUNNING_IMAGE_ID")
TARGET_GLIBC=$(glibc_version "$TARGET_IMAGE")
[ -n "$RUNNING_GLIBC" ] && [ -n "$TARGET_GLIBC" ] || fail "Could not determine the images' glibc versions."
if [ "$RUNNING_GLIBC" != "$TARGET_GLIBC" ]; then
    fail "The target image changes glibc from $RUNNING_GLIBC to $TARGET_GLIBC, which can change text sort order and invalidate indexes. Plan that with a REINDEX instead."
fi
echo "✅ glibc stays at $TARGET_GLIBC, so text collation is unchanged."

if ! compose_plans_db_recreate_only; then
    fail "Compose would change more than the db container (see its plan above); refusing."
fi
echo "✅ Compose plans to recreate only the db container."

if [ "$HOST_ENV_NAME" = "production" ]; then
    echo "=== Fresh backup before the restart ==="
    BACKUP_CONTAINER=$("${BACKUP_COMPOSE[@]}" ps -q db-backup)
    [ -n "$BACKUP_CONTAINER" ] || fail "The db-backup container is not running; refusing to restart PostgreSQL without a fresh backup."
    [ "$(sudo docker inspect --format '{{.State.Health.Status}}' "$BACKUP_CONTAINER")" = "healthy" ] \
        || fail "The db-backup container is not healthy; refusing to restart PostgreSQL without a fresh backup."
    # Same script as the nightly job: encrypt, upload, then fully restore into
    # a scratch database. Exits non-zero (and alerts Slack) unless it validated.
    if ! timeout 1800 "${BACKUP_COMPOSE[@]}" exec -T db-backup /usr/local/bin/backup-db.sh; then
        fail "The pre-update backup failed or did not validate. PostgreSQL was not touched."
    fi
    echo "✅ Fresh encrypted backup uploaded and restore-validated."
else
    echo "ℹ️ Staging keeps no database backups by policy; continuing without one."
fi

# Pulling a rebuilt tag can leave the running image untagged, and the next
# dangling-image prune would delete it once it stops. Pin it first.
sudo docker tag "$RUNNING_IMAGE_ID" "$ROLLBACK_IMAGE"
# The recovery command waits for the host lock, which a restart still running
# after this script died keeps holding, and allows the same shutdown time.
ROLLBACK_COMMAND="echo 'services: {db: {image: \"$ROLLBACK_IMAGE\"}}' | flock $LOCK_FILE sudo docker compose -f docker-compose.yml -f - up -d --no-deps --force-recreate --pull never --wait --timeout 60 db"
echo "=== Restarting PostgreSQL on $TARGET_IMAGE ==="
echo "Previous image $RUNNING_IMAGE ($RUNNING_IMAGE_ID) is kept as $ROLLBACK_IMAGE."
echo "Recovery command if needed: $ROLLBACK_COMMAND"

# A checkpoint now leaves little for the shutdown checkpoint to flush, which
# keeps the downtime short. Best effort: the shutdown checkpoint is still safe.
if ! db_sql 60 "CHECKPOINT" >/dev/null; then
    echo "⚠️ CHECKPOINT failed or timed out; continuing (shutdown will checkpoint)."
fi

# Compose stops the old container before it starts the new one. If it died in
# between (a broken pipe when the SSH session drops or the run is cancelled,
# or a hangup when an interactive terminal closes), the new container would
# stay "Created" and PostgreSQL would stay down. So it runs in its own session
# with its output in a file, and always finishes; the output is shown after.
# There is deliberately no outer timeout to kill it halfway either: Compose
# bounds the shutdown (--timeout) and the health wait (--wait-timeout) itself.
RESTART_LOG=$(mktemp)
RESTART_STARTED=1
RESTART_STARTED_AT=$(date +%s)
RESTART_OK=1
setsid --wait sudo docker compose up -d --no-deps --force-recreate --pull never \
    --wait --wait-timeout 240 --timeout 60 db >"$RESTART_LOG" 2>&1 || RESTART_OK=0
cat "$RESTART_LOG"
rm -f "$RESTART_LOG"
[ "$RESTART_OK" -eq 1 ] || fail "PostgreSQL did not become healthy on $TARGET_IMAGE."
echo "✅ PostgreSQL is healthy again after $(($(date +%s) - RESTART_STARTED_AT))s."

echo "=== Verification ==="
NEW_DB_CONTAINER=$(sudo docker compose ps -q db)
[ -n "$NEW_DB_CONTAINER" ] && [ "$NEW_DB_CONTAINER" != "$DB_CONTAINER" ] \
    || fail "The db container was not recreated."
verify_db_serves_target "$NEW_DB_CONTAINER"
verify_clients
[ "$(sudo docker compose ps -q web)" = "$WEB_CONTAINER" ] || fail "The web container changed during the update."
WEB_RESTARTS_AFTER=$(sudo docker inspect --format '{{.RestartCount}}' "$WEB_CONTAINER")
[ "$WEB_RESTARTS_AFTER" = "$WEB_RESTARTS_BEFORE" ] \
    || fail "The web container restarted during the update ($WEB_RESTARTS_BEFORE -> $WEB_RESTARTS_AFTER)."
if [ "$HOST_ENV_NAME" = "production" ]; then
    [ "$("${BACKUP_COMPOSE[@]}" ps -q db-backup)" = "$BACKUP_CONTAINER" ] \
        || fail "The db-backup container changed during the update."
fi
echo "✅ Web and the backup scheduler kept running through the restart."

[ "$(sudo docker inspect --format '{{.RestartCount}}' "$NEW_DB_CONTAINER")" = "0" ] \
    || fail "PostgreSQL restarted after the update."
verify_db_stable "$NEW_DB_CONTAINER"
SUCCEEDED=1

# An SMS claimed just before the restart may be left in 'sending'. Reminders
# recover automatically after 10 minutes; enrollment and cancellation messages
# wait for manual review (docs/business-logic.md).
if SENDING=$(db_sql 30 "SELECT count(*) FROM outgoing_sms WHERE status = 'sending'") && [ "$SENDING" != "0" ]; then
    echo "⚠️ $SENDING SMS row(s) are in 'sending'. Check them in a few minutes; see docs/business-logic.md."
fi

echo "✅ PostgreSQL now runs $TARGET_IMAGE ($TARGET_DIGEST)."
echo "POSTGRES_IMAGE_RESULT image=$TARGET_IMAGE digest=$TARGET_DIGEST"
