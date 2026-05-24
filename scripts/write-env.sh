# Shared .env file writer. Sourced by deploy.sh and update.sh.
#
# Usage (from either deploy.sh or update.sh, after all required env vars
# have been exported):
#
#     source "$SCRIPT_DIR/scripts/write-env.sh"
#     write_env_file "$APP_DIR/.env"
#
# Design notes:
# - Helper writes the full .env. Both deploy.sh and update.sh produce
#   identical .env content for a given (ENV_NAME, exported-vars) input.
#   Previously deploy.sh silently omitted Swift/OS vars on production;
#   that was a latent bug that only surfaced if the backup container
#   restarted between init_deploy and the first subsequent update.sh.
# - Uses atomic temp-file + `install -m 600` so .env is never briefly
#   readable by anyone other than its owner during the write.
# - Validates vars required by the .env contract up front. Callers keep
#   their script-specific validation (Slack optionality, rotation
#   cadence policy, etc.).
# - Does NOT set shell options (`set -e`, `set -u`, ...) or install
#   EXIT traps — those would leak into the caller's shell and clobber
#   the caller's own trap chain. All cleanup is explicit.

_write_env_require() {
    # Fails if the named env var is unset or empty.
    local name=$1
    local val="${!name:-}"
    if [ -z "$val" ]; then
        echo "ERROR (write_env_file): $name is required but is unset or empty" >&2
        return 1
    fi
}

