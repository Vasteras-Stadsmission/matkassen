#!/bin/bash

# Generate nginx configurations from template using envsubst
# Usage: ./generate-nginx-config.sh [local|production]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="$SCRIPT_DIR/nginx.conf.template"

generate_local_config() {
    echo "Generating local nginx configuration..."

    # Set environment variables for local development
    export NGINX_PORT="80"
    export SSL_PARAMS=""
    export SERVER_NAMES="localhost"
    export HTTP_REDIRECT_BLOCK="# No HTTP redirect needed for local development"
    export SSL_CONFIG_BLOCK="# SSL configuration omitted for local development"
    export HSTS_HEADER="# HSTS omitted for local development"
    export NEXTJS_UPSTREAM="nextjs"

    # Generate the config with specific variable substitution
    export DOLLAR='$'
    envsubst '${NGINX_PORT},${SSL_PARAMS},${SERVER_NAMES},${HTTP_REDIRECT_BLOCK},${SSL_CONFIG_BLOCK},${HSTS_HEADER},${NEXTJS_UPSTREAM}' < "$TEMPLATE_FILE" > "$SCRIPT_DIR/local.conf"

    # Add header comment
    {
        echo "# Local nginx configuration for testing"
        echo "# Generated from nginx.conf.template - DO NOT EDIT MANUALLY"
        echo "# This mirrors the production setup but without SSL"
        echo ""
        cat "$SCRIPT_DIR/local.conf"
    } > "$SCRIPT_DIR/local.conf.tmp"

    mv "$SCRIPT_DIR/local.conf.tmp" "$SCRIPT_DIR/local.conf"
    echo "✅ Generated nginx/local.conf"
}

generate_production_config() {
    local domain_names="$1"
    local primary_domain="$2"

    echo "Generating production nginx configuration..."

    # Set environment variables for production
    export NGINX_PORT="443"
    export SSL_PARAMS=" ssl"
    export SERVER_NAMES="$domain_names"
    export NEXTJS_UPSTREAM="localhost"

    # HTTP redirect block for production
    export HTTP_REDIRECT_BLOCK="# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name $domain_names;
    return 301 https://\\\$host\\\$request_uri;
}"

    # SSL configuration block
    export SSL_CONFIG_BLOCK="ssl_certificate /etc/letsencrypt/live/$primary_domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$primary_domain/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"

    # HSTS header for production
    export HSTS_HEADER='add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'

    # Generate and output the config
    {
        echo "# Production nginx configuration"
        echo "# Generated from nginx.conf.template - DO NOT EDIT MANUALLY"
        echo "# NOTE: Keep template in sync with nginx/local.conf generation"
        echo ""
        envsubst '${NGINX_PORT},${SSL_PARAMS},${SERVER_NAMES},${HTTP_REDIRECT_BLOCK},${SSL_CONFIG_BLOCK},${HSTS_HEADER},${NEXTJS_UPSTREAM}' < "$TEMPLATE_FILE"
    }
}

case "${1:-}" in
    "local")
        generate_local_config
        ;;
    "production")
        if [[ $# -lt 3 ]]; then
            echo "Usage: $0 production DOMAIN_NAMES PRIMARY_DOMAIN"
            echo "  DOMAIN_NAMES: Space-separated domain names (e.g., 'example.com www.example.com')"
            echo "  PRIMARY_DOMAIN: Primary domain for SSL cert path (e.g., 'example.com')"
            exit 1
        fi
        generate_production_config "$2" "$3"
        ;;
    *)
        echo "Usage: $0 [local|production]"
        echo "  local     - Generate local.conf for Docker development"
        echo "  production - Generate production config (outputs to stdout)"
        echo ""
        echo "Examples:"
        echo "  $0 local"
        echo "  $0 production 'example.com www.example.com' 'example.com'"
        exit 1
        ;;
esac
