# Testing Guide

## Overview

The project uses:

- **Vitest** for unit tests
- **React Testing Library** for component tests
- **Playwright** for E2E tests

## Unit Testing

### Running Tests

```bash
pnpm test              # Run all unit tests
pnpm test -- --watch   # Watch mode
pnpm test -- --ui      # Interactive UI
```

### Test File Conventions

- Place tests in `__tests__/` directory
- Mirror the source structure: `__tests__/app/[locale]/example/actions.test.ts`
- Use `.test.ts` or `.test.tsx` suffix

### Example Unit Test

```typescript
import { describe, it, expect } from "vitest";
import { myFunction } from "@/app/utils/example";

describe("myFunction", () => {
    it("should return expected value", () => {
        const result = myFunction("input");
        expect(result).toBe("expected");
    });
});
```

### Component Testing

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MyComponent } from "@/components/MyComponent";

describe("MyComponent", () => {
    it("renders correctly", () => {
        render(<MyComponent title="Test" />);
        expect(screen.getByText("Test")).toBeInTheDocument();
    });
});
```

## E2E Testing with Playwright

### Status: ⚠️ LOCAL ONLY (Not CI-Ready)

E2E tests require GitHub OAuth authentication and run against a local database. They are **intentionally minimal** to avoid flakiness from database state assumptions.

### Philosophy

**DO test**:

- ✅ Pages load without crashes
- ✅ Authentication state persists
- ✅ Navigation flows work
- ✅ API endpoints are reachable

**DON'T test** (until we have data seeding):

- ❌ Data mutations
- ❌ Complex multi-step workflows
- ❌ Assumptions about DB content

### First-Time Setup

**Authentication is required once** (valid ~30 days):

```bash
pnpm run test:e2e:auth
```

This opens a browser:

1. Click "Sign in with GitHub"
2. Complete OAuth flow
3. Wait on dashboard (session is saved automatically)
4. Close browser when prompted

Session is saved to `.auth/user.json` (gitignored) and reused by all tests.

### Running E2E Tests

```bash
# Run all tests
pnpm run test:e2e

# Run specific test file
pnpm run test:e2e e2e/navigation.spec.ts

# Interactive mode
pnpm run test:e2e:ui

# Watch browser (debugging)
pnpm run test:e2e:headed

# Check auth status
pnpm run test:e2e:check

