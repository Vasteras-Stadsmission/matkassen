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

# Cleanup function to release lock on exit
cleanup() {
    echo "🔓 Releasing deployment lock"
}
trap cleanup EXIT

# Script Vars
PROJECT_NAME=matkassen
GITHUB_ORG=vasteras-stadsmission
APP_DIR=~/"$PROJECT_NAME"

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

# Create the .env file atomically with proper permissions
echo "Creating .env file..."
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT

# Start with core application variables
{
    printf 'AUTH_GITHUB_ID="%s"\n' "${AUTH_GITHUB_ID}"
    printf 'AUTH_GITHUB_SECRET="%s"\n' "${AUTH_GITHUB_SECRET}"
    printf 'AUTH_GITHUB_APP_ID="%s"\n' "${AUTH_GITHUB_APP_ID}"
    printf 'AUTH_GITHUB_APP_PRIVATE_KEY="%s"\n' "${AUTH_GITHUB_APP_PRIVATE_KEY}"
    printf 'AUTH_GITHUB_APP_INSTALLATION_ID="%s"\n' "${AUTH_GITHUB_APP_INSTALLATION_ID}"
    printf 'AUTH_REDIRECT_PROXY_URL="https://%s/api/auth"\n' "${DOMAIN_NAME}"
    printf 'AUTH_SECRET="%s"\n' "${AUTH_SECRET}"
    printf 'AUTH_TRUST_HOST=true\n'
    printf 'AUTH_URL="https://%s/api/auth"\n' "${DOMAIN_NAME}"
    printf 'DATABASE_URL="%s"\n' "${DATABASE_URL}"
    printf 'DATABASE_URL_EXTERNAL="%s"\n' "${DATABASE_URL_EXTERNAL}"
    printf 'EMAIL="%s"\n' "${EMAIL}"
    printf 'GITHUB_ORG="%s"\n' "${GITHUB_ORG}"
    printf 'POSTGRES_DB="%s"\n' "${POSTGRES_DB}"
    printf 'POSTGRES_PASSWORD="%s"\n' "${POSTGRES_PASSWORD}"
    printf 'POSTGRES_USER="%s"\n' "${POSTGRES_USER}"
    printf 'ENV_NAME="%s"\n' "${ENV_NAME:-}"
    # SMS configuration (conditional - only if credentials are provided)
    if [ -n "${HELLO_SMS_USERNAME:-}" ]; then
        printf 'HELLO_SMS_USERNAME="%s"\n' "${HELLO_SMS_USERNAME}"
    fi
    if [ -n "${HELLO_SMS_PASSWORD:-}" ]; then
        printf 'HELLO_SMS_PASSWORD="%s"\n' "${HELLO_SMS_PASSWORD}"
    fi
    printf 'HELLO_SMS_TEST_MODE="%s"\n' "${HELLO_SMS_TEST_MODE:-true}"
    printf 'SMS_SEND_INTERVAL="%s"\n' "${SMS_SEND_INTERVAL:-5 minutes}"
    # SMS callback webhook secret (required for HelloSMS status callbacks in production)
    if [ -n "${SMS_CALLBACK_SECRET:-}" ]; then
        printf 'SMS_CALLBACK_SECRET="%s"\n' "${SMS_CALLBACK_SECRET}"
    fi
    # Logging configuration
    printf 'LOG_LEVEL="%s"\n' "${LOG_LEVEL:-info}"
    # White-label configuration (required in production)
    printf 'NEXT_PUBLIC_BRAND_NAME="%s"\n' "${BRAND_NAME}"
    printf 'NEXT_PUBLIC_BASE_URL="https://%s"\n' "${DOMAIN_NAME}"
    # SMS sender name (optional - defaults to BRAND_NAME if not set)
    if [ -n "${SMS_SENDER:-}" ]; then
        printf 'NEXT_PUBLIC_SMS_SENDER="%s"\n' "${SMS_SENDER}"
    fi
    # Anonymization scheduler configuration (always enabled for GDPR compliance)
    printf 'ANONYMIZATION_SCHEDULE="%s"\n' "${ANONYMIZATION_SCHEDULE:-0 2 * * 0}"
    printf 'ANONYMIZATION_INACTIVE_DURATION="%s"\n' "${ANONYMIZATION_INACTIVE_DURATION:-1 year}"
    # SMS health report schedule (daily at 8 AM Stockholm time)
    printf 'SMS_REPORT_SCHEDULE="%s"\n' "${SMS_REPORT_SCHEDULE:-0 8 * * *}"
    # Slack notifications (optional - alerts only sent when ENV_NAME=production)
    if [ -n "${SLACK_BOT_TOKEN:-}" ]; then
        printf 'SLACK_BOT_TOKEN="%s"\n' "${SLACK_BOT_TOKEN}"
    fi
    if [ -n "${SLACK_CHANNEL_ID:-}" ]; then
        printf 'SLACK_CHANNEL_ID="%s"\n' "${SLACK_CHANNEL_ID}"
    fi
} > "$tmp"

# Add production-only backup configuration
if [ "${ENV_NAME:-}" = "production" ]; then
    # Database backup encryption (GDPR compliance - production only)
    printf 'DB_BACKUP_PASSPHRASE="%s"\n' "${DB_BACKUP_PASSPHRASE}" >> "$tmp"
    {
        printf 'OS_AUTH_TYPE="%s"\n' "${OS_AUTH_TYPE}"
        printf 'OS_AUTH_URL="%s"\n' "${OS_AUTH_URL}"
        printf 'OS_REGION_NAME="%s"\n' "${OS_REGION_NAME}"
        printf 'OS_INTERFACE="%s"\n' "${OS_INTERFACE}"
        printf 'OS_IDENTITY_API_VERSION="%s"\n' "${OS_IDENTITY_API_VERSION}"
        printf 'OS_APPLICATION_CREDENTIAL_ID="%s"\n' "${OS_APPLICATION_CREDENTIAL_ID}"
        printf 'OS_APPLICATION_CREDENTIAL_SECRET="%s"\n' "${OS_APPLICATION_CREDENTIAL_SECRET}"
        printf 'SWIFT_CONTAINER="%s"\n' "${SWIFT_CONTAINER}"
        printf 'SWIFT_PREFIX="%s"\n' "${SWIFT_PREFIX}"
    } >> "$tmp"
