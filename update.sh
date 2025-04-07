#!/bin/bash

# This script updates the Next.js app by pulling the latest changes from the Git repository,
# rebuilding the Docker containers, and restarting them.
# It assumes that the app is already set up with Docker and Docker Compose.
# It also assumes that the .env file is already created and contains the necessary environment variables.

# Script Vars
PROJECT_NAME=matkassen
REPO_URL="https://github.com/Vasteras-Stadsmission/matkassen.git"
APP_DIR=~/$PROJECT_NAME

# Pull the latest changes from the Git repository
if [ -d "$APP_DIR" ]; then
  echo "Pulling latest changes from the repository..."
  cd $APP_DIR
  echo "Discarding any local changes..."
  git reset --hard HEAD
  git clean -fd
  git pull origin main
else
  echo "App directory not found. Please run deploy.sh first."
  exit 1
fi

# Ensure environment variables are preserved
if [ -f "$APP_DIR/.env" ]; then
  echo "Using existing environment variables..."
else
  echo "ERROR: .env file not found"
  exit 1
fi

# Build and restart the Docker containers
echo "Rebuilding and restarting Docker containers..."
cd $APP_DIR
sudo docker compose down
sudo docker compose build --no-cache
sudo docker compose up -d

# Check if Docker Compose started correctly
if ! sudo docker compose ps | grep "Up"; then
  echo "Docker containers failed to start. Check logs with 'docker compose logs'."
  exit 1
fi

# Output final message
echo "Update complete. Your Next.js app has been updated with the latest changes."
