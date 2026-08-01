#!/bin/bash

# Read-only deployment verification and host-side release state management.
#
# The state directory deliberately lives outside the Git checkout. CI force-resets
# and cleans the repository on every deploy, while these files must survive so a
# failed release can be compared with (and rolled back to) the last verified one.

set -Eeuo pipefail

readonly APP_DIR="${MATKASSEN_APP_DIR:-/home/ubuntu/matkassen}"
readonly STATE_DIR="${MATKASSEN_DEPLOY_STATE_DIR:-/var/lib/matkassen-deployment}"
readonly CURRENT_STATE="$STATE_DIR/current.env"
readonly PREVIOUS_STATE="$STATE_DIR/previous.env"
readonly PENDING_STATE="$STATE_DIR/pending.env"
readonly ATTEMPT_STATE="$STATE_DIR/attempt.env"
readonly WEB_IMAGE_REPOSITORY="ghcr.io/vasteras-stadsmission/matkassen"
readonly BACKUP_IMAGE_REPOSITORY="ghcr.io/vasteras-stadsmission/matkassen-db-backup"
readonly SOAK_SECONDS=60

die() {
    printf 'ERROR: %s\n' "$1" >&2
    exit 1
}

validate_sha() {
    [[ "$1" =~ ^[0-9a-f]{40}$ ]] || die "expected a full lowercase 40-character Git SHA"
}

validate_environment() {
    case "$1" in
        staging|production) ;;
        *) die "environment must be staging or production" ;;
    esac
}

