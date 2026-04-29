#!/bin/bash

# Ensure software-properties-common is installed (needed for add-apt-repository)
if ! command -v add-apt-repository >/dev/null 2>&1; then
  echo "Installing software-properties-common..."
  sudo apt-get update
  sudo apt-get install -y software-properties-common
fi

# Ensure GPG is installed for encrypted backups
if ! command -v gpg >/dev/null 2>&1; then
  echo "⚠️ GPG not found, installing..."
  sudo apt-get update
  sudo apt-get install -y gnupg
fi

# This script updates the Next.js app, rebuilding the Docker containers and restarting them.
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

# Capture nginx state so the EXIT trap can restore it if the deploy aborts.
# Without this, a failed deploy (e.g. healthcheck timeout, migration error)
# leaves nginx stopped and the site fully down until manual recovery.
NGINX_WAS_ACTIVE=0
sudo systemctl is-active --quiet nginx && NGINX_WAS_ACTIVE=1

# Notify Slack on deploy failure. Token is only exported by the
# production workflow, so this no-ops on staging and on hosts where
# the env vars aren't set.
notify_slack_failure() {
    local rc=$1
    [ -n "${SLACK_BOT_TOKEN:-}" ] && [ -n "${SLACK_CHANNEL_ID:-}" ] || return 0
    local host
    host=$(hostname)
    local msg="[matkassen] ❌ Deploy failed (exit ${rc}) on ${host}. Site stays up on previous container; nginx restart attempted by trap. Check GH Actions logs."
    curl -sS https://slack.com/api/chat.postMessage \
        -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
        -H "Content-type: application/json; charset=utf-8" \
        --data "{\"channel\":\"${SLACK_CHANNEL_ID}\",\"text\":\"${msg}\"}" \
        | grep -q '"ok":true' || true
}

