#!/bin/bash

# This script sets up a Next.js app with PostgreSQL and Nginx on an Ubuntu server.
# It installs Docker, Docker Compose, and Certbot for SSL certificates.
# It also configures Nginx with security headers and rate limiting.
# It assumes that the server is running Ubuntu and has a public IP address.

# Verify that the environment variables are set
for var in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB EMAIL AUTH_GITHUB_ID AUTH_GITHUB_SECRET AUTH_SECRET DOMAIN_NAME; do
  if [ -z "${!var}" ]; then
    echo "Error: $var environment variable is not set"
    exit 1
  fi
done

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
REPO_URL="https://github.com/Vasteras-Stadsmission/matkassen.git"
APP_DIR=~/$PROJECT_NAME
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
sudo rm -f /usr/local/bin/docker-compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.34.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# Wait for the file to be fully downloaded before proceeding
if [ ! -f /usr/local/bin/docker-compose ]; then
  echo "Docker Compose download failed. Exiting."
  exit 1
fi

sudo chmod +x /usr/local/bin/docker-compose

# Ensure Docker Compose is executable and in path
sudo ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose

# Verify Docker Compose installation
docker compose version
if [ $? -ne 0 ]; then
  echo "Docker Compose installation failed. Exiting."
  exit 1
fi

# Ensure Docker starts on boot and start Docker service
sudo systemctl enable docker
sudo systemctl start docker

# Clone the Git repository
if [ -d "$APP_DIR" ]; then
  echo "Directory $APP_DIR already exists. Pulling latest changes..."
  cd $APP_DIR && git pull
else
  echo "Cloning repository from $REPO_URL..."
  git clone $REPO_URL $APP_DIR
  cd $APP_DIR
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
sudo rm -f /etc/nginx/sites-available/$PROJECT_NAME
sudo rm -f /etc/nginx/sites-enabled/$PROJECT_NAME

# Create a temporary basic Nginx config for initial setup
sudo tee /etc/nginx/sites-available/$PROJECT_NAME > /dev/null <<EOL
server {
    listen 80;
    server_name $DOMAIN_NAMES;

    location / {
        return 200 "Server is being configured";
    }
}
EOL

# Enable the temporary configuration
sudo ln -s /etc/nginx/sites-available/$PROJECT_NAME /etc/nginx/sites-enabled/$PROJECT_NAME

# Start Nginx with temporary config
sudo systemctl restart nginx

# Use certbot with the nginx plugin to automatically handle certificates and configuration
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx $CERTBOT_DOMAINS --non-interactive --agree-tos -m $EMAIL

# Ensure SSL files exist or generate them
if [ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]; then
  sudo wget https://raw.githubusercontent.com/certbot/certbot/main/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf -P /etc/letsencrypt/
fi

if [ ! -f /etc/letsencrypt/ssl-dhparams.pem ]; then
  sudo openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
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

# Now, replace the Nginx config with the full configuration including security headers
sudo tee /etc/nginx/sites-available/$PROJECT_NAME > /dev/null <<EOL
limit_req_zone \$binary_remote_addr zone=mylimit:10m rate=10r/s;

# Redirect HTTP traffic to HTTPS
server {
    listen 80;
    server_name $DOMAIN_NAMES;

    # Redirect all HTTP requests to HTTPS
    return 301 https://\$host\$request_uri;
}

# Serve HTTPS traffic
server {
    listen 443 ssl;
    server_name $DOMAIN_NAMES;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; form-action 'self' https://github.com; upgrade-insecure-requests;" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()" always;

    # Enable rate limiting
    limit_req zone=mylimit burst=20 nodelay;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_cache_bypass \$http_upgrade;

        # Disable buffering for streaming support
        proxy_buffering off;
        proxy_set_header X-Accel-Buffering no;
    }
}
EOL

# Restart Nginx to apply the updated configuration
sudo systemctl restart nginx

# Build and run the Docker containers from the app directory
cd $APP_DIR
sudo COMPOSE_BAKE=true docker compose build --no-cache
sudo docker compose up -d

# Check if Docker Compose started correctly
if ! sudo docker compose ps | grep "Up"; then
  echo "Docker containers failed to start. Check logs with 'docker compose logs'."
  exit 1
fi

# Cleanup old Docker images and containers
sudo docker system prune -af

# Output final message
echo "Deployment complete. Your Next.js app and PostgreSQL database are now running.
Next.js is available at https://$DOMAIN_NAME, and the PostgreSQL database is accessible from the web service.

The .env file has been created..."
