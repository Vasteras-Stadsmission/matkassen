#!/bin/bash

# Playwright MCP Server Troubleshooting Script
# This script checks if the Playwright MCP server is properly configured

echo "🔍 Playwright MCP Server Troubleshooting"
echo "=========================================="
echo ""

# Check 1: Is the package installed?
echo "1️⃣ Checking if @playwright/mcp is installed..."
if npm list @playwright/mcp >/dev/null 2>&1; then
    echo "✅ Package is installed"
    npm list @playwright/mcp | head -3
else
    echo "❌ Package NOT installed"
    echo "   Run: pnpm add -D @playwright/mcp"
    exit 1
fi
echo ""

# Check 2: Can pnpm execute the MCP server binary?
echo "2️⃣ Checking if pnpm can execute the MCP server binary..."
if command -v pnpm >/dev/null 2>&1; then
    echo "✅ pnpm is available at: $(which pnpm)"
else
    echo "❌ pnpm not found in PATH"
    exit 1
fi
if pnpm exec mcp-server-playwright --version >/dev/null 2>&1; then
    echo "✅ pnpm exec mcp-server-playwright --version succeeded"
else
    echo "❌ Could not execute mcp-server-playwright via pnpm"
    echo "   Try running: pnpm exec mcp-server-playwright --version"
    exit 1
fi
echo ""

# Check 3: Does the config file exist?
echo "3️⃣ Checking MCP configuration file..."
if [ -f ".github/copilot-mcp.json" ]; then
    echo "✅ Config file exists: .github/copilot-mcp.json"
    echo "   Content:"
    cat .github/copilot-mcp.json | jq '.' 2>/dev/null || cat .github/copilot-mcp.json
else
    echo "❌ Config file NOT found: .github/copilot-mcp.json"
    exit 1
fi
echo ""

# Check 4: VS Code settings
echo "4️⃣ Checking VS Code workspace settings..."
if [ -f ".vscode/settings.json" ]; then
    echo "✅ VS Code settings exist"
    if grep -q "github.copilot.chat.mcp" .vscode/settings.json; then
        echo "✅ MCP settings found in workspace"
    else
        echo "⚠️  MCP settings NOT found in workspace"
        echo "   Add these to .vscode/settings.json:"
        echo '   "github.copilot.chat.mcp.enabled": true,'
        echo '   "github.copilot.chat.mcp.configFile": "${workspaceFolder}/.github/copilot-mcp.json"'
    fi
else
    echo "❌ No VS Code settings file"
fi
echo ""

# Check 5: Dev server status
echo "5️⃣ Checking if dev server is running..."
if lsof -i :3000 >/dev/null 2>&1; then
    echo "✅ Dev server is running on port 3000"
    lsof -i :3000 | grep LISTEN
else
    echo "⚠️  Dev server NOT running"
    echo "   The MCP server needs the app running at http://localhost:3000"
    echo "   Start it with: pnpm run dev"
fi
echo ""

# Check 6: Try to test the MCP server (timeout after 3 seconds)
echo "6️⃣ Testing MCP server startup..."
if command -v timeout >/dev/null 2>&1; then
    timeout 3 pnpm exec mcp-server-playwright --version 2>&1 | head -5 || {
        EXIT_CODE=$?
        if [ $EXIT_CODE -eq 124 ]; then
            echo "⚠️  MCP server command timed out (this can happen - it's a long-running server)"
        else
            echo "❌ MCP server failed to start (exit code: $EXIT_CODE)"
        fi
    }
else
    if pnpm exec mcp-server-playwright --version >/dev/null 2>&1; then
        echo "✅ MCP server responded to --version"
    else
        echo "❌ MCP server failed to respond"
    fi
fi
echo ""

# Check 7: GitHub Copilot extension status
echo "7️⃣ GitHub Copilot Extension Requirements"
echo "   ⚠️  IMPORTANT: Manual steps required!"
echo ""
echo "   To enable the Playwright MCP server in VS Code:"
echo ""
echo "   1. Open VS Code Command Palette (Cmd+Shift+P)"
echo "   2. Search for: 'Reload Window'"
echo "   3. Execute the reload"
echo "   4. Open GitHub Copilot Chat"
echo "   5. Click the tools icon (wrench) in the chat"
echo "   6. Look for 'MCP Server: playwright' in the list"
echo ""
echo "   If it still doesn't appear:"
echo "   - Ensure GitHub Copilot extension is updated"
echo "   - Check that you're using VS Code Insiders or stable with MCP support"
echo "   - Try: Developer: Reload Window"
echo ""

echo "=========================================="
echo "✅ Configuration Check Complete!"
echo ""
echo "Next steps:"
echo "1. Reload VS Code window (Cmd+Shift+P → 'Reload Window')"
echo "2. Open GitHub Copilot Chat"
echo "3. Click the tools/configure icon"
echo "4. Enable 'MCP Server: playwright'"
echo "5. The server should now be available!"
