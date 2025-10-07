# AI Agent Guide: Using Playwright MCP with Matkassen

This document is for AI agents (like GitHub Copilot) explaining how to interact with the Matkassen application using Playwright MCP.

## Overview

The application is configured with Playwright MCP, allowing you to:
- Navigate and interact with the UI
- Click buttons, fill forms, take screenshots
- Verify functionality and debug issues
- Test complete user workflows

## Authentication Context

**Important:** The application uses GitHub OAuth for authentication.

- **Setup:** User must run `pnpm run test:e2e:setup` once
- **Session:** Saved to `.auth/user.json` (gitignored)
- **Tests:** Automatically use saved authentication
- **Validity:** ~30 days, then needs re-authentication

### Protected Routes (Require Auth)
- `/[locale]/*` - All admin routes (households, schedule, handout-locations)
- Authentication is automatic if `.auth/user.json` exists

### Public Routes (No Auth)
- `/p/[parcelId]` - Public parcel pages
- `/auth/*` - Authentication pages

## Application Structure

### Main Routes
```
/sv                        # Swedish homepage (default locale)
/en                        # English homepage
/sv/households             # Household management
/sv/schedule               # Parcel scheduling
/sv/handout-locations      # Pickup locations
/p/[parcelId]              # Public parcel view (no auth)
```

### Key Features to Test
1. **Household Management** - Create, view, edit, delete households
2. **Schedule Management** - Create parcel distributions, assign to households
3. **Handout Locations** - Manage pickup locations
4. **Localization** - Switch between Swedish (sv) and English (en)
5. **Public Pages** - QR code accessible parcel information

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from "@playwright/test";

test("test name", async ({ page }) => {
  // Navigate
  await page.goto("/sv/households");

  // Interact
  await page.locator('[data-testid="create-btn"]').click();

  // Assert
  await expect(page).toHaveURL(/\/sv\/households/);
});
```

### Using Helper Functions

```typescript
import {
  navigateToLocale,
  clickButton,
  waitForNotification,
  expectAuthenticated,
} from "./test-helpers";

test("with helpers", async ({ page }) => {
  await navigateToLocale(page, "/households");
  await expectAuthenticated(page);
  await clickButton(page, "Create");
  await waitForNotification(page, "Success");
});
```

### Testing Without Authentication

```typescript
test.describe("Public Pages", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("public parcel page", async ({ page }) => {
    await page.goto("/p/some-parcel-id");
    // No authentication required
  });
});
```

## Locator Strategies

### Recommended (Most Reliable)

1. **Test IDs** (when available)
```typescript
page.locator('[data-testid="user-avatar"]')
```

2. **Accessible Roles**
```typescript
page.getByRole('button', { name: 'Sign in' })
page.getByRole('link', { name: 'Households' })
```

3. **Labels** (for forms)
```typescript
page.getByLabel('Name')
page.getByLabel('Email')
```

### Fallbacks

4. **Text content**
```typescript
page.getByText('Households')
page.locator('text=Create New')
```

5. **CSS selectors** (last resort)
```typescript
page.locator('.mantine-Button-root')
```

## Common Testing Patterns

### Navigation Test
```typescript
test("navigate to page", async ({ page }) => {
  await page.goto("/sv/households");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/sv\/households/);
});
```

### Form Submission Test
```typescript
test("submit form", async ({ page }) => {
  await page.goto("/sv/households");
  await page.getByRole('button', { name: /create|new/i }).click();

  await page.getByLabel('Name').fill('Test Household');
  await page.getByLabel('Email').fill('test@example.com');

  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('[class*="Notification"]'))
    .toContainText('Success');
});
```

### Screenshot Test
```typescript
test("take screenshot", async ({ page }) => {
  await page.goto("/sv");
  await page.screenshot({
    path: 'screenshots/homepage.png',
    fullPage: true
  });
});
```

### Language Switch Test
```typescript
test("switch language", async ({ page }) => {
  await page.goto("/sv");
  await expect(page).toHaveURL(/\/sv/);

  // Navigate to English version
  await page.goto("/en");
  await expect(page).toHaveURL(/\/en/);
});
```

## Handling Mantine UI Components

The app uses Mantine v8 components. Common patterns:

### Buttons
```typescript
// Primary button
await page.getByRole('button', { name: 'Create' }).click();

// Button with icon
await page.locator('button', { hasText: 'Delete' }).click();
```

### Modals/Dialogs
```typescript
// Wait for modal to open
await expect(page.locator('[role="dialog"]')).toBeVisible();

