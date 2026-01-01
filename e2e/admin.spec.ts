import { test, expect } from "@playwright/test";

/**
 * Admin page smoke tests
 * Verifies that protected pages load without crashes
 *
 * Philosophy: Test page loads and basic structure only
 * - NO assumptions about data (tables may be empty)
 * - NO assumptions about specific UI text (changes with i18n)
 * - Focus on "page rendered without 500 error"
 */

test.describe("Admin Pages Load", () => {
    test("should load the dashboard homepage", async ({ page }) => {
        await page.goto("/sv");

        // Should not redirect to auth
        await expect(page).not.toHaveURL(/\/auth\//);

        // Should see authenticated UI (use .first() as there may be mobile + desktop nav)
        await expect(page.locator('[data-testid="user-avatar"]').first()).toBeVisible({
            timeout: 5000,
        });

        // Should have basic page structure
        await expect(page.locator("body")).toBeVisible();
    });

    test("should load households page", async ({ page }) => {
        await page.goto("/sv/households");

        // Should be on correct URL
        await expect(page).toHaveURL(/\/sv\/households/);

        // Should be authenticated
        await expect(page).not.toHaveURL(/\/auth\//);

        // Page should render (no crashes)
        await expect(page.locator("body")).toBeVisible();

        // Note: We don't assert on table/empty state - DB may vary
    });

    test("should load schedule page", async ({ page }) => {
        await page.goto("/sv/schedule");

        // Should be on correct URL
        await expect(page).toHaveURL(/\/sv\/schedule/);

        // Should be authenticated
        await expect(page).not.toHaveURL(/\/auth\//);

        // Page should render
        await expect(page.locator("body")).toBeVisible();
    });

    test("should load handout locations page", async ({ page }) => {
        await page.goto("/sv/handout-locations");

        // Should be on correct URL
        await expect(page).toHaveURL(/\/sv\/handout-locations/);

        // Should be authenticated
        await expect(page).not.toHaveURL(/\/auth\//);

        // Page should render
        await expect(page.locator("body")).toBeVisible();
    });

    test("should load Issues page", async ({ page }) => {
        await page.goto("/sv");

        // Should be on correct URL (Issues is now the home page)
        await expect(page).toHaveURL(/\/sv\/?$/);

        // Should be authenticated
        await expect(page).not.toHaveURL(/\/auth\//);

        // Page should render with Issues title
        await expect(page.locator("body")).toBeVisible();
    });
});
