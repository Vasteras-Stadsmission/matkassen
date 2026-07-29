#!/usr/bin/env bash
# Setup VPS log viewing aliases for Matkassen
# Run this on your VPS to install or refresh helpful log viewing shortcuts.

set -euo pipefail

readonly BASHRC="${HOME}/.bashrc"
readonly START_MARKER="# ===== Matkassen Log Aliases (managed): start ====="
readonly END_MARKER="# ===== Matkassen Log Aliases (managed): end ====="
readonly LEGACY_MARKER="# ===== Matkassen Docker Logs ====="

updated_bashrc="$(mktemp "${BASHRC}.matkassen.XXXXXX")"

cleanup() {
    rm -f "$updated_bashrc"
}
trap cleanup EXIT

echo "📝 Setting up Matkassen log viewing aliases..."

if [[ -f "$BASHRC" ]]; then
    backup="$(mktemp "${HOME}/.bashrc.backup.XXXXXX")"
    cp "$BASHRC" "$backup"
    chmod --reference="$BASHRC" "$updated_bashrc"
    echo "✅ Backed up .bashrc to $backup"
else
    touch "$BASHRC"
fi

start_count="$(grep -Fxc "$START_MARKER" "$BASHRC" || true)"
end_count="$(grep -Fxc "$END_MARKER" "$BASHRC" || true)"
legacy_count="$(grep -Fxc "$LEGACY_MARKER" "$BASHRC" || true)"

if [[ "$start_count" -gt 1 || "$end_count" -gt 1 || "$legacy_count" -gt 1 ]]; then
    echo "Multiple Matkassen alias blocks found in $BASHRC; refusing to guess which one to replace." >&2
    exit 1
fi

if [[ "$start_count" -eq 1 || "$end_count" -eq 1 ]]; then
    if [[ "$start_count" -ne 1 || "$end_count" -ne 1 || "$legacy_count" -ne 0 ]]; then
        echo "Malformed or mixed Matkassen alias markers found in $BASHRC." >&2
        exit 1
    fi

    if ! awk -v start="$START_MARKER" -v end="$END_MARKER" '
        $0 == start {
            if (inside || removed) exit 2
            inside = 1
            removed = 1
            next
        }
        $0 == end {
            if (!inside) exit 2
            inside = 0
            next
        }
        !inside { print }
        END {
            if (inside || !removed) exit 2
        }
    ' "$BASHRC" >"$updated_bashrc"; then
        echo "Could not safely replace the managed Matkassen alias block." >&2
        exit 1
    fi
elif [[ "$legacy_count" -eq 1 ]]; then
    if ! awk -v start="$LEGACY_MARKER" '
        $0 == start {
            if (inside || removed) exit 2
            inside = 1
            removed = 1
            next
        }
        inside && /^alias logs-health=/ {
            inside = 0
            next
        }
        !inside { print }
        END {
            if (inside || !removed) exit 2
        }
    ' "$BASHRC" >"$updated_bashrc"; then
        echo "The legacy Matkassen alias block is incomplete; refusing to edit $BASHRC." >&2
        exit 1
    fi
else
    cp "$BASHRC" "$updated_bashrc"
fi

if [[ -s "$updated_bashrc" ]] &&
    [[ "$(tail -c 1 "$updated_bashrc" | wc -l | tr -d ' ')" -eq 0 ]]; then
    printf '\n' >>"$updated_bashrc"
fi

cat >>"$updated_bashrc" <<'EOF'
# ===== Matkassen Log Aliases (managed): start =====
# Installed by scripts/setup-vps-aliases.sh

# Stable Docker container names used as journald metadata.
MATKASSEN_CONTAINER_NAME=matkassen-web-1
MATKASSEN_BACKUP_CONTAINER_NAME=matkassen-db-backup-1

# Retained application history across container replacements.
alias logs='sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" --no-pager -o cat'
alias logs-tail='sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" -f -o cat'
alias logs-100='sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" -n 100 --no-pager -o cat'
alias logs-1000='sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" -n 1000 --no-pager -o cat'

# Errors and warnings (colored JSON).
alias logs-errors='sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" --no-pager -o cat | jq -R "fromjson? | select(.level == \"ERROR\")" -C'
alias logs-warnings='sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" --no-pager -o cat | jq -R "fromjson? | select(.level == \"WARN\" or .level == \"ERROR\")" -C'

# Simple readable format (time + level + message).
alias logs-simple='sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" --no-pager -o cat | jq -R -r "fromjson? | select(. != null) | \"\(.time) [\(.level)] \(.msg)\""'
alias logs-errors-simple='sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" --no-pager -o cat | jq -R -r "fromjson? | select(.level == \"ERROR\") | \"\(.time) \(.msg)\""'

# Time-based retained history.
alias logs-1h='sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" --since "1 hour ago" --no-pager -o cat'
alias logs-errors-1h='sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" --since "1 hour ago" --no-pager -o cat | jq -R "fromjson? | select(.level == \"ERROR\")" -C'
alias logs-today='sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" --since today --no-pager -o cat'

# Search with context.
alias logs-search='_logs_search() { sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" --no-pager -o cat | grep -i "$1" -C 5; }; _logs_search'

# Stats and analysis.
alias logs-error-count='sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" --no-pager -o cat | jq -R -r "fromjson? | select(.level == \"ERROR\") | .msg" | sort | uniq -c | sort -rn'
alias logs-level-count='sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" --no-pager -o cat | jq -R -r "fromjson? | .level" | grep -v "^$" | sort | uniq -c | sort -rn'

# Application-specific filters.
alias logs-sms='sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" --no-pager -o cat | jq -R "fromjson? | select(.msg | tostring | contains(\"SMS\"))" -C'
alias logs-scheduler='sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" --no-pager -o cat | jq -R "fromjson? | select(.job != null)" -C'
alias logs-health='sudo journalctl CONTAINER_NAME="$MATKASSEN_CONTAINER_NAME" --no-pager -o cat | jq -R "fromjson? | select(.msg | tostring | contains(\"health\") or contains(\"Health\"))" -C'

# Backup history and journal capacity.
alias logs-backup-24h='sudo journalctl CONTAINER_NAME="$MATKASSEN_BACKUP_CONTAINER_NAME" --since "24 hours ago" --no-pager -o cat'
alias logs-disk-usage='sudo journalctl --disk-usage'

# Explicit current-container shortcuts. These do not survive container removal.
alias logs-current='sudo docker logs "$MATKASSEN_CONTAINER_NAME"'
alias logs-current-tail='sudo docker logs -f "$MATKASSEN_CONTAINER_NAME"'

# ===== Matkassen Log Aliases (managed): end =====
EOF

mv "$updated_bashrc" "$BASHRC"
updated_bashrc=""

echo "✅ Aliases installed in $BASHRC"
echo ""
echo "⚠️  Run 'source ~/.bashrc' to activate aliases"
echo ""
echo "📖 Available commands:"
echo "   logs-simple          - Readable retained application history"
echo "   logs-errors-simple   - Retained errors in a compact format"
echo "   logs-tail            - Live application output"
echo "   logs-1h              - Retained output from the last hour"
echo "   logs-search 'text'   - Find text with context"
echo "   logs-backup-24h      - Backup output from the last 24 hours"
echo "   logs-current         - Current container only"
echo ""
echo "See docs/production-logs.md for full documentation"