// Interact with modal
await page.locator('[role="dialog"] input[name="name"]').fill('Test');
await page.locator('[role="dialog"] button[type="submit"]').click();
```

### Tables (mantine-datatable)
```typescript
// Find row
const row = page.locator('tbody tr', { hasText: 'John Doe' });

// Click action in row
await row.locator('button[aria-label="Edit"]').click();
```

### Notifications
```typescript
// Wait for success notification
await expect(page.locator('[class*="mantine-Notification"]'))
  .toContainText('Success');
```

### Select/Dropdown
```typescript
// Click to open
await page.locator('[data-testid="location-select"]').click();

// Select option
await page.locator('[role="option"]', { hasText: 'Location 1' }).click();
```

## When User Asks You To Test

### Pattern 1: "Test if [feature] works"
```typescript
test("test feature", async ({ page }) => {
  // 1. Navigate to relevant page
  await page.goto("/sv/feature");

  // 2. Verify page loaded
  await expect(page).toHaveURL(/feature/);

  // 3. Interact with feature
  // Click buttons, fill forms, etc.

  // 4. Verify expected outcome
  await expect(page.locator('...')).toBeVisible();
});
```

### Pattern 2: "Take a screenshot of [page]"
```typescript
test("screenshot", async ({ page }) => {
  await page.goto("/sv/page");
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: 'screenshots/page-name.png',
    fullPage: true
  });
});
```

### Pattern 3: "Verify all navigation links work"
```typescript
test("navigation links", async ({ page }) => {
  await page.goto("/sv");

  const links = await page.locator('nav a').all();

  for (const link of links) {
    const href = await link.getAttribute('href');
    const response = await page.goto(href);
    expect(response?.status()).toBeLessThan(400);
  }
});
```

## Running Tests

### Via Playwright MCP
When user asks you to test something, you can use Playwright MCP tools directly to:
- Open browser
- Navigate to URLs
- Click elements
- Take screenshots
- Run assertions

### Via npm scripts
```bash
pnpm run test:e2e          # Run all tests
pnpm run test:e2e:ui       # Interactive UI
pnpm run test:e2e:headed   # Visible browser
```

## Important Notes

1. **Always check authentication first**
   - If tests fail with redirects to `/auth/signin`, auth expired
   - Tell user to run `pnpm run test:e2e:setup`

2. **Wait for page loads**
   - Use `waitForLoadState("networkidle")` after navigation
   - Use `waitForTimeout()` sparingly (last resort)

3. **Locators should be resilient**
   - Prefer semantic selectors (roles, labels)
   - Avoid brittle CSS selectors
   - Suggest adding `data-testid` if needed

4. **Test independence**
   - Each test should work standalone
   - Don't rely on test execution order
   - Clean up test data when possible

5. **Swedish is default locale**
   - Most content is in Swedish by default
   - Use `/sv` routes unless testing English
   - Some buttons/labels may be in Swedish

## Debugging Failed Tests

When a test fails:

1. **Check screenshot** - Auto-saved in `test-results/`
2. **Check video** - Also in `test-results/`
3. **Verify authentication** - Check if redirected to `/auth/signin`
4. **Check dev server** - Must be running on localhost:3000
5. **Inspect page state** - Use `await page.pause()` for debugging

## Example: Complete Test Workflow

```typescript
import { test, expect } from "@playwright/test";
import { navigateToLocale, expectAuthenticated } from "./test-helpers";

test.describe("Household Management", () => {
  test("create household workflow", async ({ page }) => {
    // 1. Navigate
    await navigateToLocale(page, "/households");

    // 2. Verify authenticated
    await expectAuthenticated(page);

    // 3. Open create dialog
    await page.getByRole('button', { name: /create|new/i }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // 4. Fill form
    const timestamp = Date.now();
    await page.getByLabel(/name/i).fill(`Test Household ${timestamp}`);
    await page.getByLabel(/email/i).fill(`test${timestamp}@example.com`);

    // 5. Submit
    await page.locator('[role="dialog"] button[type="submit"]').click();

    // 6. Verify success
    await expect(page.locator('[class*="Notification"]'))
      .toContainText(/success|created/i, { timeout: 5000 });

    // 7. Verify in list
    await expect(page.getByText(`Test Household ${timestamp}`))
      .toBeVisible({ timeout: 5000 });
  });
});
```

## Summary for AI Agents

When user asks you to test something:

1. **Check prerequisites** - Auth setup, dev server running
2. **Write or run test** - Use Playwright MCP or create test file
3. **Report results** - Show screenshots, errors, or success
4. **Suggest improvements** - Recommend `data-testid` attributes if selectors are fragile

You have full access to the running application through Playwright MCP. Use it to verify functionality, debug issues, and help ensure quality! 🎭
