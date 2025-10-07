# Playwright MCP for Matkassen

> **⚠️ LOCAL ONLY**: E2E tests are not intended for CI/CD. They require manual authentication and make no assumptions about database state.

Complete guide for setting up and using Playwright E2E tests with MCP (Model Context Protocol) for AI agent control.

## Quick Start

### 1. Authenticate (One-Time Setup)

```bash
pnpm run test:e2e:auth
```

**What happens:**
1. 📋 Terminal prompts you for session cookie
2. 🌐 Open http://localhost:3000/sv in your browser
3. � Log in with GitHub (if not already logged in)
4. 🛠️ Open DevTools (F12 or Cmd+Option+I)
5. 📂 Go to Application → Cookies → http://localhost:3000
6. 📋 Find cookie: `next-auth.session-token.v2`
7. 📝 Copy its value (usually starts with "ey...")
8. ✅ Paste into terminal
9. ✨ Session saved - you're done!

**⏰ Takes about 10 seconds total.**

### 2. Run Tests

```bash
# Check setup status
pnpm run test:e2e:check

# Run all tests (local only, with CI disabled)
pnpm run test:e2e

# Interactive UI
pnpm run test:e2e:ui

# Watch browser
pnpm run test:e2e:headed
```

**Note**: Tests use `cross-env CI=` to explicitly disable CI mode, ensuring proper local-only behavior.

### 3. Enable AI Control (Optional)

Add to VS Code **User Settings** (`Cmd+Shift+P` → "Preferences: Open User Settings (JSON)"):

```json
{
  "github.copilot.chat.mcp.servers": {
    "playwright": {
      "command": "pnpm",
      "args": [
        "exec",
        "mcp-server-playwright",
        "--storage-state=.auth/user.json",
        "--host",
        "127.0.0.1"
      ],
      "env": {
        "PLAYWRIGHT_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

**Restart VS Code**, then ask GitHub Copilot:
> "Navigate to /sv/households and take a screenshot"

---

## Understanding the Setup

### Why GitHub OAuth is Tricky

Your app uses real GitHub OAuth for authentication. We can't mock or bypass this in tests, so we use **session persistence**:

1. **Authenticate once manually** → Session cookies saved to `.auth/user.json`
2. **All tests reuse the session** → No need to re-authenticate
3. **Session expires (~30 days)** → Re-run setup when needed

The `.auth/` directory is gitignored (not committed to repo).

### Authentication Flow Step-by-Step

```
┌─────────────────────────────────────────────┐
│  1. Run: pnpm run test:e2e:setup           │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  2. Browser opens → Login page              │
│     You have 5 MINUTES (not 30 seconds!)    │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  3. YOU CLICK: "Sign in with GitHub"        │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  4. GitHub login page appears               │
│     Enter username + password               │
│     (If already logged in, this auto-skips) │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  5. Authorize app (if first time)           │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  6. Redirect back → Dashboard loads         │
│     Wait 2-3 seconds on this page           │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│  7. Playwright detects auth success         │
│     Saves cookies → Browser closes ✅       │
└─────────────────────────────────────────────┘
```

**If browser closes too early**, you didn't complete all steps. Just run setup again!

---

## Available Commands

```bash
# Setup & Status
pnpm run test:e2e:setup     # Authenticate (5-minute timeout)
pnpm run test:e2e:check     # Check setup status

# Running Tests
pnpm run test:e2e           # Run all tests (headless)
pnpm run test:e2e:ui        # Interactive UI mode
pnpm run test:e2e:headed    # Watch browser while testing
pnpm run test:e2e:debug     # Debug with Playwright Inspector
pnpm run test:e2e:report    # View HTML report
```

---

## Project Structure

```
e2e/
  auth.setup.ts           # Auth setup (runs before tests)
  admin.spec.ts           # Admin dashboard tests
  public-parcel.spec.ts   # Public pages (no auth needed)
  workflows.spec.ts       # Complete user flow tests
  test-helpers.ts         # Reusable utilities

playwright.config.ts      # Playwright configuration
.auth/user.json          # Saved session (gitignored)
```

---

## Writing Tests

### Basic Test

```typescript
import { test, expect } from "@playwright/test";

