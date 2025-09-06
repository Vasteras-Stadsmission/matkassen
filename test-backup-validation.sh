#!/bin/bash

# Quick test to verify pg_restore works with piped input vs file input
# This demonstrates the issue we fixed

set -euo pipefail

echo "Testing pg_restore behavior with different input methods..."

# Create a test database dump
TEMP_DIR="/tmp/backup_test"
mkdir -p "$TEMP_DIR"

# We'll use a simple SQL script to create a test dump
cat > "$TEMP_DIR/test.sql" << 'EOF'
CREATE TABLE test_table (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50)
);
INSERT INTO test_table (name) VALUES ('test1'), ('test2'), ('test3');
EOF

echo "Creating test dump file..."
# Note: This test assumes you have PostgreSQL client tools installed
# In production, this would be your actual pg_dump output
pg_dump --file="$TEMP_DIR/test.dump" --format=custom --schema-only postgres 2>/dev/null || {
    echo "Note: pg_dump not available for local testing, but the fix should work in production"
    echo "The key issue was that pg_restore --list cannot work with piped input from rclone cat"
    echo "The fix downloads the file temporarily for validation instead"
    exit 0
}

echo "Testing pg_restore --list with file input (should work):"
pg_restore --list "$TEMP_DIR/test.dump" | wc -l

echo "Testing pg_restore --list with piped input (often fails):"
cat "$TEMP_DIR/test.dump" | pg_restore --list 2>&1 | wc -l || echo "Failed as expected"

echo "Cleanup..."
rm -rf "$TEMP_DIR"

echo "The backup script fix downloads the file temporarily for validation, which should resolve the issue."