ensure_safe_paths() {
    [[ "$APP_DIR" == /* ]] || die "application directory must be absolute"
    [[ "$STATE_DIR" == /* ]] || die "deployment state directory must be absolute"
    [[ "$STATE_DIR" != "/" ]] || die "refusing to use / as deployment state directory"
    sudo install -d -m 700 -o root -g root "$STATE_DIR"
}

compose_base() {
    sudo docker compose \
        --env-file "$APP_DIR/.env" \
        -f "$APP_DIR/docker-compose.yml" \
        "$@"
}

compose_backup() {
    sudo docker compose \
        --env-file "$APP_DIR/.env" \
        -f "$APP_DIR/docker-compose.yml" \
        -f "$APP_DIR/docker-compose.backup.yml" \
        --profile backup \
        "$@"
}

state_exists() {
    sudo test -f "$1"
}

state_value() {
    local file=$1
    local key=$2
    sudo awk -F= -v wanted="$key" '$1 == wanted { sub(/^[^=]*=/, ""); print; exit }' "$file"
}

install_state_file() {
    local source=$1
    local target=$2
    sudo install -m 600 -o root -g root "$source" "$target"
}

container_id() {
    local service=$1
    compose_base ps -q "$service"
}

backup_container_id() {
    compose_backup ps -q db-backup
}

container_revision() {
    local container=$1
    local image_id
    image_id=$(sudo docker inspect --format '{{.Image}}' "$container")
    sudo docker image inspect \
        --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
        "$image_id"
}

container_image_reference() {
    sudo docker inspect --format '{{.Config.Image}}' "$1"
}

container_image_id() {
    sudo docker inspect --format '{{.Image}}' "$1"
}

container_health() {
    sudo docker inspect \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
        "$1"
}

container_restarts() {
    sudo docker inspect --format '{{.RestartCount}}' "$1"
}

container_log_driver() {
    sudo docker inspect --format '{{.HostConfig.LogConfig.Type}}' "$1"
}

database_system_identifier() {
    compose_base exec -T db bash -c '
        PGPASSWORD="${POSTGRES_PASSWORD}" psql \
            -U "${POSTGRES_USER}" \
            -d "${POSTGRES_DB}" \
            -tAc "SELECT system_identifier::text FROM pg_control_system();"
    ' | tr -d '[:space:]'
}

database_volume_name() {
    local db_container
    db_container=$(container_id db)
    [[ -n "$db_container" ]] || die "database container is not running"
    sudo docker inspect \
        --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' \
        "$db_container"
}

migration_position() {
    compose_base exec -T db bash -c '
        PGPASSWORD="${POSTGRES_PASSWORD}" psql \
            -U "${POSTGRES_USER}" \
            -d "${POSTGRES_DB}" \
            -tAc "SELECT COALESCE(MAX(created_at), 0) FROM drizzle.__drizzle_migrations;"
    ' | tr -d '[:space:]'
}

write_runtime_state() {
    local target=$1
    local environment=$2
    local require_backup=${3:-yes}
    local web_container backup_container revision backup_revision backup_image backup_image_id
    local db_system_identifier db_volume migration_created_at temp

    validate_environment "$environment"
    web_container=$(container_id web)
    [[ -n "$web_container" ]] || die "web container is not running"
    revision=$(container_revision "$web_container")
    validate_sha "$revision"

    backup_container=""
    backup_revision=""
    backup_image=""
    backup_image_id=""
    if [[ "$environment" == "production" ]]; then
        backup_container=$(backup_container_id)
        if [[ -n "$backup_container" ]]; then
            backup_revision=$(container_revision "$backup_container")
            validate_sha "$backup_revision"
            if [[ "$backup_revision" == "$revision" ]]; then
                backup_image=$(container_image_reference "$backup_container")
                backup_image_id=$(container_image_id "$backup_container")
            elif [[ "$require_backup" == "yes" ]]; then
                die "web and backup releases do not match"
            else
                backup_revision="$revision"
                backup_image="$BACKUP_IMAGE_REPOSITORY:sha-$revision"
                backup_image_id=$(sudo docker image inspect --format '{{.Id}}' "$backup_image" 2>/dev/null || true)
            fi
        elif [[ "$require_backup" == "yes" ]]; then
            die "production backup container is not running"
        else
            # A missing old backup service must not prevent a deploy whose purpose
            # is to repair it. Both release images share the same immutable SHA.
            backup_revision="$revision"
            backup_image="$BACKUP_IMAGE_REPOSITORY:sha-$revision"
            backup_image_id=$(sudo docker image inspect --format '{{.Id}}' "$backup_image" 2>/dev/null || true)
        fi
    fi

    db_system_identifier=$(database_system_identifier)
    [[ "$db_system_identifier" =~ ^[0-9]+$ ]] || die "could not read PostgreSQL system identifier"
    db_volume=$(database_volume_name)
    [[ -n "$db_volume" ]] || die "database volume is not mounted at /var/lib/postgresql/data"
    migration_created_at=$(migration_position)
    [[ "$migration_created_at" =~ ^[0-9]+$ ]] || die "could not read migration position"

    temp=$(mktemp)
    {
        printf 'DEPLOY_SHA=%s\n' "$revision"
        printf 'ENVIRONMENT=%s\n' "$environment"
        printf 'APP_IMAGE=%s\n' "$(container_image_reference "$web_container")"
        printf 'APP_IMAGE_ID=%s\n' "$(container_image_id "$web_container")"
        printf 'BACKUP_IMAGE=%s\n' "$backup_image"
        printf 'BACKUP_IMAGE_ID=%s\n' "$backup_image_id"
        printf 'BACKUP_REVISION=%s\n' "$backup_revision"
        printf 'DB_SYSTEM_IDENTIFIER=%s\n' "$db_system_identifier"
        printf 'DB_VOLUME_NAME=%s\n' "$db_volume"
        printf 'MIGRATION_CREATED_AT=%s\n' "$migration_created_at"
        printf 'RECORDED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    } > "$temp"
    install_state_file "$temp" "$target"
    rm -f "$temp"
}

write_attempt_state() {
    local expected_sha=$1
    local environment=$2
    local temp db_system_identifier db_volume current_sha

    db_system_identifier=$(database_system_identifier)
    db_volume=$(database_volume_name)
    current_sha=""
    if state_exists "$CURRENT_STATE"; then
        current_sha=$(state_value "$CURRENT_STATE" DEPLOY_SHA)
    fi

    temp=$(mktemp)
    {
        printf 'EXPECTED_SHA=%s\n' "$expected_sha"
        printf 'ENVIRONMENT=%s\n' "$environment"
        printf 'LAST_VERIFIED_SHA=%s\n' "$current_sha"
        printf 'PRE_DB_SYSTEM_IDENTIFIER=%s\n' "$db_system_identifier"
        printf 'PRE_DB_VOLUME_NAME=%s\n' "$db_volume"
        printf 'STARTED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    } > "$temp"
    install_state_file "$temp" "$ATTEMPT_STATE"
    rm -f "$temp"
}

assert_state_database_matches_runtime() {
    local state_file=$1
    local expected_identifier expected_volume actual_identifier actual_volume
    expected_identifier=$(state_value "$state_file" DB_SYSTEM_IDENTIFIER)
    expected_volume=$(state_value "$state_file" DB_VOLUME_NAME)
    actual_identifier=$(database_system_identifier)
    actual_volume=$(database_volume_name)
    [[ "$actual_identifier" == "$expected_identifier" ]] || \
        die "PostgreSQL system identifier changed: expected $expected_identifier, got $actual_identifier"
    [[ "$actual_volume" == "$expected_volume" ]] || \
        die "PostgreSQL volume changed: expected $expected_volume, got $actual_volume"
}

assert_attempt_database_unchanged() {
    state_exists "$ATTEMPT_STATE" || die "deployment attempt state is missing"
    local expected_identifier expected_volume actual_identifier actual_volume
    expected_identifier=$(state_value "$ATTEMPT_STATE" PRE_DB_SYSTEM_IDENTIFIER)
    expected_volume=$(state_value "$ATTEMPT_STATE" PRE_DB_VOLUME_NAME)
    actual_identifier=$(database_system_identifier)
    actual_volume=$(database_volume_name)
    [[ "$actual_identifier" == "$expected_identifier" ]] || \
        die "PostgreSQL system identifier changed during deployment"
    [[ "$actual_volume" == "$expected_volume" ]] || \
        die "PostgreSQL volume changed during deployment"
}

runtime_sample() {
    local expected_sha=$1
    local environment=$2
    local check_checkout=${3:-yes}
    local web_container db_container backup_container web_revision backup_revision

    web_container=$(container_id web)
    db_container=$(container_id db)
    [[ -n "$web_container" ]] || die "web container is not running"
    [[ -n "$db_container" ]] || die "database container is not running"
    if [[ "$check_checkout" == "yes" ]]; then
        [[ "$(git -C "$APP_DIR" rev-parse HEAD)" == "$expected_sha" ]] || \
            die "host checkout does not match the expected release"
    fi

    [[ "$(container_health "$web_container")" == "healthy" ]] || die "web container is not healthy"
    [[ "$(container_health "$db_container")" == "healthy" ]] || die "database container is not healthy"
    [[ "$(container_restarts "$web_container")" == "0" ]] || die "web container restarted after deployment"
    [[ "$(container_log_driver "$web_container")" == "journald" ]] || die "web log driver is not journald"

    web_revision=$(container_revision "$web_container")
    [[ "$web_revision" == "$expected_sha" ]] || \
        die "web image revision is $web_revision; expected $expected_sha"
    [[ "$(container_image_reference "$web_container")" == "$WEB_IMAGE_REPOSITORY:sha-$expected_sha" ]] || \
        die "web container is not using the expected immutable image tag"

    backup_container=""
    if [[ "$environment" == "production" ]]; then
        backup_container=$(backup_container_id)
        [[ -n "$backup_container" ]] || die "production backup container is not running"
        [[ "$(container_health "$backup_container")" == "healthy" ]] || die "backup container is not healthy"
        [[ "$(container_restarts "$backup_container")" == "0" ]] || die "backup container restarted after deployment"
        [[ "$(container_log_driver "$backup_container")" == "journald" ]] || die "backup log driver is not journald"
        backup_revision=$(container_revision "$backup_container")
        [[ "$backup_revision" == "$expected_sha" ]] || \
            die "backup image revision is $backup_revision; expected $expected_sha"
        [[ "$(container_image_reference "$backup_container")" == "$BACKUP_IMAGE_REPOSITORY:sha-$expected_sha" ]] || \
            die "backup container is not using the expected immutable image tag"
        [[ "$(sudo docker inspect --format '{{json .Config.Cmd}}' "$backup_container")" == \
            '["supercronic","-split-logs","/etc/supercronic/crontab"]' ]] || \
            die "backup container command is not the expected Supercronic split-log command"
    fi

    printf '%s|%s|%s\n' "$web_container" "$db_container" "$backup_container"
}

prepare_deployment() {
    local expected_sha=$1
    local environment=$2
    local observed_state current_sha

    validate_sha "$expected_sha"
    validate_environment "$environment"
    ensure_safe_paths
    [[ -f "$APP_DIR/.env" ]] || die "host .env file is missing"

    observed_state=$(mktemp)
    write_runtime_state "$observed_state" "$environment" no
    if state_exists "$CURRENT_STATE"; then
        assert_state_database_matches_runtime "$CURRENT_STATE"
        current_sha=$(state_value "$CURRENT_STATE" DEPLOY_SHA)
        printf 'Last externally verified release: %s\n' "$current_sha"
    else
        install_state_file "$observed_state" "$CURRENT_STATE"
        current_sha=$(state_value "$CURRENT_STATE" DEPLOY_SHA)
        printf 'Initialized deployment state from existing healthy release: %s\n' "$current_sha"
    fi
    sudo rm -f "$observed_state"

    write_attempt_state "$expected_sha" "$environment"
    printf 'Pinned PostgreSQL cluster and volume before deploying %s.\n' "$expected_sha"
}

verify_and_record_pending() {
    local expected_sha=$1
    local environment=$2
    local attempt_sha first_sample second_sample

    validate_sha "$expected_sha"
    validate_environment "$environment"
    ensure_safe_paths
    state_exists "$ATTEMPT_STATE" || die "deployment attempt state is missing"
    attempt_sha=$(state_value "$ATTEMPT_STATE" EXPECTED_SHA)
    [[ "$attempt_sha" == "$expected_sha" ]] || die "deployment attempt targets $attempt_sha, not $expected_sha"

    assert_attempt_database_unchanged
    first_sample=$(runtime_sample "$expected_sha" "$environment")
    printf 'First runtime sample is healthy; soaking for %s seconds...\n' "$SOAK_SECONDS"
    sleep "$SOAK_SECONDS"
    second_sample=$(runtime_sample "$expected_sha" "$environment")
    [[ "$second_sample" == "$first_sample" ]] || die "container identity changed during stability soak"
    assert_attempt_database_unchanged

    write_runtime_state "$PENDING_STATE" "$environment"
    printf 'Release %s is internally stable and awaiting external verification.\n' "$expected_sha"
}

safe_cleanup() {
    # Deliberately omit `-a`: immutable sha-* images are rollback assets.
    # Dangling layers and stopped anonymous containers remain safe to prune.
    sudo docker container prune -f
    sudo docker image prune -f
    prune_old_release_images "$WEB_IMAGE_REPOSITORY"
    prune_old_release_images "$BACKUP_IMAGE_REPOSITORY"
    sudo docker system df
}

prune_old_release_images() {
    local repository=$1
    local current_sha previous_sha="" reference sha
    current_sha=$(state_value "$CURRENT_STATE" DEPLOY_SHA)
    if state_exists "$PREVIOUS_STATE"; then
        previous_sha=$(state_value "$PREVIOUS_STATE" DEPLOY_SHA)
    fi

    while IFS= read -r reference; do
        [[ "$reference" == "$repository:sha-"* ]] || continue
        sha=${reference#"$repository:sha-"}
        [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || continue
        if [[ "$sha" == "$current_sha" || "$sha" == "$previous_sha" ]]; then
            continue
        fi
        # No force flag: Docker refuses removal if any container still uses it.
        sudo docker image rm "$reference" || true
    done < <(sudo docker image ls --format '{{.Repository}}:{{.Tag}}' "$repository")
}

update_env_image_tags() {
    local sha=$1
    local temp
    temp=$(mktemp)
    if ! awk -v app_tag="sha-$sha" -v backup_tag="sha-$sha" '
        BEGIN { app_seen = 0; backup_seen = 0 }
        /^APP_IMAGE_TAG=/ {
            print "APP_IMAGE_TAG=\"" app_tag "\""
            app_seen++
            next
        }
        /^DB_BACKUP_IMAGE_TAG=/ {
            print "DB_BACKUP_IMAGE_TAG=\"" backup_tag "\""
            backup_seen++
            next
        }
        { print }
        END {
            if (app_seen != 1 || backup_seen != 1) exit 2
        }
    ' "$APP_DIR/.env" > "$temp"; then
        rm -f "$temp"
        die "host .env does not contain exactly one application and backup image tag"
    fi
    sudo install -m 600 -o ubuntu -g ubuntu "$temp" "$APP_DIR/.env"
    rm -f "$temp"
}

ensure_rollback_images() {
    local sha=$1
    local environment=$2
    local app_image="$WEB_IMAGE_REPOSITORY:sha-$sha"
    local backup_image="$BACKUP_IMAGE_REPOSITORY:sha-$sha"

    if ! sudo docker image inspect "$app_image" > /dev/null 2>&1; then
        printf 'Rollback application image is not local; pulling immutable tag.\n'
        sudo docker pull "$app_image"
    fi
    if [[ "$environment" == "production" ]] && \
        ! sudo docker image inspect "$backup_image" > /dev/null 2>&1; then
        printf 'Rollback backup image is not local; pulling immutable tag.\n'
        sudo docker pull "$backup_image"
    fi
}

start_rollback_release() {
    local sha=$1
    local environment=$2
    if [[ "$environment" == "production" ]]; then
        sudo env \
            "APP_IMAGE_TAG=sha-$sha" \
            "DB_BACKUP_IMAGE_TAG=sha-$sha" \
            docker compose \
                --env-file "$APP_DIR/.env" \
                -f "$APP_DIR/docker-compose.yml" \
                -f "$APP_DIR/docker-compose.backup.yml" \
                --profile backup \
                up -d --wait --wait-timeout 300 web db-backup
    else
        sudo env \
            "APP_IMAGE_TAG=sha-$sha" \
            docker compose \
                --env-file "$APP_DIR/.env" \
                -f "$APP_DIR/docker-compose.yml" \
                up -d --wait --wait-timeout 300 web
    fi
}

rollback_release() {
    local running_sha current_sha target_sha target_state environment
    local target_migration live_migration failed_state

    ensure_safe_paths
    state_exists "$CURRENT_STATE" || die "no externally verified release state is available"
    running_sha=$(container_revision "$(container_id web)")
    current_sha=$(state_value "$CURRENT_STATE" DEPLOY_SHA)
    target_state="$CURRENT_STATE"
    target_sha="$current_sha"

    # If the running release is already the recorded successful one, this is a
    # rollback of a later-discovered problem and the target is the prior release.
    # If they differ, a deployment failed before finalization and current.env is
    # already the correct last-known-good target.
    if [[ "$running_sha" == "$current_sha" ]]; then
        state_exists "$PREVIOUS_STATE" || die "no previous verified release is available"
        target_state="$PREVIOUS_STATE"
        target_sha=$(state_value "$PREVIOUS_STATE" DEPLOY_SHA)
    fi

    validate_sha "$target_sha"
    environment=$(state_value "$target_state" ENVIRONMENT)
    validate_environment "$environment"
    assert_state_database_matches_runtime "$target_state"
    git -C "$APP_DIR" cat-file -e "$target_sha^{commit}" 2>/dev/null || \
        die "rollback Git commit is not available in the host checkout"

    target_migration=$(state_value "$target_state" MIGRATION_CREATED_AT)
    live_migration=$(migration_position)
    if (( live_migration > target_migration )); then
        printf 'Database migrations are ahead of the rollback release.\n'
        printf 'The database will not be rolled back; proceeding under the N-1 compatibility policy.\n'
    fi

    printf 'Rolling application services back from %s to %s.\n' "$running_sha" "$target_sha"
    ensure_rollback_images "$target_sha" "$environment"
    start_rollback_release "$target_sha" "$environment"
    runtime_sample "$target_sha" "$environment" no > /dev/null
    printf 'First rollback sample is healthy; soaking for %s seconds...\n' "$SOAK_SECONDS"
    sleep "$SOAK_SECONDS"
    runtime_sample "$target_sha" "$environment" no > /dev/null
    assert_state_database_matches_runtime "$target_state"

    update_env_image_tags "$target_sha"
    if [[ "$target_state" == "$PREVIOUS_STATE" ]]; then
        failed_state="$STATE_DIR/rolled-back-from.env"
        sudo install -m 600 -o root -g root "$CURRENT_STATE" "$failed_state"
        sudo install -m 600 -o root -g root "$PREVIOUS_STATE" "$CURRENT_STATE"
        sudo rm -f "$PREVIOUS_STATE"
    fi
    sudo rm -f "$PENDING_STATE" "$ATTEMPT_STATE"

    git -C "$APP_DIR" checkout --force -B main "$target_sha"
    git -C "$APP_DIR" clean -fd
    printf 'Rollback complete. Running release: %s. Database unchanged.\n' "$target_sha"
}

finalize_deployment() {
    local expected_sha=$1
    local pending_sha current_sha environment

    validate_sha "$expected_sha"
    ensure_safe_paths
    state_exists "$PENDING_STATE" || die "pending deployment state is missing"
    pending_sha=$(state_value "$PENDING_STATE" DEPLOY_SHA)
    [[ "$pending_sha" == "$expected_sha" ]] || die "pending release is $pending_sha, not $expected_sha"
    environment=$(state_value "$PENDING_STATE" ENVIRONMENT)
    validate_environment "$environment"
    runtime_sample "$expected_sha" "$environment" > /dev/null
    assert_state_database_matches_runtime "$PENDING_STATE"

    if state_exists "$CURRENT_STATE"; then
        current_sha=$(state_value "$CURRENT_STATE" DEPLOY_SHA)
        if [[ "$current_sha" != "$pending_sha" ]]; then
            sudo install -m 600 -o root -g root "$CURRENT_STATE" "$PREVIOUS_STATE"
        fi
    fi
    sudo install -m 600 -o root -g root "$PENDING_STATE" "$CURRENT_STATE"
    sudo rm -f "$PENDING_STATE" "$ATTEMPT_STATE"
    safe_cleanup

    printf 'Release %s is now the externally verified current release.\n' "$expected_sha"
    if state_exists "$PREVIOUS_STATE"; then
        printf 'Rollback release retained: %s\n' "$(state_value "$PREVIOUS_STATE" DEPLOY_SHA)"
    fi
}

show_status() {
    local web_container running_revision="none" current="none" previous="none" pending="none"
    web_container=$(container_id web 2>/dev/null || true)
    if [[ -n "$web_container" ]]; then
        running_revision=$(container_revision "$web_container" 2>/dev/null || printf 'unknown')
    fi
    state_exists "$CURRENT_STATE" && current=$(state_value "$CURRENT_STATE" DEPLOY_SHA)
    state_exists "$PREVIOUS_STATE" && previous=$(state_value "$PREVIOUS_STATE" DEPLOY_SHA)
    state_exists "$PENDING_STATE" && pending=$(state_value "$PENDING_STATE" DEPLOY_SHA)
    printf 'Running release: %s\n' "$running_revision"
    printf 'Last externally verified release: %s\n' "$current"
    printf 'Previous verified release: %s\n' "$previous"
    printf 'Pending release: %s\n' "$pending"
}

usage() {
    printf '%s\n' \
        'Usage:' \
        '  deployment-safety.sh prepare <sha> <staging|production>' \
        '  deployment-safety.sh verify <sha> <staging|production>' \
        '  deployment-safety.sh finalize <sha>' \
        '  deployment-safety.sh rollback' \
        '  deployment-safety.sh status'
}

command_name=${1:-}
case "$command_name" in
    prepare)
        [[ $# -eq 3 ]] || { usage; exit 2; }
        prepare_deployment "$2" "$3"
        ;;
    verify)
        [[ $# -eq 3 ]] || { usage; exit 2; }
        verify_and_record_pending "$2" "$3"
        ;;
    finalize)
        [[ $# -eq 2 ]] || { usage; exit 2; }
        finalize_deployment "$2"
        ;;
    rollback)
        [[ $# -eq 1 ]] || { usage; exit 2; }
        rollback_release
        ;;
    status)
        [[ $# -eq 1 ]] || { usage; exit 2; }
        show_status
        ;;
    *)
        usage
        exit 2
        ;;
esac
