#!/bin/bash

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
    req=(BRAND_NAME DOMAIN_NAME \
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
    # White-label configuration (required in production)
    printf 'NEXT_PUBLIC_BRAND_NAME="%s"\n' "${BRAND_NAME}"
    printf 'NEXT_PUBLIC_BASE_URL="https://%s"\n' "${DOMAIN_NAME}"
    # SMS sender name (optional - defaults to BRAND_NAME if not set)
    if [ -n "${SMS_SENDER:-}" ]; then
        printf 'NEXT_PUBLIC_SMS_SENDER="%s"\n' "${SMS_SENDER}"
    fi
} > "$tmp"

# Add production-only backup configuration
if [ "${ENV_NAME:-}" = "production" ]; then
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
        printf 'SLACK_BOT_TOKEN="%s"\n' "${SLACK_BOT_TOKEN}"
        printf 'SLACK_CHANNEL_ID="%s"\n' "${SLACK_CHANNEL_ID}"
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
sudo pkill -f nginx || true
sleep 1

# Clean slate - remove all existing site configurations
sudo rm -f /etc/nginx/conf.d/matkassen-http.conf
sudo rm -f /etc/nginx/sites-enabled/*

# Apply fresh configuration
./nginx/generate-nginx-config.sh production "$DOMAIN_NAME www.$DOMAIN_NAME" "$DOMAIN_NAME" | sudo tee /etc/nginx/sites-available/default > /dev/null
sudo ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default
sudo cp nginx/shared.conf /etc/nginx/shared.conf

# Test config and start fresh
sudo nginx -t
sudo systemctl start nginx
sudo systemctl enable nginx  # Ensure it's enabled
echo "✅ Nginx configuration updated and restarted cleanly"

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
sudo docker compose exec -T web pnpm run db:migrate
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
