#!/bin/bash

# This script updates the Next.js app by pulling the latest changes from the Git repository,
# rebuilding the Docker containers, and restarting them.
# It assumes that the app is already set up with Docker and Docker Compose.
# It also assumes that the .env file is already created and contains the necessary environment variables.

# Script Vars
PROJECT_NAME=matkassen
GITHUB_ORG=vasteras-stadsmission
REPO_URL="https://github.com/Vasteras-Stadsmission/matkassen.git"
APP_DIR=~/$PROJECT_NAME

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

# Verify .env file was created successfully
[ -f "$APP_DIR/.env" ] || { echo "ERROR: Failed to create .env file"; exit 1; }

# Build and restart the Docker containers
echo "Rebuilding and restarting Docker containers..."
cd $APP_DIR
sudo COMPOSE_BAKE=true docker compose build
sudo docker compose up -d

# Check if Docker Compose started correctly
if ! sudo docker compose ps | grep "Up"; then
  echo "Docker containers failed to start. Check logs with 'docker compose logs'."
  exit 1
fi

# Wait for the database to be ready
echo "Applying database schema changes..."
sudo docker compose exec web bun run db:push --force
if [ $? -ne 0 ]; then
  echo "Database schema changes failed. Check logs with 'docker compose logs'."
  exit 1
fi

# Cleanup old Docker images and containers
sudo docker system prune -af

# Output final message
echo "Update complete. Your Next.js app has been updated with the latest changes."