write_env_file() {
    local target=${1:-}
    if [ -z "$target" ]; then
        echo "ERROR: write_env_file requires a target path argument" >&2
        return 1
    fi

    # ENV_NAME defaults to "staging" when unset. Matches deploy.sh's
    # prior default; update.sh previously defaulted to "" which produced
    # an empty ENV_NAME line in .env — the new default is an
    # improvement for both paths.
    local env_name=${ENV_NAME:-staging}

    # Vars required for any environment's .env contract. Validating
    # before any file I/O means we fail before a partial .env exists.
    local req
    for req in \
        AUTH_GITHUB_ID AUTH_GITHUB_SECRET \
        AUTH_GITHUB_APP_ID AUTH_GITHUB_APP_PRIVATE_KEY AUTH_GITHUB_APP_INSTALLATION_ID \
        AUTH_SECRET \
        DOMAIN_NAME EMAIL GITHUB_ORG \
        DATABASE_URL DATABASE_URL_EXTERNAL \
        POSTGRES_DB POSTGRES_PASSWORD POSTGRES_USER \
        BRAND_NAME
    do
        _write_env_require "$req" || return 1
    done

    # Production-only .env contract additions. On staging these are
    # intentionally not exported by the CD workflow (backups disabled).
    if [ "$env_name" = "production" ]; then
        for req in \
            DB_BACKUP_PASSPHRASE \
            OS_AUTH_TYPE OS_AUTH_URL OS_REGION_NAME OS_INTERFACE OS_IDENTITY_API_VERSION \
            OS_APPLICATION_CREDENTIAL_ID OS_APPLICATION_CREDENTIAL_SECRET \
            SWIFT_CONTAINER SWIFT_PREFIX
        do
            _write_env_require "$req" || return 1
        done
    fi

    # Normalize DATABASE_SSL up-front so a typo like "required" fails the
    # deploy script instead of waiting until the container's
    # instrumentation hook rejects it on first boot. Unset/empty/whitespace
    # means "defer to DATABASE_URL" (the default for the trusted Docker
    # network). Mirror the contract from app/db/database-ssl.cjs:
    # disable | require | verify-full, case-insensitive, whitespace-trimmed.
    local database_ssl_normalized=""
    if [ -n "${DATABASE_SSL:-}" ]; then
        # ${var//[[:space:]]/} strips all whitespace; combined with lower-case
        # via tr, this matches the JS parser's .trim().toLowerCase().
        local raw_trimmed
        raw_trimmed=$(printf '%s' "$DATABASE_SSL" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
        case "$raw_trimmed" in
            "")
                # whitespace-only → treat as unset
                ;;
            disable|require|verify-full)
                database_ssl_normalized="$raw_trimmed"
                ;;
            *)
                echo "ERROR (write_env_file): DATABASE_SSL=\"$DATABASE_SSL\" is not a valid value." >&2
                echo "Expected one of: disable, require, verify-full (or unset)." >&2
                return 1
                ;;
        esac
    fi

    local tmp rc=0
    tmp=$(mktemp) || {
        echo "ERROR (write_env_file): mktemp failed" >&2
        return 1
    }

    {
        printf 'AUTH_GITHUB_ID="%s"\n' "$AUTH_GITHUB_ID"
        printf 'AUTH_GITHUB_SECRET="%s"\n' "$AUTH_GITHUB_SECRET"
        printf 'AUTH_GITHUB_APP_ID="%s"\n' "$AUTH_GITHUB_APP_ID"
        printf 'AUTH_GITHUB_APP_PRIVATE_KEY="%s"\n' "$AUTH_GITHUB_APP_PRIVATE_KEY"
        printf 'AUTH_GITHUB_APP_INSTALLATION_ID="%s"\n' "$AUTH_GITHUB_APP_INSTALLATION_ID"
        printf 'AUTH_REDIRECT_PROXY_URL="https://%s/api/auth"\n' "$DOMAIN_NAME"
        printf 'AUTH_SECRET="%s"\n' "$AUTH_SECRET"
        printf 'AUTH_TRUST_HOST=true\n'
        printf 'AUTH_URL="https://%s/api/auth"\n' "$DOMAIN_NAME"
        printf 'DATABASE_URL="%s"\n' "$DATABASE_URL"
        printf 'DATABASE_URL_EXTERNAL="%s"\n' "$DATABASE_URL_EXTERNAL"
        # DATABASE_SSL is optional and was normalized above. Empty here
        # means unset/whitespace-only — skip emitting so DATABASE_URL's
        # sslmode wins (the default for the trusted Docker network).
        if [ -n "$database_ssl_normalized" ]; then
            printf 'DATABASE_SSL="%s"\n' "$database_ssl_normalized"
        fi
        printf 'EMAIL="%s"\n' "$EMAIL"
        printf 'GITHUB_ORG="%s"\n' "$GITHUB_ORG"
        printf 'POSTGRES_DB="%s"\n' "$POSTGRES_DB"
        printf 'POSTGRES_PASSWORD="%s"\n' "$POSTGRES_PASSWORD"
        printf 'POSTGRES_USER="%s"\n' "$POSTGRES_USER"
        printf 'ENV_NAME="%s"\n' "$env_name"
        # Image tags used by Docker Compose. CI/CD exports immutable sha-* tags
        # so each deploy pulls exactly the images built by that workflow run.
        # Local/manual deploys default to latest for backwards compatibility.
        printf 'APP_IMAGE_TAG="%s"\n' "${APP_IMAGE_TAG:-latest}"
        printf 'DB_BACKUP_IMAGE_TAG="%s"\n' "${DB_BACKUP_IMAGE_TAG:-latest}"
        # SMS credentials (conditional — only if provided)
        if [ -n "${HELLO_SMS_USERNAME:-}" ]; then
            printf 'HELLO_SMS_USERNAME="%s"\n' "$HELLO_SMS_USERNAME"
        fi
        if [ -n "${HELLO_SMS_PASSWORD:-}" ]; then
            printf 'HELLO_SMS_PASSWORD="%s"\n' "$HELLO_SMS_PASSWORD"
        fi
        printf 'HELLO_SMS_TEST_MODE="%s"\n' "${HELLO_SMS_TEST_MODE:-true}"
        printf 'SMS_SEND_INTERVAL="%s"\n' "${SMS_SEND_INTERVAL:-5 minutes}"
        # SMS callback webhook secret (required for HelloSMS status callbacks in production)
        if [ -n "${SMS_CALLBACK_SECRET:-}" ]; then
            printf 'SMS_CALLBACK_SECRET="%s"\n' "$SMS_CALLBACK_SECRET"
        fi
        printf 'LOG_LEVEL="%s"\n' "${LOG_LEVEL:-info}"
        # White-label configuration
        printf 'NEXT_PUBLIC_BRAND_NAME="%s"\n' "$BRAND_NAME"
        printf 'NEXT_PUBLIC_BASE_URL="https://%s"\n' "$DOMAIN_NAME"
        # SMS sender name (optional — defaults to BRAND_NAME if not set)
        if [ -n "${SMS_SENDER:-}" ]; then
            printf 'NEXT_PUBLIC_SMS_SENDER="%s"\n' "$SMS_SENDER"
        fi
        # Anonymization scheduler configuration (always enabled for GDPR compliance)
        printf 'ANONYMIZATION_SCHEDULE="%s"\n' "${ANONYMIZATION_SCHEDULE:-0 2 * * 0}"
        printf 'ANONYMIZATION_INACTIVE_DURATION="%s"\n' "${ANONYMIZATION_INACTIVE_DURATION:-1 year}"
        # SMS health report schedule (daily at 8 AM Stockholm)
        printf 'SMS_REPORT_SCHEDULE="%s"\n' "${SMS_REPORT_SCHEDULE:-0 8 * * *}"
        # Org membership sync schedule (daily at 3 AM Stockholm)
        printf 'ORG_SYNC_SCHEDULE="%s"\n' "${ORG_SYNC_SCHEDULE:-0 3 * * *}"
        # Slack notifications (optional — alerts only sent when ENV_NAME=production)
        if [ -n "${SLACK_BOT_TOKEN:-}" ]; then
            printf 'SLACK_BOT_TOKEN="%s"\n' "$SLACK_BOT_TOKEN"
        fi
        if [ -n "${SLACK_CHANNEL_ID:-}" ]; then
            printf 'SLACK_CHANNEL_ID="%s"\n' "$SLACK_CHANNEL_ID"
        fi
        # Production-only: backup encryption + Swift/OpenStack credentials.
        # Bundled together because the backup container needs all of them
        # to start; omitting any one leaves the container unable to
        # authenticate to Elastx after a restart.
        if [ "$env_name" = "production" ]; then
            printf 'DB_BACKUP_PASSPHRASE="%s"\n' "$DB_BACKUP_PASSPHRASE"
            printf 'OS_AUTH_TYPE="%s"\n' "$OS_AUTH_TYPE"
            printf 'OS_AUTH_URL="%s"\n' "$OS_AUTH_URL"
            printf 'OS_REGION_NAME="%s"\n' "$OS_REGION_NAME"
            printf 'OS_INTERFACE="%s"\n' "$OS_INTERFACE"
            printf 'OS_IDENTITY_API_VERSION="%s"\n' "$OS_IDENTITY_API_VERSION"
            printf 'OS_APPLICATION_CREDENTIAL_ID="%s"\n' "$OS_APPLICATION_CREDENTIAL_ID"
            printf 'OS_APPLICATION_CREDENTIAL_SECRET="%s"\n' "$OS_APPLICATION_CREDENTIAL_SECRET"
            printf 'SWIFT_CONTAINER="%s"\n' "$SWIFT_CONTAINER"
            printf 'SWIFT_PREFIX="%s"\n' "$SWIFT_PREFIX"
        fi
    } > "$tmp" || rc=$?

    if [ "$rc" -eq 0 ]; then
        install -m 600 "$tmp" "$target" || rc=$?
    fi

    rm -f "$tmp"
    return "$rc"
}