test("navigate to households", async ({ page }) => {
  await page.goto("/sv/households");
  await expect(page).toHaveURL(/\/sv\/households/);
});
```

### Using Helpers

```typescript
import {
  navigateToLocale,
  clickButton,
  waitForNotification,
} from "./test-helpers";

test("create household", async ({ page }) => {
  await navigateToLocale(page, "/households");
  await clickButton(page, "Create");
  await waitForNotification(page, "Success");
});
```

### Testing Public Pages (No Auth)

```typescript
test.describe("Public Pages", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("public parcel page", async ({ page }) => {
    await page.goto("/p/some-parcel-id");
    // No authentication required
  });
});
```

---

## Locator Strategies

**Prefer in this order:**

1. **Test IDs**: `page.locator('[data-testid="user-avatar"]')`
2. **Roles**: `page.getByRole('button', { name: 'Sign in' })`
3. **Labels**: `page.getByLabel('Name')`
4. **Text**: `page.getByText('Households')`
5. **CSS** (last resort): `page.locator('.mantine-Button-root')`

### Mantine Components

```typescript
// Modal
await expect(page.locator('[role="dialog"]')).toBeVisible();

// Notification
await expect(page.locator('[class*="mantine-Notification"]'))
  .toContainText('Success');

// Table row
const row = page.locator('tbody tr', { hasText: 'John Doe' });
await row.locator('button[aria-label="Edit"]').click();
```

---

## Using with AI Agents

### For GitHub Copilot

After configuring MCP in VS Code User Settings, you can ask:

- "Navigate to /sv/households and take a screenshot"
- "Test creating a new household through the UI"
- "Verify all navigation links work"
- "Check if form validation works correctly"

### For Other AI Agents

The setup works with any agent supporting MCP:
- Cursor
- Aider (configure in `.aider.conf.yml`)
- Gemini CLI (configure in `.gemini/settings.json`)
- And 20+ other tools

See [AGENTS.md](../AGENTS.md) for full project context.

---

## Troubleshooting

### Browser Closes Before Login

**Cause**: The test has a 5-minute timeout. If browser closes early, you might have hit a different error.

**Fix**:
1. Check terminal output for error messages
2. Ensure dev server is running: `pnpm run dev`
3. Try again: `pnpm run test:e2e:setup`

### Session Expired

**Symptoms**: Tests redirect to `/auth/signin` instead of working

**Fix**:
```bash
rm -rf .auth
pnpm run test:e2e:setup
```

### Dev Server Not Running

```bash
# Terminal 1
pnpm run dev

# Terminal 2
pnpm run test:e2e
```

### MCP Not Working in VS Code

1. Verify config in **User Settings** (not Workspace Settings)
2. Restart VS Code completely
3. Check Output panel → "GitHub Copilot Chat"
4. Ensure Copilot extension is updated

---

## Best Practices

1. **Add `data-testid` attributes** for reliable selectors
2. **Keep tests independent** - don't rely on execution order
3. **Clean up test data** when possible
4. **Use semantic selectors** - roles, labels, text
5. **Test critical flows** - focus on core functionality

---

## Related Documentation

- **AGENTS.md** - Complete AI agent instructions
- **docs/ai-agent-playwright-guide.md** - Detailed guide for AI agents
- **Playwright Docs** - https://playwright.dev
- **MCP Protocol** - https://modelcontextprotocol.io

---

## Summary

✅ **Setup once**: `pnpm run test:e2e:setup` (5-minute timeout)
✅ **Run tests**: `pnpm run test:e2e`
✅ **AI control**: Configure MCP in VS Code → Ask Copilot to test
✅ **Write tests**: Create files in `e2e/` directory

**The authentication is the only manual step. After that, everything is automated!**

### Test User Flows

> "Can you test the household creation flow? Create a new household, verify it appears in the list, then delete it."

> "Navigate to the schedule page and verify all the parcel items are displayed correctly."

### Verify Bug Fixes

> "I just fixed the form validation. Can you test submitting the form with invalid data and verify the error messages appear?"

### Take Screenshots

> "Take a screenshot of the dashboard after logging in."

### Check Accessibility

> "Navigate through the app using keyboard only and check if all interactive elements are accessible."

## Available Test Scripts

```bash
# Run all E2E tests
pnpm run test:e2e

