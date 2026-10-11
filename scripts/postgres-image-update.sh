#!/bin/bash

# Applies a PostgreSQL minor/patch image change from docker-compose.yml to the
# running db container. Routine deploys never restart PostgreSQL, so this is
# the separate step that does. .github/workflows/postgres_image_update.yml runs
# it on staging and, after approval, on production. See "PostgreSQL Image
# Updates" in docs/deployment-guide.md.
#
# It only replaces the db container's image, and refuses before any downtime
# if more would change: another major version, any other change to the db
# service, its volume or its network, or a different glibc (which can reorder
# text indexes). On production it first takes a fresh, restore-validated
# backup. If the restart or the checks after it fail, it prints the command
# that goes back to the previous image; it never rolls back on its own.
# Re-running it when PostgreSQL already runs the target image only repeats
# the checks.

set -Eeuo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/matkassen}"
LOCK_FILE="${LOCK_FILE:-/tmp/matkassen-deploy.lock}"
# A local tag outside the postgres repository, so no cleanup removes the image
# to go back to (pulling a rebuilt tag can otherwise leave it dangling).
ROLLBACK_IMAGE="matkassen-postgres-rollback:previous"
IMAGE_PATTERN='^[a-z0-9][a-z0-9._/-]*:[A-Za-z0-9_][A-Za-z0-9._-]*$'

# Same lock as update.sh, so a deploy and a database update never overlap.
exec 200>"$LOCK_FILE"
flock -n 200 || { echo "❌ A deployment or database update is already in progress."; exit 1; }

RESTARTED=0
ROLLBACK_COMMAND=""

fail() {
    echo "❌ $1"
    exit 1
}

on_exit() {
    local rc=$?
    if [ "$rc" -ne 0 ] && [ "$RESTARTED" -eq 1 ]; then
        echo ""
        echo "❌ The update failed after PostgreSQL was restarted. State and recent logs:"
        sudo docker compose ps -a db || true
        sudo docker compose logs --tail 100 db || true
        echo ""
        echo "To go back to the previous image (same major version, same data), run in $APP_DIR:"
        echo "  $ROLLBACK_COMMAND"
    fi
}
trap on_exit EXIT

# Runs SQL in the db container with the container's own credentials, which are
# never printed; the single-quoted variables expand inside the container.
# shellcheck disable=SC2016
db_sql() {
    timeout 30 sudo docker compose exec -T db bash -c \
        'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"' \
        _ "$1"
}

# Reads a variable from an image's configuration (a container's environment
# would hold credentials).
image_env() {
    sudo docker image inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$1" | sed -n "s/^$2=//p"
}

glibc_version() {
    sudo docker run --rm --network none --entrypoint ldd "$1" --version | awk 'NR == 1 { print $NF }'
}

# Resolved volume names, mount paths and networks of a container ...
container_storage() {
    sudo docker inspect --format '{{range .Mounts}}{{.Type}} {{if eq .Type "volume"}}{{.Name}}{{else}}{{.Source}}{{end}} {{.Destination}}{{println}}{{end}}{{range $name, $_ := .NetworkSettings.Networks}}network {{$name}}{{println}}{{end}}' "$1" \
        | sed '/^$/d' | sort
}

