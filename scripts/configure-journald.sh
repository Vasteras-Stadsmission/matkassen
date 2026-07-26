#!/usr/bin/env bash

# Configure persistent, bounded systemd journal storage on a Matkassen VPS.
#
# deploy.sh and update.sh call this as root before replacing Docker containers.
# It is safe to rerun: unchanged policy avoids a restart, while an interrupted
# policy update forces the next run to finish loading it.
#
# Usage: sudo ./scripts/configure-journald.sh
#
# The script verifies the effective policy and a persistent canary. It does not
# change Docker logging drivers, delete journal records, or export logs off-host.

set -euo pipefail

export LC_ALL=C

readonly CONFIG_DIR="/etc/systemd/journald.conf.d"
readonly CONFIG_FILE="$CONFIG_DIR/90-matkassen-retention.conf"
readonly JOURNAL_DIR="/var/log/journal"
readonly RESTART_REQUIRED_FILE="/run/matkassen-journald-restart-required"

if [[ "$(id -u)" -ne 0 ]]; then
    echo "This script must be run as root (for example with sudo)." >&2
    exit 1
fi

for command in awk cmp find grep install journalctl mktemp stat systemctl systemd-analyze systemd-cat systemd-tmpfiles; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "Required command is unavailable: $command" >&2
        exit 1
    fi
done

desired_config="$(mktemp)"
pending_config=""

cleanup() {
    rm -f "$desired_config"
    if [[ -n "$pending_config" ]]; then
        rm -f "$pending_config"
    fi
}
trap cleanup EXIT

printf '%s\n' \
    "[Journal]" \
    "Storage=persistent" \
    "SystemMaxUse=2G" \
    "SystemKeepFree=5G" \
    "MaxRetentionSec=0" \
    "Compress=yes" >"$desired_config"

mkdir -p "$JOURNAL_DIR"
systemd-tmpfiles --create --prefix "$JOURNAL_DIR"

if [[ ! -d "$JOURNAL_DIR" ]]; then
    echo "Persistent journal directory was not created: $JOURNAL_DIR" >&2
    exit 1
fi

if [[ "$(stat -c '%u' "$JOURNAL_DIR")" != "0" ]]; then
    echo "Persistent journal directory is not owned by root: $JOURNAL_DIR" >&2
    exit 1
fi

if find "$JOURNAL_DIR" -maxdepth 0 -perm -0002 -print -quit | grep -q .; then
    echo "Persistent journal directory must not be world-writable: $JOURNAL_DIR" >&2
    exit 1
fi

install -d -o root -g root -m 0755 "$CONFIG_DIR"

config_changed=false
if [[ ! -f "$CONFIG_FILE" ]] ||
    ! cmp -s "$desired_config" "$CONFIG_FILE" ||
    [[ "$(stat -c '%u:%g:%a' "$CONFIG_FILE")" != "0:0:644" ]]; then
    # Keep this marker until the restarted service is confirmed active. If this
    # run is interrupted after installing the drop-in, the next run must not
    # mistake matching file content for a policy already loaded by journald.
    install -o root -g root -m 0600 /dev/null "$RESTART_REQUIRED_FILE"

    pending_config="$(mktemp "$CONFIG_DIR/.90-matkassen-retention.conf.XXXXXX")"
    install -o root -g root -m 0644 "$desired_config" "$pending_config"
    mv -f "$pending_config" "$CONFIG_FILE"
    pending_config=""
    config_changed=true
fi

if [[ "$config_changed" == "true" || -f "$RESTART_REQUIRED_FILE" ]]; then
    echo "Journald retention policy changed; restarting systemd-journald..."
    systemctl restart systemd-journald
else
    echo "Journald retention policy is already current; restart not required."
fi

if ! systemctl is-active --quiet systemd-journald; then
    echo "systemd-journald is not active after configuration." >&2
    exit 1
fi

rm -f "$RESTART_REQUIRED_FILE"

journalctl --flush

effective_config="$(systemd-analyze cat-config systemd/journald.conf)"

effective_journal_value() {
    local key="$1"

    awk -F= -v expected_key="$key" '
        /^[[:space:]]*#/ { next }
        /^[[:space:]]*\[/ {
            section = $0
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", section)
            next
        }
        section == "[Journal]" {
            candidate = $1
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", candidate)
            if (candidate == expected_key) {
                value = substr($0, index($0, "=") + 1)
                gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
            }
        }
        END { print value }
    ' <<<"$effective_config"
}

assert_effective_value() {
    local key="$1"
    local expected="$2"
    local actual

    actual="$(effective_journal_value "$key")"
    if [[ "$actual" != "$expected" ]]; then
        echo "Effective journald setting $key is '$actual'; expected '$expected'." >&2
        echo "A later systemd drop-in may be overriding $CONFIG_FILE." >&2
        exit 1
    fi
}

assert_effective_value "Storage" "persistent"
assert_effective_value "SystemMaxUse" "2G"
assert_effective_value "SystemKeepFree" "5G"
assert_effective_value "MaxRetentionSec" "0"
assert_effective_value "Compress" "yes"

canary="matkassen-journal-canary-$(date +%s)-$$"
printf '%s\n' "$canary" | systemd-cat --identifier=matkassen-journal-canary --priority=info
journalctl --sync

if ! journalctl \
    --file="$JOURNAL_DIR/*/*.journal" \
    --identifier=matkassen-journal-canary \
    --since="-1 minute" \
    --quiet \
    --no-pager \
    --output=cat |
    grep -Fqx "$canary"; then
    echo "Journal canary could not be read back from persistent storage." >&2
    exit 1
fi

echo "Persistent journald storage is configured and verified."