# Open Playwright UI for interactive testing
pnpm run test:e2e:ui

# Run tests in headed mode (see browser)
pnpm run test:e2e:headed

# Debug tests with Playwright Inspector
pnpm run test:e2e:debug

# View HTML report from last test run
pnpm run test:e2e:report

# Set up authentication (run once)
pnpm run test:e2e:setup
```

## Project Structure

```
e2e/
  auth.setup.ts           # Authentication setup (runs before tests)
  admin.spec.ts           # Admin dashboard tests
  public-parcel.spec.ts   # Public parcel page tests (no auth)

playwright.config.ts      # Playwright configuration
.auth/                    # Saved authentication state (gitignored)
  user.json              # Authenticated session (created after setup)
```

## How Authentication Works

The project uses GitHub OAuth which requires manual authentication. Here's how we handle it:

1. **First Time Setup**: Run `pnpm run test:e2e:setup`
   - Opens a browser
   - You manually complete GitHub OAuth
   - Session cookies are saved to `.auth/user.json`

2. **Subsequent Tests**:
   - Playwright loads the saved session from `.auth/user.json`
   - No need to authenticate again
   - Works until the session expires

3. **Session Expiry**:
   - If tests start failing with auth errors
   - Run `pnpm run test:e2e:setup` again
   - Re-authenticate to refresh the session

## Environment Variables

- `PLAYWRIGHT_BASE_URL`: Base URL for tests (default: `http://localhost:3000`)
- `CI`: When set, enables CI-specific behavior (different reporter, retries)

## Troubleshooting

### Authentication State Invalid

If you see authentication errors:

```bash
# Delete old auth state and re-authenticate
rm -rf .auth
pnpm run test:e2e:setup
```

### Tests Failing Locally

Make sure your dev server is running:

```bash
# In one terminal
pnpm run dev

# In another terminal
pnpm run test:e2e
```

### MCP Server Not Working

1. Check that the MCP server is configured in your VS Code settings
2. Restart VS Code after adding MCP configuration
3. Check the Output panel in VS Code for MCP logs
4. Ensure you're using a compatible version of GitHub Copilot extension

### Slow Test Startup

The first run downloads browser binaries (Chromium ~130MB). Subsequent runs are fast.

## CI/CD Integration

The Playwright setup is designed to work in CI/CD with the following considerations:

1. **Authentication in CI**: You'll need to:
   - Either mock the authentication for CI
   - Or use a test account with stored credentials
   - Or test only public pages in CI

2. **GitHub Actions Example**:

```yaml
- name: Install Playwright
  run: pnpm exec playwright install --with-deps chromium

- name: Run E2E tests
  run: pnpm run test:e2e
  env:
    CI: true
```

## Best Practices

1. **Keep Auth State Fresh**: Re-authenticate if tests start failing
2. **Use Page Object Pattern**: For complex tests, create page objects
3. **Test Critical Flows**: Focus on core user journeys
4. **Screenshot on Failure**: Enabled by default for debugging
5. **Parallel Execution**: Tests run in parallel by default
6. **Stable Selectors**: Use `data-testid` attributes for reliable element selection

## Adding Test Data Attributes

To make tests more reliable, add `data-testid` attributes to key elements:

```tsx
// Example: components/UserAvatar.tsx
<Avatar data-testid="user-avatar" src={user.image} />

// Example: components/LanguageSwitcher.tsx
<Menu data-testid="language-switcher">
  <Menu.Item data-testid="language-en">English</Menu.Item>
  <Menu.Item data-testid="language-sv">Svenska</Menu.Item>
</Menu>
```

Then in tests:

```typescript
await page.locator('[data-testid="user-avatar"]').click();
await page.locator('[data-testid="language-en"]').click();
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright MCP (official)](https://github.com/microsoft/playwright-mcp)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [GitHub Copilot MCP Documentation](https://docs.github.com/en/copilot)
