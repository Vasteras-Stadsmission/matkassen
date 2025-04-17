#!/bin/bash

# This script waits for the PostgreSQL database to become available
# before running migrations

# Maximum number of attempts to connect to the database
MAX_ATTEMPTS=30
# Delay between attempts in seconds
DELAY=1

echo "Waiting for database to be ready..."
for i in $(seq 1 $MAX_ATTEMPTS); do
    # Try to connect to the database using pg_isready
    if pg_isready -h localhost -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" &>/dev/null; then
        echo "Database is ready! Continuing..."
        exit 0
    fi

    echo "Database not ready yet (attempt $i/$MAX_ATTEMPTS)... waiting"
    sleep $DELAY
done

echo "Failed to connect to database after $MAX_ATTEMPTS attempts."
echo "If you don't have pg_isready installed, migrations might still work but could fail if database isn't ready."
exit 0  # Exit with success to allow migrations to try anyway
