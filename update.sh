#!/bin/bash

# This script updates the Next.js app, rebuilding the Docker containers and restarting them.
# It assumes that the app is already set up with Docker and Docker Compose
# and that the git repository is already up to date (handled by CI/CD workflow).
# It also assumes that the .env file is already created and contains the necessary environment variables.

# Script Vars
PROJECT_NAME=matkassen
GITHUB_ORG=vasteras-stadsmission
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

# Check if migration files exist in the repository
if [ -z "$(ls -A "$APP_DIR/migrations" 2>/dev/null)" ]; then
  echo "No migration files found in the repository. This is unexpected as migrations should be checked in."
  echo "Please make sure migrations are generated locally and committed to the repository."
  exit 1
fi

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

# Run migrations directly rather than waiting for the migration container
echo "Running database migrations synchronously..."
cd $APP_DIR
sudo docker compose exec -T db bash -c "while ! pg_isready -U $POSTGRES_USER -d $POSTGRES_DB; do sleep 1; done"
sudo docker compose exec -T web bun run db:migrate
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
