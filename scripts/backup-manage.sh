#!/bin/bash

# Database backup management script
# Usage: ./scripts/backup-manage.sh [start|stop|status|logs|test]

set -euo pipefail

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.backup.yml"
COMPOSE_CMD="docker compose"
if ! docker compose version >/dev/null 2>&1; then
    echo "Error: docker compose (v2) is required. Please install Docker Compose v2 and use 'docker compose', not 'docker-compose'."
    exit 1
fi
ENV_NAME=${ENV_NAME:-}

require_prod() {
    if [ "${ENV_NAME}" != "production" ]; then
        echo "Refusing: backups allowed only in ENV_NAME=production
         (current: ${ENV_NAME:-unset})."
        echo "Tip: set ENV_NAME=production and use compose profiles (-p) or COMPOSE_PROFILES=backup."
        exit 1
    fi
}

case "${1:-}" in
    start)
        echo "Starting database backup service..."
    require_prod
    # Compose takes the image tag from .env, which each deploy pins to its
    # sha-* image. --no-deps keeps a pending PostgreSQL image change in
    # docker-compose.yml from restarting db (see postgres-image-update.sh).
    $COMPOSE_CMD $COMPOSE_FILES --profile backup up -d --no-deps db-backup
        echo "Backup service started. It will run nightly at 2:00 AM."
        ;;

    stop)
        echo "Stopping database backup service..."
    $COMPOSE_CMD $COMPOSE_FILES --profile backup stop db-backup
    $COMPOSE_CMD $COMPOSE_FILES --profile backup rm -f db-backup
        echo "Backup service stopped."
        ;;

    status)
        echo "Backup service status:"
    $COMPOSE_CMD $COMPOSE_FILES --profile backup ps db-backup
        ;;

    logs)
        echo "Showing backup service logs (press Ctrl+C to exit):"
    $COMPOSE_CMD $COMPOSE_FILES --profile backup logs -f db-backup
        ;;

    test)
        echo "Running test backup..."
    require_prod
    # Run the nightly job's script in the running container, with its image,
    # user and environment. Never recreate the container here.
    if [ -z "$($COMPOSE_CMD $COMPOSE_FILES --profile backup ps -q --status running db-backup)" ]; then
        echo "Error: the db-backup container is not running. Start it with: $0 start"
        exit 1
    fi
    $COMPOSE_CMD $COMPOSE_FILES --profile backup exec db-backup /usr/local/bin/backup-db.sh
        ;;

    config)
        echo "Backup configuration:"
        echo "- ENV_NAME: ${ENV_NAME:-unset}"
        echo "- BACKUP_RETENTION_DAYS: ${BACKUP_RETENTION_DAYS:-14}"
        echo "- SWIFT_CONTAINER: ${SWIFT_CONTAINER:-unset}"
        echo "- SWIFT_PREFIX: ${SWIFT_PREFIX:-backups}"
        echo ""
        echo "Configuration files:"
        if [ -f ".env" ]; then
            echo "✓ .env file exists"
        else
            echo "✗ .env file missing"
        fi
        ;;

    *)
    echo "Usage: $0 {start|stop|status|logs|test|config}"
        echo ""
        echo "Commands:"
        echo "  start  - Start the backup service"
        echo "  stop   - Stop the backup service"
        echo "  status - Show service status"
        echo "  logs   - Show service logs"
        echo "  test   - Run a backup now in the running service"
        echo "  config - Show backup configuration"
        exit 1
        ;;
esac
