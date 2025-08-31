#!/bin/bash

# Enable strict error handling
set -euo pipefail

# This script sets up a Next.js app with PostgreSQL and Nginx on an Ubuntu server.
# It installs Docker, Docker Compose, and Certbot for SSL certificates.
# It also configures Nginx with security headers and rate limiting.
# It assumes that the server is running Ubuntu and has a public IP address.
# It also assumes the repository is already cloned (handled by CI/CD workflow).

# Error handling function
handle_error() {
  local line=$1
  local exit_code=$2
  echo "Error occurred at line $line with exit code $exit_code"
  exit $exit_code
}

# Set up error trap
trap 'handle_error ${LINENO} $?' ERR

# Verify that required environment variables are set
required_vars=(POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB EMAIL AUTH_GITHUB_ID AUTH_GITHUB_SECRET AUTH_SECRET DOMAIN_NAME)
missing_vars=()

echo "Checking required environment variables..."
for var in "${required_vars[@]}"; do
  if [ -z "${!var:-}" ]; then
    missing_vars+=("$var")
  fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
  echo "❌ Error: The following required environment variables are not set:"
  for var in "${missing_vars[@]}"; do
    echo "   - $var"
  done
  echo "Please set these variables and try again."
  exit 1
fi

echo "✅ All required environment variables are set."

# Script Vars
if [[ "$DOMAIN_NAME" == "matkassen.org" ]]; then
  # For production, include www subdomain
  DOMAIN_NAMES="$DOMAIN_NAME www.$DOMAIN_NAME"
  CERTBOT_DOMAINS="-d $DOMAIN_NAME -d www.$DOMAIN_NAME"
else
  # For staging, don't include www
  DOMAIN_NAMES="$DOMAIN_NAME"
  CERTBOT_DOMAINS="-d $DOMAIN_NAME"
fi

GITHUB_ORG=vasteras-stadsmission
PROJECT_NAME=matkassen
APP_DIR=~/"$PROJECT_NAME"
# Derive backup settings from environment
SWIFT_PREFIX="backups/${ENV_NAME:-staging}"
OS_AUTH_TYPE="${OS_AUTH_TYPE:-v3applicationcredential}"
OS_INTERFACE="${OS_INTERFACE:-public}"
OS_IDENTITY_API_VERSION="3"
SWAP_SIZE="1G"  # Swap size of 1GB

# Update package list and upgrade existing packages
sudo apt update && sudo apt upgrade -y

# Check if swap file already exists
if [ -f /swapfile ] || grep -q '/swapfile' /proc/swaps; then
  echo "Swap file already exists. Skipping swap creation."
else
  # Add Swap Space
  echo "Adding swap space..."
  sudo fallocate -l $SWAP_SIZE /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile

  # Make swap permanent
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  fi
fi

# Install Docker
sudo apt install apt-transport-https ca-certificates curl software-properties-common -y
# Download and store Docker's GPG key in a keyring (replaces apt-key usage)
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
# Add Docker repo with the signed-by option pointing to the saved keyring
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install docker-ce -y

# Install Docker Compose
echo "Installing Docker Compose..."
DOCKER_COMPOSE_PATH="/usr/local/bin/docker-compose"
DOCKER_COMPOSE_URL="https://github.com/docker/compose/releases/download/v2.34.0/docker-compose-$(uname -s)-$(uname -m)"
DOCKER_COMPOSE_TMP="${DOCKER_COMPOSE_PATH}.tmp"

# Remove any existing installation
sudo rm -f "${DOCKER_COMPOSE_PATH}"

# Download to temporary file first to avoid partial downloads
echo "Downloading Docker Compose from ${DOCKER_COMPOSE_URL}..."
if ! sudo curl -L "${DOCKER_COMPOSE_URL}" -o "${DOCKER_COMPOSE_TMP}"; then
  echo "Docker Compose download failed. Exiting."
  exit 1
fi

# Move temporary file to final location
sudo mv "${DOCKER_COMPOSE_TMP}" "${DOCKER_COMPOSE_PATH}"

# Make executable
sudo chmod +x "${DOCKER_COMPOSE_PATH}"

