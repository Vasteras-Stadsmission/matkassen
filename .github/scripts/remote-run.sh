#!/usr/bin/env bash
# Runs the bash script on stdin on a matkassen server, as the deploy user.
#
#   remote-run.sh <staging|production> [VAR ...] <<'REMOTE'
#   ...script...
#   REMOTE
#
# Each VAR is exported to the script with its value from this runner's
# environment; the script receives no other runner variables. Reads SSH_HOST,
# SSH_USER and SSH_KEY from the environment. The server's host key must match
# .github/ssh_known_hosts, so credentials never reach a wrong host.
set -euo pipefail

target=$1
shift
host_alias="matkassen-${target}"
known_hosts="$(dirname "$0")/../ssh_known_hosts"
grep -q "^${host_alias} " "$known_hosts" || {
    echo "❌ No pinned host key for ${host_alias}"
    exit 1
}

key_dir=$(mktemp -d)
trap 'rm -rf "$key_dir"' EXIT
(umask 077 && printf '%s\n' "$SSH_KEY" >"$key_dir/key")

# The whole script is wrapped in a function so bash has read all of it before
# anything runs: a command that reads stdin then gets /dev/null instead of the
# rest of the script.
{
    echo 'main() {'
    for name in "$@"; do
        printf 'export %s=%q\n' "$name" "${!name}"
    done
    cat
    echo '}'
    echo 'main </dev/null'
} | ssh -i "$key_dir/key" \
    -o IdentitiesOnly=yes \
    -o BatchMode=yes \
    -o StrictHostKeyChecking=yes \
    -o UserKnownHostsFile="$known_hosts" \
    -o GlobalKnownHostsFile=/dev/null \
    -o HostKeyAlias="$host_alias" \
    -o ConnectTimeout=30 \
    -o ServerAliveInterval=30 \
    -o ServerAliveCountMax=4 \
    "${SSH_USER}@${SSH_HOST}" 'bash -s'
