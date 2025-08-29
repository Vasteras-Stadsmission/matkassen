#!/bin/bash

# Nginx configuration validator script
# Tests both local and production nginx configurations for syntax errors

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🔍 Validating nginx configurations..."

# Check if nginx is available
if ! command -v nginx &> /dev/null; then
    echo "⚠️ nginx command not found. Installing nginx for validation..."
    if command -v brew &> /dev/null; then
        # macOS with Homebrew
        brew install nginx
    elif command -v apt-get &> /dev/null; then
        # Ubuntu/Debian
        sudo apt-get update && sudo apt-get install -y nginx
    else
        echo "❌ Cannot install nginx automatically. Please install nginx and run again."
        echo "   macOS: brew install nginx"
        echo "   Ubuntu: sudo apt-get install nginx"
        exit 1
    fi
fi

# Test local configuration
echo "📝 Testing local configuration..."
# Create a version with dummy upstream for syntax validation
TEMP_LOCAL_CONF="/tmp/nginx-local-test.conf"

# Find mime.types location
MIME_TYPES="/etc/nginx/mime.types"
if [ ! -f "$MIME_TYPES" ]; then
    # Try homebrew location on macOS
    MIME_TYPES="/opt/homebrew/etc/nginx/mime.types"
fi
if [ ! -f "$MIME_TYPES" ]; then
    # Skip mime.types if not found
    MIME_TYPES=""
fi

cat > "$TEMP_LOCAL_CONF" << EOF
events {
    worker_connections 1024;
}
http {
$([ -n "$MIME_TYPES" ] && echo "    include       $MIME_TYPES;")
    default_type  application/octet-stream;
EOF

# Replace Docker container names with localhost for validation
sed -e 's/server nextjs:3000/server 127.0.0.1:3000/' \
    -e 's|include /etc/nginx/shared.conf;|# shared.conf content would be here|' \
    "$PROJECT_ROOT/nginx/local.conf" >> "$TEMP_LOCAL_CONF"
echo "}" >> "$TEMP_LOCAL_CONF"

if ! nginx -t -c "$TEMP_LOCAL_CONF" 2>/dev/null; then
    echo "❌ Local nginx configuration has syntax errors:"
    nginx -t -c "$TEMP_LOCAL_CONF"
    rm -f "$TEMP_LOCAL_CONF"
    exit 1
else
    echo "✅ Local configuration is valid"
    rm -f "$TEMP_LOCAL_CONF"
fi

# Test production configuration (generate temporary file)
echo "📝 Testing production configuration..."
TEMP_PROD_CONF="/tmp/nginx-prod-test.conf"
TEMP_PROD_WRAPPED="/tmp/nginx-prod-wrapped-test.conf"

# Create temporary SSL certificate files for validation
TEMP_SSL_CERT="/tmp/test-cert.pem"
TEMP_SSL_KEY="/tmp/test-key.pem"

# Generate self-signed certificate for testing only
openssl req -x509 -newkey rsa:2048 -keyout "$TEMP_SSL_KEY" -out "$TEMP_SSL_CERT" \
    -days 1 -nodes -subj "/CN=test" 2>/dev/null || {
    echo "⚠️ Could not generate test SSL cert, skipping SSL validation"
    exit 0
}

# Generate config and filter out the status message
if ! "$PROJECT_ROOT/nginx/generate-nginx-config.sh" production "example.com www.example.com" "example.com" 2>/dev/null | grep -v "^Generating" > "$TEMP_PROD_CONF"; then
    echo "❌ Failed to generate production configuration"
    exit 1
fi

# Wrap production config in http context
cat > "$TEMP_PROD_WRAPPED" << EOF
events {
    worker_connections 1024;
}
http {
$([ -n "$MIME_TYPES" ] && echo "    include       $MIME_TYPES;")
    default_type  application/octet-stream;
EOF

# Replace includes for validation
sed -e 's/server localhost:3000/server 127.0.0.1:3000/' \
    -e 's|include /etc/nginx/shared.conf;|# shared.conf content would be here|' \
    -e 's|include /etc/letsencrypt/options-ssl-nginx.conf;|# SSL options would be here|' \
    -e 's|ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;|# ssl_dhparam would be here;|' \
    -e "s|ssl_certificate .*;|ssl_certificate $TEMP_SSL_CERT;|" \
    -e "s|ssl_certificate_key .*;|ssl_certificate_key $TEMP_SSL_KEY;|" \
    "$TEMP_PROD_CONF" >> "$TEMP_PROD_WRAPPED"
echo "}" >> "$TEMP_PROD_WRAPPED"

if ! nginx -t -c "$TEMP_PROD_WRAPPED" 2>/dev/null; then
    echo "❌ Production nginx configuration has syntax errors:"
    nginx -t -c "$TEMP_PROD_WRAPPED"
    rm -f "$TEMP_PROD_CONF" "$TEMP_PROD_WRAPPED" "$TEMP_SSL_CERT" "$TEMP_SSL_KEY"
    exit 1
else
    echo "✅ Production configuration is valid"
    rm -f "$TEMP_PROD_CONF" "$TEMP_PROD_WRAPPED" "$TEMP_SSL_CERT" "$TEMP_SSL_KEY"
fi

echo "🎉 All nginx configurations are valid!"