# Verify file exists and is executable
if [ ! -x "${DOCKER_COMPOSE_PATH}" ]; then
  echo "Docker Compose installation failed. File is not executable. Exiting."
  exit 1
fi

# Ensure Docker Compose is executable and in path
sudo ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose

# Verify Docker Compose installation and version
echo "Verifying Docker Compose version compatibility..."
DOCKER_COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "unknown")
echo "Docker Compose version: $DOCKER_COMPOSE_VERSION"

# Check if version meets minimum requirements (v2.13+ for --wait and --wait-timeout flags)
if [[ "$DOCKER_COMPOSE_VERSION" == "unknown" ]]; then
  echo "❌ Error: Could not determine Docker Compose version"
  exit 1
fi

# Extract major and minor version numbers
if [[ $DOCKER_COMPOSE_VERSION =~ ^v?([0-9]+)\.([0-9]+) ]]; then
  MAJOR_VERSION=${BASH_REMATCH[1]}
  MINOR_VERSION=${BASH_REMATCH[2]}

  # Check if version is 2.13 or higher
  if [[ $MAJOR_VERSION -lt 2 ]] || [[ $MAJOR_VERSION -eq 2 && $MINOR_VERSION -lt 13 ]]; then
    echo "❌ Error: Docker Compose version $DOCKER_COMPOSE_VERSION is not supported"
    echo "This deployment script requires Docker Compose v2.13+ for health check and timeout features"
    echo "Please upgrade Docker Compose to continue"
    echo "Installation guide: https://docs.docker.com/compose/install/"
    exit 1
  fi
else
  echo "⚠️ Warning: Could not parse Docker Compose version format: $DOCKER_COMPOSE_VERSION"
  echo "Proceeding anyway, but deployment may fail if version is incompatible"
fi

echo "✅ Docker Compose version is compatible"

docker compose version
if [ $? -ne 0 ]; then
  echo "Docker Compose installation failed. Exiting."
  exit 1
fi

# Ensure Docker starts on boot and start Docker service
sudo systemctl enable docker
sudo systemctl start docker

# Verify migrations directory exists and contains files
if [ ! -d "$APP_DIR/migrations" ] || [ -z "$(ls -A "$APP_DIR/migrations" 2>/dev/null)" ]; then
  echo "No migration files found in the repository. This is unexpected as migrations should be checked in."
  echo "Please make sure migrations are generated locally and committed to the repository."
  exit 1
fi

# For Docker internal communication ("db" is the name of Postgres container)
DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@db:5432/$POSTGRES_DB"

# For external tools (like Drizzle Studio)
DATABASE_URL_EXTERNAL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/$POSTGRES_DB"

# Create the .env file inside the app directory (~/matkassen/.env)
echo "AUTH_GITHUB_ID=\"$AUTH_GITHUB_ID\"" > "$APP_DIR/.env"
echo "AUTH_GITHUB_SECRET=\"$AUTH_GITHUB_SECRET\"" >> "$APP_DIR/.env"
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

# Install Nginx
sudo apt install nginx -y

# Disable default Nginx site to prevent conflicts
sudo rm -f /etc/nginx/sites-enabled/default

# Remove old Nginx config (if it exists)
sudo rm -f /etc/nginx/sites-available/"$PROJECT_NAME"
sudo rm -f /etc/nginx/sites-enabled/"$PROJECT_NAME"

# Create a temporary basic Nginx config for initial setup
sudo tee /etc/nginx/sites-available/"$PROJECT_NAME" > /dev/null <<EOL
server {
    listen 80;
    server_name $DOMAIN_NAMES;

    location / {
        return 200 "Server is being configured";
    }
}
EOL

# Enable the temporary configuration
sudo ln -s /etc/nginx/sites-available/"$PROJECT_NAME" /etc/nginx/sites-enabled/"$PROJECT_NAME"

# Start Nginx with temporary config
sudo systemctl restart nginx

# Use certbot with the nginx plugin to automatically handle certificates and configuration
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx $CERTBOT_DOMAINS --non-interactive --agree-tos -m $EMAIL

