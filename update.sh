#!/bin/bash

# This script updates the immutable application-service images while leaving
# PostgreSQL, nginx, journald, and other host configuration untouched.
# It assumes that the app is already set up with Docker and Docker Compose
# Note: The git repository is already up to date (handled by CI/CD workflow).
# It also assumes that the .env file is already created and contains the necessary environment variables.

set -Eeuo pipefail

# Prevent multiple deployments from running simultaneously
LOCK_FILE="/tmp/matkassen-deploy.lock"
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    echo "❌ Another deployment is already in progress. Exiting."
    exit 1
fi
echo "🔒 Deployment lock acquired"

# Notify Slack on deploy failure. Token is only exported by the
# production workflow, so this no-ops on staging and on hosts where
# the env vars aren't set.
notify_slack_failure() {
    local rc=$1
    [ -n "${SLACK_BOT_TOKEN:-}" ] && [ -n "${SLACK_CHANNEL_ID:-}" ] || return 0
    local host
    host=$(hostname)
    local msg="[matkassen] ❌ Deploy failed (exit ${rc}) on ${host}. The running web release may be old or new; PostgreSQL and host configuration were not rolled back. Check GitHub Actions logs."
    curl -sS https://slack.com/api/chat.postMessage \
        -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
        -H "Content-type: application/json; charset=utf-8" \
        --data "{\"channel\":\"${SLACK_CHANNEL_ID}\",\"text\":\"${msg}\"}" \
        | grep -q '"ok":true' || true
}

cleanup() {
    local rc=$?
    echo "🔓 Releasing deployment lock"
    if [ "$rc" -ne 0 ]; then
        notify_slack_failure "$rc"
    fi
}
trap cleanup EXIT

# Script Vars
PROJECT_NAME=matkassen
GITHUB_ORG=vasteras-stadsmission
# Explicit path rather than `~/$PROJECT_NAME`. If any future change runs
# this script via sudo, `~` would resolve to /root instead of the deploy
# user's home. The deploy user is always `ubuntu` per the SSH workflow.
APP_DIR="/home/ubuntu/$PROJECT_NAME"

cleanup_docker_resources() {
    echo "Cleaning up stopped containers and dangling image layers..."
    sudo docker container prune -f
    # Deliberately omit -a: tagged immutable releases remain available for the
    # focused image rollback added in the next release-safety phase.
    sudo docker image prune -f
    sudo docker system df
    echo "✅ Safe Docker cleanup completed"
}

assert_full_sha() {
    [[ "$1" =~ ^[0-9a-f]{40}$ ]] || {
        echo "❌ DEPLOY_SHA must be a full lowercase 40-character Git SHA."
        exit 1
    }
}

container_revision() {
    local container=$1
    local image_id
    image_id=$(sudo docker inspect --format '{{.Image}}' "$container")
    sudo docker image inspect \
        --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
        "$image_id"
}

