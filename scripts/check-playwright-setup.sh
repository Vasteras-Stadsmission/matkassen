#!/bin/bash

# Check Playwright setup status

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}${BLUE}Playwright MCP Setup Status${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if Playwright is installed
if [ -f "node_modules/.bin/playwright" ] || command -v playwright &> /dev/null; then
    echo -e "${GREEN}✓${NC} Playwright installed"
else
    echo -e "${RED}✗${NC} Playwright not installed"
    echo -e "  ${YELLOW}Run:${NC} pnpm install"
    exit 1
fi

# Check if chromium is installed
CHROMIUM_PATH=""
if [ -d "$HOME/Library/Caches/ms-playwright" ]; then
    CHROMIUM_PATH=$(find "$HOME/Library/Caches/ms-playwright" -type d -name "chromium-*" 2>/dev/null | head -n 1)
elif [ -d "$HOME/.cache/ms-playwright" ]; then
    CHROMIUM_PATH=$(find "$HOME/.cache/ms-playwright" -type d -name "chromium-*" 2>/dev/null | head -n 1)
fi

if [ -n "$CHROMIUM_PATH" ]; then
    echo -e "${GREEN}✓${NC} Chromium browser installed"
else
    echo -e "${RED}✗${NC} Chromium browser not installed"
    echo -e "  ${YELLOW}Run:${NC} pnpm exec playwright install chromium"
    exit 1
fi

# Check if authenticated
if [ -f ".auth/user.json" ]; then
    echo -e "${GREEN}✓${NC} Authentication configured"

    # Check file size (should be > 100 bytes if valid)
    size=$(wc -c < ".auth/user.json" | tr -d ' ')
    if [ "$size" -lt 100 ]; then
        echo -e "  ${YELLOW}⚠${NC}  Auth file seems invalid (too small)"
        echo -e "  ${YELLOW}Run:${NC} pnpm run test:e2e:setup"
    fi
else
    echo -e "${RED}✗${NC} Authentication not configured"
    echo -e "  ${YELLOW}Run:${NC} pnpm run test:e2e:setup"
    echo ""
    exit 1
fi

# Check if dev server is running
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Dev server running (localhost:3000)"
else
    echo -e "${YELLOW}⚠${NC}  Dev server not running"
    echo -e "  ${YELLOW}Start with:${NC} pnpm run dev"
fi

echo ""
echo -e "${BOLD}${GREEN}✅ Setup complete! You're ready to run E2E tests.${NC}"
echo ""
echo -e "${BOLD}Commands:${NC}"
echo -e "  pnpm run test:e2e          ${BLUE}# Run all tests${NC}"
echo -e "  pnpm run test:e2e:ui       ${BLUE}# Interactive test UI${NC}"
echo -e "  pnpm run test:e2e:headed   ${BLUE}# Watch browser while testing${NC}"
echo ""
