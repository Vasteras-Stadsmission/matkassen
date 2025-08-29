#!/bin/bash

# This script updates the Next.js app, rebuilding the Docker containers and restarting them.
# It assumes that the app is already set up with Docker and Docker Compose
# and that the git repository is already up to date (handled by CI/CD workflow).
# It also assumes that the .env file is already created and contains the necessary environment variables.

# Port conflict resolution function for updates
check_and_resolve_port_conflicts() {
  echo "Checking for port conflicts on 80 and 443..."

  # Check what's using port 80
  if sudo ss -tlnp | grep -q ':80 '; then
    echo "⚠️ Port 80 is in use. Checking processes..."
    sudo ss -tlnp | grep ':80 '

    # Stop nginx service properly and clean up any rogue masters
    sudo systemctl stop nginx || true
    if pgrep -x nginx > /dev/null; then
      sudo killall -q nginx || true
    fi
    sleep 2

    # Check again
    if sudo ss -tlnp | grep -q ':80 '; then
      echo "❌ Port 80 still in use after cleanup. Manual intervention required."
      sudo ss -tlnp | grep ':80 '
      exit 1
    fi
  fi

  # Check what's using port 443
  if sudo ss -tlnp | grep -q ':443 '; then
    echo "⚠️ Port 443 is in use. Checking processes..."
    sudo ss -tlnp | grep ':443 '

    # Stop nginx service properly and clean up any rogue masters
    sudo systemctl stop nginx || true
    if pgrep -x nginx > /dev/null; then
      sudo killall -q nginx || true
    fi
    sleep 2

    # Check again
    if sudo ss -tlnp | grep -q ':443 '; then
      echo "❌ Port 443 still in use after cleanup. Manual intervention required."
      sudo ss -tlnp | grep ':443 '
      exit 1
    fi
  fi

  echo "✅ Ports 80 and 443 are available"
}

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

# Install systemd override for nginx resilience (if not already installed)
if [ ! -f /etc/systemd/system/nginx.service.d/override.conf ]; then
    echo "Installing nginx systemd override for auto-recovery..."
    sudo mkdir -p /etc/systemd/system/nginx.service.d
    sudo cp "$APP_DIR/systemd/nginx-override.conf" /etc/systemd/system/nginx.service.d/override.conf
    sudo systemctl daemon-reload
    echo "✅ Nginx systemd override installed"
else
    echo "✅ Nginx systemd override already installed"
fi

# Generate and test nginx configuration before applying
TEMP_NGINX_CONF="/tmp/nginx-update.conf"
if ! ./nginx/generate-nginx-config.sh production "$DOMAIN_NAME www.$DOMAIN_NAME" "$DOMAIN_NAME" > "$TEMP_NGINX_CONF"; then
    echo "❌ Failed to generate nginx configuration"
    exit 1
fi

echo "✅ Nginx configuration generated successfully"

# Check and resolve any port conflicts before applying nginx changes
check_and_resolve_port_conflicts

# Apply the configuration
sudo cp "$TEMP_NGINX_CONF" /etc/nginx/sites-available/default
sudo cp nginx/shared.conf /etc/nginx/shared.conf

# Add HTTP-level directives to main nginx.conf if not already present
if ! grep -q "upstream nextjs_backend" /etc/nginx/nginx.conf; then
  echo "Adding HTTP-level directives to nginx.conf..."
  # Add upstream and rate limiting directives to the http block
  sudo sed -i '/http {/a\\n    # Rate limiting zone for matkassen app\n    limit_req_zone $binary_remote_addr zone=app:10m rate=50r/s;\n\n    # Upstream configuration for Next.js app\n    upstream nextjs_backend {\n        server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;\n        keepalive 32;\n    }' /etc/nginx/nginx.conf
  echo "✅ HTTP-level directives added to nginx.conf"
else
  echo "✅ HTTP-level directives already present in nginx.conf"
fi

rm -f "$TEMP_NGINX_CONF"

# Test the complete nginx configuration before reloading
echo "Testing complete nginx configuration..."
if ! sudo nginx -t; then
    echo "❌ Nginx configuration test failed. Please check the configuration manually."
    exit 1
fi
echo "✅ Nginx configuration test passed"

# Gracefully reload nginx with error handling
if ! sudo systemctl reload nginx; then
    echo "⚠️ Graceful reload failed, attempting restart..."
    sudo systemctl restart nginx
    if ! sudo systemctl is-active --quiet nginx; then
        echo "❌ Nginx failed to restart. Check configuration and logs."
        sudo systemctl status nginx
        exit 1
    fi
fi

echo "✅ Nginx configuration updated and reloaded"

# Build and restart the Docker containers
echo "Rebuilding and restarting Docker containers..."
cd "$APP_DIR"

# Enable Docker Compose Bake for potentially better build performance (if not already set)
export COMPOSE_BAKE=${COMPOSE_BAKE:-true}

# Build with better error handling
if ! sudo docker compose build --no-cache; then
    echo "❌ Docker build failed"
    exit 1
fi

# Start containers with health check dependencies
echo "Starting containers with health checks..."
if ! sudo docker compose up -d --wait --wait-timeout 300 2>/dev/null; then
    echo "⚠️ --wait flag not supported, falling back to basic startup..."
    if ! sudo docker compose up -d; then
        echo "❌ Docker containers failed to start"
        sudo docker compose logs
        exit 1
    fi

    # Manual health check fallback
    echo "Waiting for containers to be healthy..."
    sleep 30
    if ! sudo docker compose ps | grep -q "healthy\|Up"; then
        echo "❌ Containers may not be healthy"
        sudo docker compose ps
        exit 1
    fi
fi

echo "✅ All services are running and healthy"

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

# Output final message
echo "Update complete. Your Next.js app has been updated with the latest changes and database migrations have been applied."
