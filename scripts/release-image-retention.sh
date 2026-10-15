# shellcheck shell=bash
# Bounded retention for locally pulled release images. Sourced by update.sh.
#
# Usage:
#
#     source "$APP_DIR/scripts/release-image-retention.sh"
#     prune_release_images ghcr.io/vasteras-stadsmission/matkassen 3 [protected-image-id...]
#
# Every deploy pulls a new immutable sha-* image (~1.5 GB for the app), and
# `docker image prune` without -a never removes tagged images, so without a
# bound the root filesystem eventually fails update.sh's free-space check.
#
# Design notes:
# - Keeps the newest <keep> distinct images of the repository, every image
#   referenced by any container (running or stopped), and any image ID passed
#   as an extra argument (update.sh passes the release that was running before
#   the deploy). Everything else in that repository is untagged with
#   `docker image rm` (never -f). Older sha-* tags remain in GHCR and can be
#   pulled again for a rollback.
# - "Newest" is the OCI org.opencontainers.image.created label written by
#   docker/metadata-action, i.e. the CI run time of the release. The image's
#   own .Created is unreliable for our builds: a GHA cache hit keeps the
#   timestamp of the build that produced the cached layers, so consecutive
#   releases can tie or appear older than they are. .Created is only the
#   fallback for images without the label (e.g. the official postgres image).
# - Best effort: a failed lookup or removal is reported and skipped, never
#   fatal. The caller's free-space check is the gate that decides whether a
#   deploy can proceed. If the in-use lookup fails, nothing is removed.
# - Bash 3.2 compatible (no mapfile or associative arrays) so the unit tests
#   can run it on macOS. Does NOT set shell options or traps, which would leak
#   into the caller.

prune_release_images() {
    local repository=${1:-}
    local keep=${2:-}
    if [ -z "$repository" ] || ! [[ "$keep" =~ ^[1-9][0-9]*$ ]]; then
        echo "ERROR (prune_release_images): usage: prune_release_images <repository> <keep>=1+ [protected-image-id...]" >&2
        return 1
    fi
    shift 2
    local protected=""
    if [ "$#" -gt 0 ]; then
        protected=$(printf '%s\n' "$@")
    fi

    local containers in_use images tag id created ref
    local kept_ids="" kept=0 removed=0 failed=0

    if ! containers=$(sudo docker ps -aq); then
        echo "⚠️ Could not list containers; skipping retention for $repository."
        return 0
    fi
    in_use=""
    if [ -n "$containers" ]; then
        # Word splitting is intended: one argument per container ID.
        # shellcheck disable=SC2086
        if ! in_use=$(sudo docker inspect --format '{{.Image}}' $containers); then
            echo "⚠️ Could not determine images in use; skipping retention for $repository."
            return 0
        fi
    fi

    if ! images=$(sudo docker image ls --no-trunc --format '{{.Tag}}	{{.ID}}' "$repository"); then
        echo "⚠️ Could not list images for $repository; skipping retention."
        return 0
    fi

    # One "<release time>	<image ID>	<reference>" line per tag, newest first.
    local sorted=""
    while IFS='	' read -r tag id; do
        [ -n "$tag" ] && [ "$tag" != "<none>" ] || continue
        ref="$repository:$tag"
        created=$(sudo docker image inspect \
            --format '{{with .Config.Labels}}{{index . "org.opencontainers.image.created"}}{{end}}|{{.Created}}' \
            "$ref") || continue
        if [ -n "${created%%|*}" ]; then
            created=${created%%|*}
        else
            created=${created#*|}
        fi
        sorted+="$created	$id	$ref"$'\n'
    done <<< "$images"
    sorted=$(printf '%s' "$sorted" | sort -r)

    while IFS='	' read -r created id ref; do
        [ -n "$ref" ] || continue
        if printf '%s\n' "$kept_ids" | grep -qxF "$id"; then
            # Another tag of an image that is already kept.
            continue
        fi
        if [ "$kept" -lt "$keep" ]; then
            kept_ids+="$id"$'\n'
            kept=$((kept + 1))
            echo "Keeping $ref (created $created)"
            continue
        fi
        if printf '%s\n' "$in_use" | grep -qxF "$id"; then
            echo "Keeping $ref (used by a container)"
            continue
        fi
        if printf '%s\n' "$protected" | grep -qxF "$id"; then
            echo "Keeping $ref (release that was running before this deploy)"
            continue
        fi
        if sudo docker image rm "$ref" >/dev/null; then
            echo "Removed $ref (created $created)"
            removed=$((removed + 1))
        else
            echo "⚠️ Could not remove $ref; leaving it in place."
            failed=$((failed + 1))
        fi
    done <<< "$sorted"

    echo "✅ $repository: kept the newest $kept image(s) plus any in use; removed $removed, failed $failed."
}