cleanup() {
    local rc=$?
    echo "🔓 Releasing deployment lock"
    # Use ${VAR:-0} defensively in case an early abort fires the trap
    # before NGINX_WAS_ACTIVE is initialized (set -u would otherwise
    # error inside the trap and mask the real exit code).
    if [ "${NGINX_WAS_ACTIVE:-0}" -eq 1 ]; then
        sudo systemctl is-active --quiet nginx || sudo systemctl start nginx || true
    fi
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

# Check if migration files exist in the repository
if [ -z "$(ls -A "$APP_DIR/migrations" 2>/dev/null)" ]; then
  echo "No migration files found in the repository. This is unexpected as migrations should be checked in."
  echo "Please make sure migrations are generated locally and committed to the repository."
  exit 1
fi

# Generate nginx configuration from template.
# Nginx stays running throughout the deploy so the site doesn't go fully
# dark on failure: it keeps serving the old web container (or returns
# brief 502s during the container recreate window) instead of refusing
# connections. Files are written in place; nginx picks them up via
# `systemctl reload` after migrations succeed.
echo "Updating nginx configuration..."
cd "$APP_DIR"
chmod +x nginx/generate-nginx-config.sh

# Write the new sites-available config first (always complete on disk),
# then atomically point sites-enabled at it via `ln -sfn`. The replace
# is a single rename(2) call — no window where sites-enabled is empty,
# so an unrelated nginx reload during this section can't pick up an
# empty config. The active nginx process keeps its previous config in
# memory until the explicit reload further below.
./nginx/generate-nginx-config.sh production "$DOMAIN_NAME www.$DOMAIN_NAME" "$DOMAIN_NAME" \
    | sudo tee /etc/nginx/sites-available/default > /dev/null
sudo cp nginx/shared.conf /etc/nginx/shared.conf
sudo ln -sfn /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default

# Drop legacy config from earlier deploy patterns (no-op once retired).
sudo rm -f /etc/nginx/conf.d/matkassen-http.conf

echo "Validating nginx configuration..."
sudo nginx -t
echo "✅ Nginx configuration updated and validated"

# Pull and restart the Docker containers
echo "Pulling latest Docker images from GitHub Container Registry..."
cd "$APP_DIR"
if ! sudo docker compose pull; then
  echo "Failed to pull Docker images from GHCR"
  exit 1
fi

echo "Starting Docker containers..."
timeout 300 sudo docker compose up -d || {
  echo "❌ Docker containers failed to start within 5 minutes"
  sudo docker compose logs
  exit 1
}

echo "Checking if Docker containers started correctly..."
# Check if Docker Compose started correctly
if ! sudo docker compose ps | grep "Up"; then
  echo "Docker containers failed to start. Check logs with 'docker compose logs'."
  sudo docker compose logs
  exit 1
fi

# Wait for containers to be fully healthy before starting nginx
echo "Waiting for Docker containers to be healthy..."
if ! timeout 60 bash -c '
  while true; do
    # Count total containers and healthy containers
    TOTAL=$(sudo docker compose ps --format json 2>/dev/null | jq -s "length" || echo "0")
    HEALTHY=$(sudo docker compose ps --format json 2>/dev/null | jq -s "[.[] | select(.Health==\"healthy\")] | length" || echo "0")

    # Fail if no containers found (deployment issue)
    if [[ "$TOTAL" -eq 0 ]]; then
      echo "❌ No containers found - docker compose may have failed"
      exit 1
    fi

    # Success: all containers are healthy
    if [[ "$TOTAL" -eq "$HEALTHY" ]]; then
      echo "✅ All $TOTAL containers are healthy"
      break
    fi

    echo "Waiting for health checks... ($HEALTHY/$TOTAL healthy)"
    sleep 2
  done
'; then
    echo "❌ Health check failed or timed out after 60 seconds."
    sudo docker compose ps
    sudo docker compose logs
    exit 1
fi

# Run migrations now that containers are healthy. Nginx has been serving
# traffic throughout this deploy (to keep the site up on failure), which
# means there is a window where the NEW web container code runs against
# the OLD schema — for as long as the migration takes (up to the 300s
# timeout on the docker exec below). New code reading a column that
# doesn't exist yet returns 5xx for those routes during that window.
#
# Rule: schema migrations must be backward-compatible with the previous
# code for the duration of the deploy window — i.e. additive changes
# only (new columns nullable or with defaults; new tables; new indexes).
# For breaking schema changes (drop/rename column, NOT NULL on existing,
# type changes), split into two deploys: expand → migrate → contract.
# See docs/database-guide.md for the full rule.
echo "Waiting for database to be ready..."
cd "$APP_DIR"
timeout 60 sudo docker compose exec -T db bash -c "while ! pg_isready -U $POSTGRES_USER -d $POSTGRES_DB; do echo 'Waiting for DB...'; sleep 1; done"
if [ $? -ne 0 ]; then
  echo "❌ Database did not become ready within 60 seconds."
  sudo docker compose logs db
  exit 1
fi

# Run migrations from within the container (stable, reliable approach)
# Timeout matches other deployment steps — prevents a hung migration (e.g. lock wait)
# from keeping nginx down indefinitely.
echo "Running database migrations..."
timeout 300 sudo docker compose exec -T web pnpm run db:migrate
if [ $? -ne 0 ]; then
  echo "❌ Migration failed or timed out. See error messages above."
  sudo docker compose logs web
  exit 1
else
  echo "✅ Database migrations completed successfully."
fi

# Grant CREATEDB to the app user on production so the nightly backup
# validation in scripts/backup-db.sh can create and drop its scratch DB
# (matkassen_nightly_validate). Idempotent — ALTER USER is a no-op if
# the attribute is already set. Skipped on staging because the backup
# profile never runs there.
if [ "${ENV_NAME:-}" = "production" ]; then
  echo "Granting CREATEDB to $POSTGRES_USER for nightly backup validation..."
  # Single-quoted bash -c so $POSTGRES_PASSWORD expands inside the db
  # container (from its own env), not on the host. The host never sees
  # the password in argv, so `ps auxfww` during the exec reveals only
  # the docker command line, not secrets. The container already has
  # POSTGRES_USER/PASSWORD/DB in its env via docker-compose.yml.
  if sudo docker compose exec -T db bash -c '
    PGPASSWORD="${POSTGRES_PASSWORD}" psql \
      -U "${POSTGRES_USER}" \
      -d "${POSTGRES_DB}" \
      -c "ALTER USER \"${POSTGRES_USER}\" CREATEDB;"
  ' > /dev/null 2>&1; then
    echo "✅ CREATEDB granted to $POSTGRES_USER."
  else
    echo "⚠️ Failed to grant CREATEDB — nightly backup validation will fail until this is resolved (run: docker compose exec db psql -U \$POSTGRES_USER -d \$POSTGRES_DB -c 'ALTER USER \"\$POSTGRES_USER\" CREATEDB;')."
  fi
fi

# Apply the new nginx configuration: reload if running, start if not.
# Reload swaps config atomically with no dropped connections. Start (with
# enable) is the bootstrap path — first ever deploy or recovery from an
# unexpected stop. On reload failure, dump the journal so the cause is
# visible in CI logs (old workers keep serving the previous config).
echo "Applying nginx configuration..."
if sudo systemctl is-active --quiet nginx; then
    if ! sudo systemctl reload nginx; then
        echo "❌ Nginx reload failed — recent journal entries:"
        sudo journalctl -u nginx -n 20 --no-pager
        exit 1
    fi
    echo "✅ Nginx reloaded with new configuration"
else
    sudo systemctl start nginx
    sudo systemctl enable nginx
    echo "✅ Nginx started"
fi

# Cleanup old Docker images and containers (but keep recent build cache)
echo "Cleaning up old Docker resources..."
sudo docker container prune -f
sudo docker image prune -f
echo "✅ Docker cleanup completed"

# Start backup service automatically on production
if [ "${ENV_NAME:-}" = "production" ]; then
  echo "Starting backup service (profile: backup)..."
  # Pull the backup image from GHCR
  sudo docker compose --env-file "$APP_DIR/.env" -f "$APP_DIR/docker-compose.yml" -f "$APP_DIR/docker-compose.backup.yml" --profile backup pull
  # Start the backup service (explicitly specify env file location)
  sudo docker compose --env-file "$APP_DIR/.env" -f "$APP_DIR/docker-compose.yml" -f "$APP_DIR/docker-compose.backup.yml" --profile backup up -d db-backup
  echo "✅ Backup service started successfully"
fi

# Output final message
echo "Update complete. Your Next.js app has been updated with the latest changes and database migrations have been applied."
