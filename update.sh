#!/bin/bash

# This script updates the Next.js app, rebuilding the Docker containers and restarting them.
# It assumes that the app is already set up with Docker and Docker Compose
# and that the git repository is already up to date (handled by CI/CD workflow).
# It also assumes that the .env file is already created and contains the necessary environment variables.

# Script Vars
PROJECT_NAME=matkassen
GITHUB_ORG=vasteras-stadsmission
APP_DIR=~/"$PROJECT_NAME"

# For Docker internal communication ("db" is the name of Postgres container)
DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@db:5432/$POSTGRES_DB"

# For external tools (like Drizzle Studio)
DATABASE_URL_EXTERNAL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/$POSTGRES_DB"

# Create the .env file inside the app directory (~/matkassen/.env)
echo "AUTH_GITHUB_ID=\"$AUTH_GITHUB_ID\"" > "$APP_DIR/.env"
echo "AUTH_GITHUB_SECRET=\"$AUTH_GITHUB_SECRET\"" >> "$APP_DIR/.env"
echo "AUTH_GITHUB_APP_ID=\"$AUTH_GITHUB_APP_ID\"" >> "$APP_DIR/.env"
echo "AUTH_GITHUB_APP_PRIVATE_KEY=\"$AUTH_GITHUB_APP_PRIVATE_KEY\"" >> "$APP_DIR/.env"
echo "AUTH_GITHUB_APP_INSTALLATION_ID=\"$AUTH_GITHUB_APP_INSTALLATION_ID\"" >> "$APP_DIR/.env"
echo "AUTH_REDIRECT_PROXY_URL=https://$DOMAIN_NAME/api/auth" >> "$APP_DIR/.env"
echo "AUTH_SECRET=\"$AUTH_SECRET\"" >> "$APP_DIR/.env"
echo "AUTH_TRUST_HOST=true" >> "$APP_DIR/.env"
echo "AUTH_URL=https://$DOMAIN_NAME/api/auth" >> "$APP_DIR/.env"
echo "DATABASE_URL=\"$DATABASE_URL\"" >> "$APP_DIR/.env"
echo "DATABASE_URL_EXTERNAL=\"$DATABASE_URL_EXTERNAL\"" >> "$APP_DIR/.env"
echo "EMAIL=\"$EMAIL\"" >> "$APP_DIR/.env" # Needed for Certbot
echo "GITHUB_ORG=\"$GITHUB_ORG\"" >> "$APP_DIR/.env"
echo "POSTGRES_DB=\"$POSTGRES_DB\"" >> "$APP_DIR/.env"
echo "POSTGRES_PASSWORD=\"$POSTGRES_PASSWORD\"" >> "$APP_DIR/.env"
echo "POSTGRES_USER=\"$POSTGRES_USER\"" >> "$APP_DIR/.env"

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

# Derive backup settings from environment
SWIFT_PREFIX="backups/${ENV_NAME:-staging}"
OS_AUTH_TYPE="${OS_AUTH_TYPE:-v3applicationcredential}"
OS_INTERFACE="${OS_INTERFACE:-public}"
OS_IDENTITY_API_VERSION="3"

# Build and restart the Docker containers
echo "Rebuilding and restarting Docker containers..."
cd "$APP_DIR"
# Enable Docker Compose Bake for potentially better build performance (if not already set)
export COMPOSE_BAKE=${COMPOSE_BAKE:-true}
sudo docker compose build
sudo docker compose up -d

# Check if Docker Compose started correctly
if ! sudo docker compose ps | grep "Up"; then
  echo "Docker containers failed to start. Check logs with 'docker compose logs'."
  exit 1
fi

# Run migrations directly rather than waiting for the migration container
echo "Running database migrations synchronously..."
cd "$APP_DIR"
sudo docker compose exec -T db bash -c "while ! pg_isready -U $POSTGRES_USER -d $POSTGRES_DB; do sleep 1; done"
sudo docker compose exec -T web pnpm run db:migrate
if [ $? -ne 0 ]; then
  echo "❌ Migration failed. See error messages above."
  exit 1
else
  echo "✅ Database migrations completed successfully."
fi

# Cleanup old Docker images and containers
sudo docker system prune -af

# Start backup service automatically on production
if [ "${ENV_NAME:-}" = "production" ]; then
  echo "Starting backup service (profile: backup)..."
  # Build the backup image to ensure scripts are included
  sudo docker compose -f docker-compose.yml -f docker-compose.backup.yml --profile backup build db-backup || true
  SWIFT_PREFIX="$SWIFT_PREFIX" \
  OS_AUTH_TYPE="$OS_AUTH_TYPE" \
  OS_AUTH_URL="$OS_AUTH_URL" \
  OS_REGION_NAME="$OS_REGION_NAME" \
  OS_INTERFACE="$OS_INTERFACE" \
  OS_IDENTITY_API_VERSION="$OS_IDENTITY_API_VERSION" \
  OS_APPLICATION_CREDENTIAL_ID="$OS_APPLICATION_CREDENTIAL_ID" \
  OS_APPLICATION_CREDENTIAL_SECRET="$OS_APPLICATION_CREDENTIAL_SECRET" \
  SLACK_BOT_TOKEN="$SLACK_BOT_TOKEN" \
  SLACK_CHANNEL_ID="$SLACK_CHANNEL_ID" \
  sudo docker compose -f docker-compose.yml -f docker-compose.backup.yml --profile backup up -d db-backup || true
fi

# Output final message
echo "Update complete. Your Next.js app has been updated with the latest changes and database migrations have been applied."
