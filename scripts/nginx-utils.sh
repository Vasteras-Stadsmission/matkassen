#!/bin/bash

# Nginx configuration utility functions

# Function to set up domain variables based on environment type
setup_domain_vars() {
    local domain_name="$1"
    local environment="$2"  # "production", "staging", "development"

    # Validate environment parameter
    case "$environment" in
        "production"|"staging"|"development")
            # Valid environment
            ;;
        *)
            echo "❌ Error: Invalid environment '$environment'. Must be 'production', 'staging', or 'development'"
            return 1
            ;;
    esac

    case "$environment" in
        "production")
            # Production: include www subdomain
            DOMAIN_NAMES="$domain_name www.$domain_name"
            CERTBOT_DOMAINS="-d $domain_name -d www.$domain_name"
            echo "✓ Production environment configured for domain: $domain_name"
            ;;
        "staging"|"development")
            # Non-production: no www subdomain
            DOMAIN_NAMES="$domain_name"
            CERTBOT_DOMAINS="-d $domain_name"
            echo "✓ $environment environment configured for domain: $domain_name"
            ;;
    esac

    # Export for use in other scripts
    export DOMAIN_NAMES
    export CERTBOT_DOMAINS
}

# Function to generate nginx configuration from template
update_nginx_config() {
    local domain_name="$1"
    local project_name="$2"
    local app_dir="$3"
    local environment="$4"  # "production", "staging", "development"

    # Validate required parameters
    if [ -z "$domain_name" ] || [ -z "$project_name" ] || [ -z "$app_dir" ] || [ -z "$environment" ]; then
        echo "❌ Error: Missing required parameters"
        echo "Usage: update_nginx_config <domain_name> <project_name> <app_dir> <environment>"
        echo "Environment must be: production, staging, or development"
        return 1
    fi

    # Set up domain variables
    if ! setup_domain_vars "$domain_name" "$environment"; then
        return 1
    fi

    echo "Updating nginx configuration..."

    # Create temp file with substituted variables
    local temp_config="/tmp/nginx-${project_name}-config"

    # Check if template exists
    if [ ! -f "$app_dir/nginx-config.template" ]; then
        echo "❌ Error: nginx-config.template not found in $app_dir"
        return 1
    fi

    # Read template and substitute variables
    sed -e "s/{{DOMAIN_NAME}}/$domain_name/g" \
        -e "s/{{DOMAIN_NAMES}}/$DOMAIN_NAMES/g" \
        "$app_dir/nginx-config.template" > "$temp_config"

    # Apply the configuration
    sudo cp "$temp_config" "/etc/nginx/sites-available/$project_name"

    # Ensure site is enabled
    sudo ln -sf "/etc/nginx/sites-available/$project_name" "/etc/nginx/sites-enabled/$project_name"

    # Test nginx configuration
    if ! sudo nginx -t; then
        echo "❌ Nginx configuration test failed"
        return 1
    fi

    # Reload nginx
    sudo systemctl reload nginx

    # Clean up temp file
    rm -f "$temp_config"

    echo "✅ Nginx configuration updated successfully"
    echo "   Domain: $domain_name"
    echo "   Environment: $environment"
    echo "   Server names: $DOMAIN_NAMES"
}