fi

# Install atomically with secure permissions (0600 = rw--------)
install -m 600 "$tmp" "$APP_DIR/.env"

# Verify .env file was created successfully
[ -f "$APP_DIR/.env" ] || { echo "ERROR: Failed to create .env file"; exit 1; }

# Check if migration files exist in the repository
if [ -z "$(ls -A "$APP_DIR/migrations" 2>/dev/null)" ]; then
  echo "No migration files found in the repository. This is unexpected as migrations should be checked in."
  echo "Please make sure migrations are generated locally and committed to the repository."
  exit 1
fi

# Generate nginx configuration from template
echo "Generating nginx configuration..."
cd "$APP_DIR"
chmod +x nginx/generate-nginx-config.sh

# Ensure clean nginx state before applying new configuration
echo "Setting up clean nginx configuration..."
sudo systemctl stop nginx || true
# Wait for systemd to fully stop nginx
sleep 2
# Force kill any lingering nginx processes (use exact match to avoid killing pkill itself)
sudo pkill -9 -x nginx || true
# Wait for ports to be fully released
sleep 2
# Verify ports 80 and 443 are free (log if not)
PORT_CHECK_LOG="$(sudo ss -tulpn | grep -E ':80 |:443 ' 2>&1 || true)"
if [ -n "$PORT_CHECK_LOG" ]; then
    echo "⚠️ Warning: Ports 80/443 still in use after stopping nginx:"
    echo "$PORT_CHECK_LOG"
    echo "Waiting additional 5 seconds for ports to clear..."
    sleep 5

    # Re-check after wait - log if still in use but continue (retry logic will handle)
    PORT_CHECK_LOG2="$(sudo ss -tulpn | grep -E ':80 |:443 ' 2>&1 || true)"
    if [ -n "$PORT_CHECK_LOG2" ]; then
        echo "⚠️ Warning: Ports STILL in use after 9 seconds total wait:"
        echo "$PORT_CHECK_LOG2"
        echo "Continuing deployment - nginx retry logic will handle port conflicts if they persist."
    else
        echo "✅ Ports 80/443 are now free"
    fi
fi

# Clean slate - remove all existing site configurations
echo "Removing old nginx configurations..."
sudo rm -f /etc/nginx/conf.d/matkassen-http.conf
sudo rm -f /etc/nginx/sites-enabled/*

# Apply fresh configuration
echo "Generating nginx configuration..."
./nginx/generate-nginx-config.sh production "$DOMAIN_NAME www.$DOMAIN_NAME" "$DOMAIN_NAME" | sudo tee /etc/nginx/sites-available/default > /dev/null
echo "Creating nginx symlink..."
# Remove existing symlink explicitly (in case wildcard rm failed for any reason)
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
echo "Copying shared nginx config..."
sudo cp nginx/shared.conf /etc/nginx/shared.conf

# Test config (but don't start nginx yet - wait for Docker first)
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

# Note: No additional sleep needed here - containers only use port 3000, never 80/443
# Health checks above already ensured containers are fully ready

# Now start nginx after Docker is fully up (with retry logic)
echo "Starting nginx..."
NGINX_START_ATTEMPTS=0
MAX_NGINX_ATTEMPTS=3

while [ $NGINX_START_ATTEMPTS -lt $MAX_NGINX_ATTEMPTS ]; do
    if sudo systemctl start nginx; then
        echo "✅ Nginx started successfully"
        sudo systemctl enable nginx  # Ensure it's enabled
        break
    else
        NGINX_START_ATTEMPTS=$((NGINX_START_ATTEMPTS + 1))
        echo "⚠️ Nginx failed to start (attempt $NGINX_START_ATTEMPTS/$MAX_NGINX_ATTEMPTS)"

        # Log what's using the ports
        echo "Checking what's using ports 80/443..."
        sudo ss -tulpn | grep -E ':80 |:443 ' || echo "No processes found on ports 80/443"

        # Log recent nginx errors
        echo "Recent nginx logs:"
        sudo journalctl -u nginx -n 20 --no-pager

        if [ $NGINX_START_ATTEMPTS -lt $MAX_NGINX_ATTEMPTS ]; then
            echo "Waiting 5 seconds before retry..."
            sleep 5
        else
            echo "❌ Failed to start nginx after $MAX_NGINX_ATTEMPTS attempts"
            exit 1
        fi
    fi
done

# Run migrations directly rather than waiting for the migration container
echo "Waiting for database to be ready..."
cd "$APP_DIR"
timeout 60 sudo docker compose exec -T db bash -c "while ! pg_isready -U $POSTGRES_USER -d $POSTGRES_DB; do echo 'Waiting for DB...'; sleep 1; done"
if [ $? -ne 0 ]; then
  echo "❌ Database did not become ready within 60 seconds."
  sudo docker compose logs db
  exit 1
fi

# Run migrations from within the container (stable, reliable approach)
echo "Running database migrations..."
sudo docker compose exec -T web node_modules/.bin/drizzle-kit migrate
if [ $? -ne 0 ]; then
  echo "❌ Migration failed. See error messages above."
  sudo docker compose logs web
  exit 1
else
  echo "✅ Database migrations completed successfully."
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