# Re-authenticate if session expires
rm -rf .auth && pnpm run test:e2e:auth
```

### What E2E Tests Cover

**Current coverage** (stable, non-flaky):

1. **Authentication** (`auth-verification.spec.ts`)
    - Session loads correctly
    - User avatar visible
    - Auth persists across refreshes

2. **Admin Pages** (`admin.spec.ts`)
    - Dashboard, households, schedule, handout locations, SMS dashboard load
    - No crashes (500 errors)
    - No assumptions about content

3. **Navigation** (`navigation.spec.ts`)
    - Sequential navigation through all sections
    - Back/forward browser navigation
    - Direct URL navigation
    - English locale navigation

4. **Public Pages** (`public-parcel.spec.ts`)
    - `/p/*` routes accessible without auth
    - Graceful handling of invalid parcel IDs
    - Multi-language support via query params
    - Protected routes correctly reject unauthenticated users

5. **API Health** (`api-health.spec.ts`)
    - Admin endpoints return 2xx/4xx (never 500 or 404)
    - Proper JSON responses
    - Protected endpoints require auth
    - Public health endpoint accessible

### What E2E Tests DON'T Cover (Intentionally)

These require data seeding infrastructure (future work):

- ❌ Household creation workflows
- ❌ Parcel creation and management
- ❌ SMS sending functionality
- ❌ Complex form submissions
- ❌ Data validation with server responses

### Test File Structure

```
e2e/
├── auth.setup.ts                # Authentication setup (required)
├── test-helpers.ts              # Shared utilities
├── auth-verification.spec.ts    # Auth smoke tests
├── admin.spec.ts                # Page load tests
├── navigation.spec.ts           # Navigation flows
├── public-parcel.spec.ts        # Public route tests
└── api-health.spec.ts           # API endpoint checks
```

### Writing New E2E Tests

**DO**:

- Use `[data-testid]` selectors when available
- Test static behavior (navigation, page loads)
- Expect pages to work with empty OR full databases
- Use `expectAuthenticated(page)` helper
- Write screenshots to `test-results/` directory

**DON'T**:

- Assume specific data exists (households, locations, parcels)
- Test data mutations without cleanup/seed infrastructure
- Use text content for selectors (breaks with i18n)
- Wait for `networkidle` (use specific element visibility instead)
- Create data during tests (no cleanup mechanism yet)

### Helper Functions

Import from `e2e/test-helpers.ts`:

```typescript
import {
    navigateToLocale,
    expectAuthenticated,
    waitForPageLoad,
    takeScreenshot,
    expectVisibleByTestId,
    clickByTestId,
} from "./test-helpers";

test("example test", async ({ page }) => {
    await navigateToLocale(page, "/households");
    await expectAuthenticated(page);
    await takeScreenshot(page, "households-page");
});
```

### Locator Strategies (Priority Order)

1. **Test IDs** (most reliable): `page.locator('[data-testid="user-avatar"]')`
2. **Accessible Roles**: `page.getByRole('button', { name: 'Sign in' })`
3. **Labels** (for forms): `page.getByLabel('Name')`
4. **Text content**: `page.getByText('Households')` (last resort - breaks with i18n)
5. **CSS selectors**: Avoid unless absolutely necessary

### Mantine UI Components

The app uses Mantine v8. Common patterns:

```typescript
// Modals/Dialogs
await expect(page.locator('[role="dialog"]')).toBeVisible();
await page.locator('[role="dialog"] input[name="name"]').fill("Test");

// Notifications
await expect(page.locator('[class*="mantine-Notification"]')).toContainText("Success");

// Tables (mantine-datatable)
const row = page.locator("tbody tr", { hasText: "John Doe" });
await row.locator('button[aria-label="Edit"]').click();
```

### Debugging Failed Tests

When tests fail:

1. Check screenshot in `test-results/` directory
2. Check video recording (also in `test-results/`)
3. Verify authentication (if redirected to `/auth/signin`, session expired)
4. Ensure dev server is running on localhost:3000
5. Use `await page.pause()` for interactive debugging

## MCP (Model Context Protocol) for AI Agents

AI agents can control Playwright via MCP. Configuration is in `.github/copilot-mcp.json`:

```json
{
    "mcpServers": {
        "playwright": {
            "command": "pnpm",
            "args": ["exec", "mcp-server-playwright", "--storage-state=.auth/user.json"],
            "env": { "PLAYWRIGHT_BASE_URL": "http://localhost:3000" }
        }
    }
}
```

### When AI Agents Are Asked to Test

1. **Check prerequisites**: Verify auth is set up (`pnpm run test:e2e:check`)
2. **Navigate and interact**: Use Playwright MCP tools to control browser
3. **Take screenshots**: Capture visual evidence (writes to `test-results/`)
4. **Report results**: Show errors, screenshots, or success
5. **Suggest improvements**: Recommend `data-testid` attributes if selectors are fragile

**Common requests**:

- "Take a screenshot of [page]"
- "Test if [feature] works"
- "Verify all navigation links work"
- "Check if form validation works correctly"

## Future: Data Seeding Infrastructure

When we implement `scripts/e2e-seed.ts`:

1. Pre-seed predictable test data (households, locations, parcels)
2. Use test-specific schema or cleanup between runs
3. Make seeding idempotent (safe to run multiple times)
4. Then enable workflow tests (parcel creation, SMS sending, etc.)

Until then, E2E tests remain minimal smoke tests only.

## Validation Before Committing

Always run:

```bash
pnpm run validate
```

This runs:

- ESLint (linting)
- TypeScript compiler (type checking)
- Prettier (format checking)
- Security validation (server action & API route patterns)

## Related Documentation

- **Authentication**: See `docs/auth-guide.md` for auth patterns in tests
- **Development**: See `docs/dev-guide.md` for local testing setup