# ... and of the db service as docker-compose.yml defines it now. The rendered
# configuration holds credentials, so only names and paths leave the filter.
configured_storage() {
    sudo docker compose config --format json db | python3 -c '
import json, sys
config = json.load(sys.stdin)
db = config["services"]["db"]
volumes, networks = config.get("volumes") or {}, config.get("networks") or {}
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

# Compose's dry-run plan must only recreate the db container. A changed
# network, for example, would make Compose stop db and then fail to replace a
# network web still uses. Compose v5 reports the action in "text", v2 in
# "status"; warnings (such as the orphaned backup container) are ignored.
plan_only_recreates_db() {
    local plan
    plan=$(sudo docker compose --progress json --dry-run up -d --no-deps --force-recreate --pull never db 2>&1) \
        && printf '%s\n' "$plan" | python3 -c '
import json, re, sys
container = re.compile(r"Container (?:[0-9a-f]+_)?%s$" % re.escape(sys.argv[1]))
recreate = False
for line in filter(None, (l.strip() for l in sys.stdin)):
    try:
        event = json.loads(line)
    except ValueError:
        sys.exit("unexpected output: " + line)
    if not isinstance(event, dict) or event.get("level") == "warning":
        continue
    action = event.get("text") or event.get("status")
    if not container.match(event.get("id", "")) or action not in ("Recreate", "Recreated", "Starting", "Started"):
        sys.exit("unexpected step: %s %s" % (event.get("id"), action))
    recreate = recreate or action == "Recreate"
sys.exit(0 if recreate else "the plan does not recreate db")
' "$DB_CONTAINER_NAME" && return 0
    printf '%s\n' "$plan"
    return 1
}

web_is_healthy() {
    sudo docker compose exec -T web curl -fsS --max-time 10 http://localhost:3000/api/health 2>/dev/null | python3 -c '
import json, sys
health = json.load(sys.stdin)
sys.exit(0 if health.get("status") == "healthy" and health.get("checks", {}).get("database") == "ok" else 1)
' 2>/dev/null
}

# Checks the running PostgreSQL against the target: image, health, the same
# volume and network, server version, application schema, and web's view.
verify_target() {
    local container version attempt
    container=$(sudo docker compose ps -q db)
    [ -n "$container" ] || fail "PostgreSQL is not running."
    [ "$(sudo docker inspect --format '{{.Image}}' "$container")" = "$TARGET_IMAGE_ID" ] \
        || fail "PostgreSQL does not run $TARGET_IMAGE."
    [ "$(sudo docker inspect --format '{{.State.Health.Status}}' "$container")" = "healthy" ] \
        || fail "PostgreSQL is not healthy."
    [ "$(container_storage "$container")" = "$RUNNING_STORAGE" ] \
        || fail "PostgreSQL does not use the same data volume and network."
    version=$(db_sql "SHOW server_version" | awk '{ print $1 }')
    [ "$version" = "$TARGET_VERSION" ] || fail "PostgreSQL reports $version, expected $TARGET_VERSION."
    [ "$(db_sql "SELECT to_regclass('public.households') IS NOT NULL")" = "t" ] \
        || fail "The households table is missing."
    for attempt in $(seq 1 30); do
        web_is_healthy && break
        [ "$attempt" -lt 30 ] || fail "Web did not report a healthy database within 90 seconds."
        sleep 3
    done
    echo "✅ PostgreSQL $version serves the existing data, and web reports it healthy."
}

cd "$APP_DIR"
HOST_ENV_NAME=$(sed -n 's/^ENV_NAME="\{0,1\}\([a-z]*\)"\{0,1\}$/\1/p' .env)
case "$HOST_ENV_NAME" in
    staging | production) ;;
    *) fail "Could not read ENV_NAME from $APP_DIR/.env." ;;
esac
[ -z "${ENV_NAME:-}" ] || [ "$ENV_NAME" = "$HOST_ENV_NAME" ] || fail "This host is $HOST_ENV_NAME, not $ENV_NAME."

DB_CONTAINER=$(sudo docker compose ps -q db)
[ -n "$DB_CONTAINER" ] || fail "PostgreSQL is not running."
[ "$(sudo docker inspect --format '{{.State.Health.Status}}' "$DB_CONTAINER")" = "healthy" ] \
    || fail "PostgreSQL is not healthy; fix that first."
web_is_healthy || fail "Web is not healthy; fix that first so the result can be checked."

