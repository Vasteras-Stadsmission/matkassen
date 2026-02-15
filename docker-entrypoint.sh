#!/bin/sh
set -e

# Only run migrations on startup if explicitly enabled (for local development)
# Production deployments handle migrations via update.sh for better control
if [ "${RUN_MIGRATIONS_ON_STARTUP:-false}" = "true" ]; then
    echo "Running database migrations..."
    if ! node_modules/.bin/drizzle-kit migrate; then
        echo "Error: Database migrations failed." >&2
        exit 1
    fi
fi

echo "Starting Next.js server..."
exec node server.js