assert_release_container() {
    local name=$1
    local container=$2
    local expected_image=$3
    local health revision image_reference restarts

    [ -n "$container" ] || { echo "❌ $name container is not running."; exit 1; }
    health=$(sudo docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container")
    revision=$(container_revision "$container")
    image_reference=$(sudo docker inspect --format '{{.Config.Image}}' "$container")
    restarts=$(sudo docker inspect --format '{{.RestartCount}}' "$container")

    [ "$health" = "healthy" ] || { echo "❌ $name container is $health."; exit 1; }
    [ "$revision" = "$DEPLOY_SHA" ] || { echo "❌ $name revision is $revision, expected $DEPLOY_SHA."; exit 1; }
    [ "$image_reference" = "$expected_image" ] || { echo "❌ $name image is $image_reference, expected $expected_image."; exit 1; }
    [ "$restarts" = "0" ] || { echo "❌ $name container restarted $restarts time(s)."; exit 1; }
    echo "✅ $name is healthy on $revision with zero restarts."
}

DEPLOY_SHA="${DEPLOY_SHA:-$(git -C "$APP_DIR" rev-parse HEAD)}"
assert_full_sha "$DEPLOY_SHA"
export APP_IMAGE_TAG="sha-$DEPLOY_SHA"
export DB_BACKUP_IMAGE_TAG="sha-$DEPLOY_SHA"
EXPECTED_APP_IMAGE="ghcr.io/vasteras-stadsmission/matkassen:sha-$DEPLOY_SHA"
EXPECTED_BACKUP_IMAGE="ghcr.io/vasteras-stadsmission/matkassen-db-backup:sha-$DEPLOY_SHA"

sudo systemctl is-active --quiet docker || { echo "❌ Docker is not active."; exit 1; }
sudo systemctl is-active --quiet nginx || { echo "❌ Nginx is not active."; exit 1; }

AVAILABLE_ROOT_KB=$(df -Pk / | awk 'NR == 2 { print $4 }')
MIN_ROOT_KB=$((5 * 1024 * 1024))
if [ -z "$AVAILABLE_ROOT_KB" ] || [ "$AVAILABLE_ROOT_KB" -lt "$MIN_ROOT_KB" ]; then
    echo "❌ Less than 5 GiB is available on the root filesystem."
    df -h /
    exit 1
fi
echo "✅ Root filesystem has at least 5 GiB available."

# Idempotently harden the app directory: owner-only access. Without this,
# a reset of the directory (e.g. a fresh init_deploy re-run) would leave
# the parent at default 755, which lets anyone in the ubuntu group
# unlink/replace .env despite its own 600 perms.
sudo install -d -m 700 -o ubuntu -g ubuntu "$APP_DIR"

# For Docker internal communication ("db" is the name of Postgres container)
DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@db:5432/$POSTGRES_DB"

# For external tools (like Drizzle Studio)
DATABASE_URL_EXTERNAL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/$POSTGRES_DB"

# Validate required environment variables in production
if [ "${ENV_NAME:-}" = "production" ]; then
    echo "Validating production environment variables..."
    req=(BRAND_NAME DOMAIN_NAME DB_BACKUP_PASSPHRASE \
         OS_AUTH_TYPE OS_AUTH_URL OS_REGION_NAME OS_INTERFACE OS_IDENTITY_API_VERSION \
         OS_APPLICATION_CREDENTIAL_ID OS_APPLICATION_CREDENTIAL_SECRET \
         SWIFT_CONTAINER SWIFT_PREFIX SLACK_BOT_TOKEN SLACK_CHANNEL_ID)
    for k in "${req[@]}"; do
        v="${!k:-}"
        [ -n "$v" ] || { echo "ERROR: $k is required in production but is unset or empty"; exit 1; }
    done
    echo "✅ All required production environment variables are set"
fi

# Create the .env file via the shared helper. Atomic write with mode 600.
# See scripts/write-env.sh for the .env contract and validation logic.
# The production-only req[] check above is update.sh-specific policy
# (e.g. "Slack is required in production for this script") — kept here
# rather than moving into the helper, which treats Slack as optional.
echo "Creating .env file..."
# shellcheck source=scripts/write-env.sh
source "$APP_DIR/scripts/write-env.sh"
write_env_file "$APP_DIR/.env"

cd "$APP_DIR"
DB_CONTAINER_BEFORE=$(sudo docker compose ps -q db)
[ -n "$DB_CONTAINER_BEFORE" ] || { echo "❌ PostgreSQL container is not running."; exit 1; }
[ "$(sudo docker inspect --format '{{.State.Health.Status}}' "$DB_CONTAINER_BEFORE")" = "healthy" ] || {
    echo "❌ PostgreSQL container is not healthy before deployment."
    exit 1
}
DB_RESTARTS_BEFORE=$(sudo docker inspect --format '{{.RestartCount}}' "$DB_CONTAINER_BEFORE")
echo "✅ PostgreSQL is healthy and will not be included in Compose replacement."

# Validate this production backup prerequisite before replacing any application
# service. Initial deployment owns role configuration; routine updates only
# verify it so application releases do not modify PostgreSQL roles.
if [ "${ENV_NAME:-}" = "production" ]; then
  echo "Verifying CREATEDB for nightly backup validation..."
  CREATEDB_STATUS=$(sudo docker compose exec -T db bash -c '
    PGPASSWORD="${POSTGRES_PASSWORD}" psql \
      -U "${POSTGRES_USER}" \
      -d "${POSTGRES_DB}" \
      -tAc "SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user;"
  ' | tr -d '[:space:]')
  if [ "$CREATEDB_STATUS" != "t" ]; then
    echo "❌ Database role does not have CREATEDB. Repair the initial deployment prerequisite before deploying."
    exit 1
  fi
  echo "✅ CREATEDB is present for nightly backup validation."
fi

# Check if migration files exist in the repository
if [ -z "$(ls -A "$APP_DIR/migrations" 2>/dev/null)" ]; then
  echo "No migration files found in the repository. This is unexpected as migrations should be checked in."
  echo "Please make sure migrations are generated locally and committed to the repository."
  exit 1
fi

# Routine application deploys deliberately leave nginx, journald, Docker host
# configuration, and PostgreSQL untouched. Changes to those are planned
# infrastructure releases with their own recovery notes.
echo "Pulling immutable application images from GitHub Container Registry..."
cd "$APP_DIR"
cleanup_docker_resources
if ! sudo docker compose pull web; then
  echo "Failed to pull the application image from GHCR"
  exit 1
fi
if [ "${ENV_NAME:-}" = "production" ]; then
  BACKUP_COMPOSE=(sudo docker compose --env-file "$APP_DIR/.env" -f "$APP_DIR/docker-compose.yml" -f "$APP_DIR/docker-compose.backup.yml" --profile backup)
  if ! "${BACKUP_COMPOSE[@]}" pull db-backup; then
    echo "Failed to pull the backup image from GHCR"
    exit 1
  fi
fi

# The current web container remains live while the candidate image applies its
# migrations in a one-off container. Normal migrations must therefore remain
# compatible with the current and candidate application images through the
# expand → migrate → contract pattern documented in docs/database-guide.md.
echo "Waiting for database to be ready..."
cd "$APP_DIR"
if ! timeout 60 sudo docker compose exec -T db bash -c "while ! pg_isready -U $POSTGRES_USER -d $POSTGRES_DB; do echo 'Waiting for DB...'; sleep 1; done"; then
  echo "❌ Database did not become ready within 60 seconds."
  sudo docker compose logs db
  exit 1
fi

# Run migrations from the exact candidate image without replacing web or
# starting/reconciling its PostgreSQL dependency.
echo "Running database migrations from the candidate image..."
if ! timeout 300 sudo docker compose run --rm --no-deps -T web pnpm run db:migrate; then
  echo "❌ Migration failed or timed out. See error messages above."
  exit 1
fi
echo "✅ Database migrations completed successfully."

echo "Starting the candidate web image without touching PostgreSQL..."
if ! timeout 330 sudo docker compose up -d --no-deps --wait --wait-timeout 300 web; then
  echo "❌ Web container failed to become healthy within 5 minutes."
  sudo docker compose logs web
  exit 1
fi
WEB_CONTAINER=$(sudo docker compose ps -q web)
assert_release_container "web" "$WEB_CONTAINER" "$EXPECTED_APP_IMAGE"

# Start backup service automatically on production
if [ "${ENV_NAME:-}" = "production" ]; then
  echo "Starting the candidate backup image without touching PostgreSQL..."
  if ! timeout 330 "${BACKUP_COMPOSE[@]}" up -d --no-deps --wait --wait-timeout 300 db-backup; then
    echo "❌ Backup container failed to become healthy within 5 minutes."
    "${BACKUP_COMPOSE[@]}" logs db-backup
    exit 1
  fi
  BACKUP_CONTAINER=$("${BACKUP_COMPOSE[@]}" ps -q db-backup)
  assert_release_container "backup" "$BACKUP_CONTAINER" "$EXPECTED_BACKUP_IMAGE"
  if [ "$(sudo docker inspect --format '{{json .Config.Cmd}}' "$BACKUP_CONTAINER")" != '["supercronic","-split-logs","/etc/supercronic/crontab"]' ]; then
    echo "❌ Backup container is not running the expected Supercronic command."
    exit 1
  fi
  echo "✅ Backup scheduler command is correct."
fi

DB_CONTAINER_AFTER=$(sudo docker compose ps -q db)
if [ "$DB_CONTAINER_AFTER" != "$DB_CONTAINER_BEFORE" ]; then
  echo "❌ PostgreSQL container changed during application deployment."
  exit 1
fi

echo "Checking once more for immediate restart loops..."
sleep 15
WEB_CONTAINER_AFTER=$(sudo docker compose ps -q web)
[ "$WEB_CONTAINER_AFTER" = "$WEB_CONTAINER" ] || { echo "❌ Web container changed during the stability check."; exit 1; }
assert_release_container "web" "$WEB_CONTAINER_AFTER" "$EXPECTED_APP_IMAGE"
if [ "${ENV_NAME:-}" = "production" ]; then
  BACKUP_CONTAINER_AFTER=$("${BACKUP_COMPOSE[@]}" ps -q db-backup)
  [ "$BACKUP_CONTAINER_AFTER" = "$BACKUP_CONTAINER" ] || { echo "❌ Backup container changed during the stability check."; exit 1; }
  assert_release_container "backup" "$BACKUP_CONTAINER_AFTER" "$EXPECTED_BACKUP_IMAGE"
fi
DB_CONTAINER_FINAL=$(sudo docker compose ps -q db)
[ "$DB_CONTAINER_FINAL" = "$DB_CONTAINER_BEFORE" ] || { echo "❌ PostgreSQL container changed during the stability check."; exit 1; }
[ "$(sudo docker inspect --format '{{.State.Health.Status}}' "$DB_CONTAINER_FINAL")" = "healthy" ] || { echo "❌ PostgreSQL is not healthy after the stability check."; exit 1; }
DB_RESTARTS_AFTER=$(sudo docker inspect --format '{{.RestartCount}}' "$DB_CONTAINER_FINAL")
[ "$DB_RESTARTS_AFTER" = "$DB_RESTARTS_BEFORE" ] || { echo "❌ PostgreSQL restarted during application deployment."; exit 1; }
echo "✅ PostgreSQL remained healthy without replacement or restarts."

cleanup_docker_resources

# Output final message
echo "Update is internally healthy. GitHub Actions will now run the public verification gate."
