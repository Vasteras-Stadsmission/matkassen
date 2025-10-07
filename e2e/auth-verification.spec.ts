import { test, expect } from "@playwright/test";

/**
 * Authentication verification test
 * Minimal smoke test to verify saved authentication state works
 *
 * Philosophy: Test only the auth state itself, not individual pages
 * (page navigation is covered in navigation.spec.ts)
 */

test.describe("Authentication", () => {
    test("should be authenticated with user avatar visible", async ({ page }) => {
        // Navigate to Swedish homepage
        await page.goto("/sv");

        // Should NOT be redirected to signin page
        await expect(page).not.toHaveURL(/\/auth\/signin/);

        // Should see user avatar (only guaranteed authenticated UI element)
        // Use .first() as there may be multiple (desktop + mobile nav)
        const avatarLocator = page.locator('[data-testid="user-avatar"]').first();
        await expect(avatarLocator).toBeVisible({ timeout: 10000 });

        console.log("✅ Successfully authenticated on:", page.url());
    });

    test("should maintain authentication across page refresh", async ({ page }) => {
        await page.goto("/sv/households");

        // Verify authenticated before refresh
        await expect(page).not.toHaveURL(/\/auth\/signin/);

        // Refresh the page
        await page.reload();

        // Should still be authenticated (not redirected)
        await expect(page).not.toHaveURL(/\/auth\/signin/);
        await expect(page.locator('[data-testid="user-avatar"]').first()).toBeVisible({
            timeout: 10000,
        });

        console.log("✅ Authentication persisted after refresh");
    });
});