# Ensure SSL files exist or generate them
echo "Checking for required SSL configuration files..."

# Define paths
SSL_OPTIONS_FILE="/etc/letsencrypt/options-ssl-nginx.conf"
SSL_DHPARAMS_FILE="/etc/letsencrypt/ssl-dhparams.pem"
SSL_OPTIONS_TMP="/etc/letsencrypt/options-ssl-nginx.conf.tmp"

# Check and download options-ssl-nginx.conf if needed
if [ ! -f "$SSL_OPTIONS_FILE" ]; then
  echo "Downloading Nginx SSL options file..."

  # Download to temp file first to avoid incomplete downloads
  if ! sudo wget https://raw.githubusercontent.com/certbot/certbot/main/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf -O "$SSL_OPTIONS_TMP" --quiet; then
    echo "Failed to download SSL options file. Exiting."
    exit 1
  fi

  # Move to final location only if download was successful
  sudo mv "$SSL_OPTIONS_TMP" "$SSL_OPTIONS_FILE"
  echo "✓ SSL options file created successfully."
else
  echo "✓ SSL options file already exists."
fi

# Check and generate dhparams.pem if needed
if [ ! -f "$SSL_DHPARAMS_FILE" ]; then
  echo "Generating SSL DH parameters (this may take a few minutes)..."

  # Generate to temp file first
  DHPARAMS_TMP="/etc/letsencrypt/ssl-dhparams.pem.tmp"
  if ! sudo openssl dhparam -out "$DHPARAMS_TMP" 2048; then
    echo "Failed to generate DH parameters. Exiting."
    exit 1
  fi

  # Move to final location only if generation was successful
  sudo mv "$DHPARAMS_TMP" "$SSL_DHPARAMS_FILE"
  echo "✓ DH parameters file created successfully."
else
  echo "✓ DH parameters file already exists."
fi

# Set up automatic SSL certificate renewal
echo "Setting up automatic SSL certificate renewal..."

# Create pre and post renewal hooks to handle Nginx restart
sudo mkdir -p /etc/letsencrypt/renewal-hooks/pre
sudo mkdir -p /etc/letsencrypt/renewal-hooks/post

# Create pre-renewal hook to stop Nginx
sudo tee /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh > /dev/null <<'EOHOOK'
#!/bin/bash
systemctl stop nginx
EOHOOK
sudo chmod +x /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh

# Create post-renewal hook to start Nginx
sudo tee /etc/letsencrypt/renewal-hooks/post/start-nginx.sh > /dev/null <<'EOHOOK'
#!/bin/bash
systemctl start nginx
EOHOOK
sudo chmod +x /etc/letsencrypt/renewal-hooks/post/start-nginx.sh

# Setup automated renewal cron job that runs twice daily
echo "0 3,15 * * * root certbot renew --quiet" | sudo tee /etc/cron.d/certbot-renew > /dev/null

# Generate production nginx configuration using template
echo "Generating production nginx configuration..."
cd "$APP_DIR"
if ! ./nginx/generate-nginx-config.sh production "$DOMAIN_NAMES" "$DOMAIN_NAME" > /tmp/nginx-production.conf; then
  echo "Failed to generate nginx configuration. Exiting."
  exit 1
fi

# Install the generated configuration and shared config
sudo cp /tmp/nginx-production.conf /etc/nginx/sites-available/"$PROJECT_NAME"
sudo cp nginx/shared.conf /etc/nginx/shared.conf

# Restart Nginx to apply the updated configuration
sudo systemctl restart nginx

# Build and run the Docker containers from the app directory
cd "$APP_DIR"

# Check for existing Docker artifacts and handle them
echo "Checking for existing Docker artifacts..."
if [[ -d "$APP_DIR/.docker" ]]; then
  echo "Found existing Docker build artifacts. Cleaning up..."
  sudo rm -rf "$APP_DIR/.docker"
fi

# Check for compressed artifacts from previous builds
for gz_file in $(find "$APP_DIR" -name "*.gz" -type f 2>/dev/null || true); do
  echo "Found compressed artifact: $gz_file, removing..."
  sudo rm -f "$gz_file"
done

