#!/bin/bash
# Setup VPS log viewing aliases for Matkassen
# Run this on your VPS to install helpful log viewing shortcuts

set -e

BASHRC="$HOME/.bashrc"
BACKUP="$HOME/.bashrc.backup.$(date +%s)"

echo "📝 Setting up Matkassen log viewing aliases..."

# Create backup
if [ -f "$BASHRC" ]; then
    cp "$BASHRC" "$BACKUP"
    echo "✅ Backed up .bashrc to $BACKUP"
fi

# Check if aliases already exist
if grep -q "# ===== Matkassen Docker Logs =====" "$BASHRC" 2>/dev/null; then
    echo "⚠️  Matkassen aliases already exist in .bashrc"
    echo "   Remove them manually first if you want to reinstall"
    exit 1
fi

# Append aliases to .bashrc
cat >> "$BASHRC" << EOF

# ===== Matkassen Docker Logs =====
# Installed by scripts/setup-vps-aliases.sh

# Container name (change here if needed)
MATKASSEN_CONTAINER=matkassen-web-1

# Basic viewing
alias logs='sudo docker logs "\$MATKASSEN_CONTAINER"'
alias logs-tail='sudo docker logs -f "\$MATKASSEN_CONTAINER"'
alias logs-100='sudo docker logs --tail=100 "\$MATKASSEN_CONTAINER"'
alias logs-1000='sudo docker logs --tail=1000 "\$MATKASSEN_CONTAINER"'

# Errors and warnings (colored JSON)
alias logs-errors='sudo docker logs "\$MATKASSEN_CONTAINER" | jq -R "fromjson? | select(.level == \\"ERROR\\")" -C'
alias logs-warnings='sudo docker logs "\$MATKASSEN_CONTAINER" | jq -R "fromjson? | select(.level == \\"WARN\\" or .level == \\"ERROR\\")" -C'

# Simple readable format (time + level + message)
alias logs-simple='sudo docker logs "\$MATKASSEN_CONTAINER" | jq -R -r "fromjson? | select(. != null) | \\"\(.time) [\(.level)] \(.msg)\\""'
alias logs-errors-simple='sudo docker logs "\$MATKASSEN_CONTAINER" | jq -R -r "fromjson? | select(.level == \\"ERROR\\") | \\"\(.time) \(.msg)\\""'

# Time-based
alias logs-1h='sudo docker logs --since=1h "\$MATKASSEN_CONTAINER"'
alias logs-errors-1h='sudo docker logs --since=1h "\$MATKASSEN_CONTAINER" | jq -R "fromjson? | select(.level == \\"ERROR\\")" -C'
alias logs-today='sudo docker logs --since=\$(date -u +%Y-%m-%dT00:00:00) "\$MATKASSEN_CONTAINER"'

# Search with context
alias logs-search='_logs_search() { sudo docker logs "\$MATKASSEN_CONTAINER" | grep -i "\$1" -C 5; }; _logs_search'

# Stats and analysis
alias logs-error-count='sudo docker logs "\$MATKASSEN_CONTAINER" | jq -R -r "fromjson? | select(.level == \\"ERROR\\") | .msg" | sort | uniq -c | sort -rn'
alias logs-level-count='sudo docker logs "\$MATKASSEN_CONTAINER" | jq -R -r "fromjson? | .level" | grep -v "^\$" | sort | uniq -c | sort -rn'

# Application-specific filters
alias logs-sms='sudo docker logs "\$MATKASSEN_CONTAINER" | jq -R "fromjson? | select(.msg | tostring | contains(\\"SMS\\"))" -C'
alias logs-scheduler='sudo docker logs "\$MATKASSEN_CONTAINER" | jq -R "fromjson? | select(.job != null)" -C'
alias logs-health='sudo docker logs "\$MATKASSEN_CONTAINER" | jq -R "fromjson? | select(.msg | tostring | contains(\\"health\\") or contains(\\"Health\\"))" -C'

EOF

echo "✅ Aliases added to $BASHRC"
echo ""
echo "⚠️  Run 'source ~/.bashrc' to activate aliases"

echo ""
echo "📖 Available commands:"
echo "   logs-simple          - Easy to read, all logs"
echo "   logs-errors-simple   - Just errors, clean format"
echo "   logs-tail            - Live tail"
echo "   logs-1h              - Last hour"
echo "   logs-search 'text'   - Find text with context"
echo ""
echo "See docs/production-logs.md for full documentation"