DB_CONTAINER_NAME=$(sudo docker inspect --format '{{.Name}}' "$DB_CONTAINER")
DB_CONTAINER_NAME=${DB_CONTAINER_NAME#/}
RUNNING_IMAGE=$(sudo docker inspect --format '{{.Config.Image}}' "$DB_CONTAINER")
RUNNING_IMAGE_ID=$(sudo docker inspect --format '{{.Image}}' "$DB_CONTAINER")
RUNNING_STORAGE=$(container_storage "$DB_CONTAINER")
TARGET_IMAGE=$(sudo docker compose config --images db)
[[ "$TARGET_IMAGE" =~ $IMAGE_PATTERN ]] || fail "docker-compose.yml must pin db to repository:tag (got $TARGET_IMAGE)."
echo "$HOST_ENV_NAME: PostgreSQL runs $RUNNING_IMAGE; docker-compose.yml specifies $TARGET_IMAGE."

# Recreating applies the whole db service definition. With the running image
# swapped back in, it must hash exactly like the running container, and it
# must resolve to the same volume and network (a renamed volume would start
# PostgreSQL on other or empty data).
RUNNING_HASH=$(sudo docker inspect --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' "$DB_CONTAINER")
HASH_WITH_RUNNING_IMAGE=$(printf 'services: {db: {image: "%s"}}\n' "$RUNNING_IMAGE" \
    | sudo docker compose -f docker-compose.yml -f - config --hash db | awk '$1 == "db" { print $2 }')
[ -n "$RUNNING_HASH" ] && [ "$RUNNING_HASH" = "$HASH_WITH_RUNNING_IMAGE" ] \
    || fail "The db service changed in more than its image. Recreating it would apply that too; plan it as an infrastructure change."
[ -n "$RUNNING_STORAGE" ] && [ "$(configured_storage)" = "$RUNNING_STORAGE" ] \
    || fail "The db service would use a different volume or network than the running container."

echo "Pulling $TARGET_IMAGE (PostgreSQL keeps running)..."
timeout 900 sudo docker compose pull db
TARGET_IMAGE_ID=$(sudo docker image inspect --format '{{.Id}}' "$TARGET_IMAGE")
TARGET_MAJOR=$(image_env "$TARGET_IMAGE" PG_MAJOR)
TARGET_VERSION=$(image_env "$TARGET_IMAGE" PG_VERSION)
TARGET_VERSION=${TARGET_VERSION%%-*}
# shellcheck disable=SC2016 # $PGDATA expands inside the container.
DATA_MAJOR=$(sudo docker compose exec -T db bash -c 'cat "$PGDATA/PG_VERSION"' | tr -d '[:space:]')
[[ "$TARGET_MAJOR" =~ ^[0-9]+$ ]] && [[ "$TARGET_VERSION" =~ ^[0-9]+\.[0-9]+$ ]] \
    || fail "$TARGET_IMAGE does not look like an official PostgreSQL image."
[ "$TARGET_MAJOR" = "$DATA_MAJOR" ] \
    || fail "Refusing a major version change ($DATA_MAJOR -> $TARGET_MAJOR); that needs pg_upgrade or dump/restore as a planned migration."
[ "$(image_env "$TARGET_IMAGE" PGDATA)" = "$(image_env "$RUNNING_IMAGE_ID" PGDATA)" ] \
    || fail "The target image keeps its data in a different directory."

if [ "$RUNNING_IMAGE" = "$TARGET_IMAGE" ] && [ "$RUNNING_IMAGE_ID" = "$TARGET_IMAGE_ID" ]; then
    verify_target
    echo "✅ Already on $TARGET_IMAGE; nothing was restarted."
    exit 0
fi

RUNNING_GLIBC=$(glibc_version "$RUNNING_IMAGE_ID")
TARGET_GLIBC=$(glibc_version "$TARGET_IMAGE")
[ -n "$TARGET_GLIBC" ] && [ "$TARGET_GLIBC" = "$RUNNING_GLIBC" ] \
    || fail "The image changes glibc ($RUNNING_GLIBC -> $TARGET_GLIBC), which can reorder text indexes; plan it with a REINDEX."
plan_only_recreates_db || fail "Compose would change more than the db container (plan above)."
echo "✅ Same major version, glibc, volume and network; only the db container is recreated."

if [ "$HOST_ENV_NAME" = "production" ]; then
    echo "Taking a fresh backup (encrypt, upload, restore-validate)..."
    sudo docker compose -f docker-compose.yml -f docker-compose.backup.yml --profile backup \
        exec -T db-backup /usr/local/bin/backup-db.sh \
        || fail "The backup failed or did not validate; PostgreSQL was not touched."
fi

sudo docker tag "$RUNNING_IMAGE_ID" "$ROLLBACK_IMAGE"
# Waits for the host lock (a restart that outlived this script still holds it)
# and allows the same shutdown time as the update.
ROLLBACK_COMMAND="echo 'services: {db: {image: \"$ROLLBACK_IMAGE\"}}' | flock $LOCK_FILE sudo docker compose -f docker-compose.yml -f - up -d --no-deps --force-recreate --pull never --wait --timeout 60 db"
echo "=== Restarting PostgreSQL on $TARGET_IMAGE; the previous image is kept as $ROLLBACK_IMAGE ==="

# Compose stops the old container before it starts the new one. It runs in its
# own session with its output in a file, so a dropped SSH session or cancelled
# run cannot kill it in between and leave PostgreSQL stopped.
RESTARTED=1
RESTART_LOG=$(mktemp)
RESTART_OK=1
setsid --wait sudo docker compose up -d --no-deps --force-recreate --pull never \
    --wait --wait-timeout 240 --timeout 60 db >"$RESTART_LOG" 2>&1 || RESTART_OK=0
cat "$RESTART_LOG"
rm -f "$RESTART_LOG"
[ "$RESTART_OK" -eq 1 ] || fail "PostgreSQL did not become healthy on $TARGET_IMAGE."

verify_target
RESTARTED=0
echo "✅ PostgreSQL now runs $TARGET_IMAGE."