# Build the containers with proper error handling
echo "Building Docker containers..."
# Enable Docker Compose Bake for potentially better build performance (if not already set)
export COMPOSE_BAKE=${COMPOSE_BAKE:-true}
if ! sudo docker compose build --no-cache; then
  echo "Docker build failed. Check the build logs above."
  exit 1
fi

# Start the containers with health check dependencies
echo "Starting Docker containers with health checks..."
if ! sudo docker compose up -d --wait --wait-timeout 300; then
  echo "Failed to start Docker containers or health checks failed within 5 minutes."
  echo "Container status:"
  sudo docker compose ps
  echo "Logs:"
  sudo docker compose logs
  exit 1
fi

echo "✅ All services are running and healthy (verified by Docker health checks)."

# Run migrations directly (database is already healthy from Docker health checks)
echo "Running database migrations..."
cd "$APP_DIR"

# Ensure we're in the correct directory
if [ ! -d "$APP_DIR/migrations" ]; then
  echo "❌ Error: Migrations directory not found at $APP_DIR/migrations"
  echo "Current directory: $(pwd)"
  exit 1
fi

# Check if migrations directory has files
MIGRATION_COUNT=$(ls -1 "$APP_DIR/migrations/"*.sql 2>/dev/null | wc -l)
if [ "$MIGRATION_COUNT" -eq 0 ]; then
  echo "⚠️ Warning: No SQL migration files found in $APP_DIR/migrations."
  echo "This might indicate a problem with your repository or build process."
fi

# Run migrations with proper error handling
if ! sudo docker compose exec -T web pnpm run db:migrate; then
  echo "❌ Migration failed. See error messages above."
  exit 1
fi

echo "✅ Database migrations completed successfully."

# Verify migrations worked by checking if we can connect and query the database
echo "Verifying database setup..."
if ! sudo docker compose exec -T db bash -c "
  # Create secure .pgpass file for database verification
  PGPASS_FILE=\"/tmp/.pgpass_verify\"
  echo \"localhost:5432:$POSTGRES_DB:$POSTGRES_USER:$POSTGRES_PASSWORD\" > \"\$PGPASS_FILE\"
  chmod 600 \"\$PGPASS_FILE\"
  export PGPASSFILE=\"\$PGPASS_FILE\"

  # Run verification query and cleanup
  psql -U $POSTGRES_USER -d $POSTGRES_DB -c 'SELECT COUNT(*) FROM pg_catalog.pg_tables;' && rm -f \"\$PGPASS_FILE\"
" > /dev/null; then
  echo "⚠️ Warning: Couldn't verify database setup, but migrations reported success."
else
  echo "✅ Database verification successful."
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

# Helper function to check URL accessibility
check_url() {
  local url="$1"
  local description="$2"

  if curl -sf "$url" > /dev/null; then
    echo "✅ $description is accessible."
    return 0
  else
    echo "⚠️ Warning: $description may not be accessible."
    return 1
  fi
}

# Perform final checks
echo "Performing final deployment checks..."

# Check if the website is accessible
echo "Checking if the website is accessible..."
if ! check_url "https://$DOMAIN_NAME" "Website"; then
  echo "Checking health endpoint as fallback..."
  if check_url "https://$DOMAIN_NAME/api/health" "Health endpoint"; then
    echo "Website should be functional."
  else
    echo "Please check the application logs and Nginx configuration."
  fi
fi

# Clean up any temporary files
echo "Cleaning up temporary files..."
find /tmp -name "deploy-*" -type f -mtime +1 -delete 2>/dev/null || true

# Output final message with timestamp
echo ""
echo "✅ Deployment completed successfully at $(date)"
echo "---------------------------------------------------"
echo "Your Next.js app and PostgreSQL database are now running."
echo ""
echo "🌐 Website: https://$DOMAIN_NAME"
echo "🗄️  Database: PostgreSQL (accessible from the web service)"
echo ""
echo "The .env file has been created with your environment variables"
echo "and database migrations have been applied."
echo ""
echo "For troubleshooting, check the container logs with:"
echo "  sudo docker compose logs"
echo "---------------------------------------------------"
