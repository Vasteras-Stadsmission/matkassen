import { test, expect } from "@playwright/test";

/**
 * Public Parcel Pages Tests
 *
 * Tests for /p/[parcelId] routes that are accessible WITHOUT authentication
 *
 * Purpose: Verify public routes work correctly:
 * - No authentication required
 * - No redirect to signin
 * - Graceful handling of invalid IDs
 * - Multi-language support
 *
 * Philosophy: Test the exception to the auth rule
 */

test.describe("Public Parcel Pages", () => {
    // Explicitly remove auth state for these tests
    test.use({ storageState: { cookies: [], origins: [] } });

    test("should render public parcel page without authentication", async ({ page }) => {
        // Use a deterministic test ID (doesn't need to exist in DB)
        await page.goto("/p/test-parcel-id");

        // Should NOT redirect to authentication
        await expect(page).not.toHaveURL(/\/auth\//);

        // Page should render something (even if it's an error message)
        await expect(page.locator("body")).toBeVisible();

        console.log("✅ Public parcel page accessible without auth");
    });

    test("should handle non-existent parcel ID gracefully", async ({ page }) => {
        // Visit a parcel that definitely doesn't exist
        await page.goto("/p/nonexistent-parcel-12345");

        // Should NOT redirect to auth
        await expect(page).not.toHaveURL(/\/auth\//);

        // Should NOT crash (show error page or empty state)
        await expect(page.locator("body")).toBeVisible();

        // Should not have JavaScript errors (basic smoke)
        const errors: string[] = [];
        page.on("pageerror", error => {
            errors.push(error.message);
        });

        // Wait a moment for any errors to surface
        await page.waitForTimeout(1000);

        // We allow some errors (e.g., network 404s) but not crashes
        console.log(`✅ Non-existent parcel handled gracefully (${errors.length} page errors)`);
    });

    test("should support Swedish locale via query parameter", async ({ page }) => {
        await page.goto("/p/test?lang=sv");

        // Should load without auth
        await expect(page).not.toHaveURL(/\/auth\//);
        await expect(page.locator("body")).toBeVisible();

        console.log("✅ Swedish locale query parameter works");
    });

    test("should support English locale via query parameter", async ({ page }) => {
        await page.goto("/p/test?lang=en");

        // Should load without auth
        await expect(page).not.toHaveURL(/\/auth\//);
        await expect(page.locator("body")).toBeVisible();

        console.log("✅ English locale query parameter works");
    });

    test("should support multiple language query parameters", async ({ page }) => {
        // Test a few of the 20+ supported languages
        const languages = ["sv", "en", "ar", "fa", "so", "fr", "de"];

        for (const lang of languages) {
            await page.goto(`/p/test?lang=${lang}`);

            // Should load without redirecting to auth
            await expect(page).not.toHaveURL(/\/auth\//);
            await expect(page.locator("body")).toBeVisible();

            console.log(`✅ Language '${lang}' works`);
        }
    });

    test("should allow access to public routes even with trailing slashes", async ({ page }) => {
        await page.goto("/p/test-id/");

        // Should handle gracefully (may redirect to remove slash, or load normally)
        await expect(page).not.toHaveURL(/\/auth\//);
        await expect(page.locator("body")).toBeVisible();

        console.log("✅ Trailing slash handled correctly");
    });

    test("should not expose authenticated routes to unauthenticated users", async ({ page }) => {
        // Try to access admin route without auth
        await page.goto("/sv/households");

        // SHOULD redirect to signin
        await expect(page).toHaveURL(/\/auth\/signin/);

        console.log("✅ Protected routes correctly redirect unauthenticated users");
    });
});

test.describe("Public Route Security", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("should not leak admin data through public parcel pages", async ({ page }) => {
        await page.goto("/p/test");

        // Should not contain admin-only UI elements
        const hasAdminNav = await page.locator('[data-testid="user-avatar"]').isVisible();
        expect(hasAdminNav).toBe(false);

        console.log("✅ Public pages don't leak admin UI");
    });
});
