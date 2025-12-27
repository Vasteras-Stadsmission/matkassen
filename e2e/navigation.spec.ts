import { test, expect } from "@playwright/test";
import { expectAuthenticated } from "./test-helpers";

/**
 * Core Navigation Tests
 *
 * Purpose: Verify seamless navigation across all main application sections
 * Philosophy: Test the navigation flow itself, not individual page content
 *
 * What we test:
 * - All main routes are accessible
 * - Authentication persists across navigation
 * - No crashes or redirects during flow
 *
 * What we DON'T test:
 * - Page-specific content (covered in admin.spec.ts)
 * - Data mutations (requires seed infrastructure)
 */

test.describe("Core Navigation Flow", () => {
    const mainRoutes = [
        { path: "/sv", name: "Dashboard" },
        { path: "/sv/households", name: "Households" },
        { path: "/sv/schedule", name: "Schedule" },
        { path: "/sv/handout-locations", name: "Handout Locations" },
        { path: "/sv/sms-failures", name: "SMS Failures" },
    ];

    test("should navigate through all main sections sequentially", async ({ page }) => {
        for (const route of mainRoutes) {
            console.log(`📍 Navigating to ${route.name}...`);

            await page.goto(route.path);

            // Should reach the correct URL (forward slashes don't need escaping in RegExp)
            await expect(page).toHaveURL(new RegExp(route.path));

            // Should remain authenticated
            await expectAuthenticated(page);

            // Should see user avatar on all pages (use .first() as there may be multiple)
            await expect(page.locator('[data-testid="user-avatar"]').first()).toBeVisible({
                timeout: 5000,
            });

            console.log(`✅ ${route.name} loaded successfully`);
        }

        console.log("✅ All sections accessible in sequence");
    });

    test("should maintain authentication across multiple navigation jumps", async ({ page }) => {
        // Jump between different sections (not sequential)
        await page.goto("/sv/schedule");
        await expectAuthenticated(page);

        await page.goto("/sv/households");
        await expectAuthenticated(page);

        await page.goto("/sv/sms-failures");
        await expectAuthenticated(page);

        await page.goto("/sv");
        await expectAuthenticated(page);

        console.log("✅ Authentication maintained across navigation");
    });

    test("should support browser back/forward navigation", async ({ page }) => {
        // Build navigation history
        await page.goto("/sv/households");
        await page.goto("/sv/schedule");
        await page.goto("/sv/handout-locations");

        // Go back
        await page.goBack();
        await expect(page).toHaveURL(/\/sv\/schedule/);
        await expectAuthenticated(page);

        // Go back again
        await page.goBack();
        await expect(page).toHaveURL(/\/sv\/households/);
        await expectAuthenticated(page);

        // Go forward
        await page.goForward();
        await expect(page).toHaveURL(/\/sv\/schedule/);
        await expectAuthenticated(page);

        console.log("✅ Browser navigation (back/forward) works correctly");
    });

    test("should handle direct URL navigation", async ({ page }) => {
        // Simulate user pasting URL directly into address bar
        await page.goto("/sv/handout-locations");
        await expectAuthenticated(page);
        await expect(page).toHaveURL(/\/sv\/handout-locations/);

        // Jump to completely different section
        await page.goto("/sv/households");
        await expectAuthenticated(page);
        await expect(page).toHaveURL(/\/sv\/households/);

        console.log("✅ Direct URL navigation works correctly");
    });
});

test.describe("English Locale Navigation", () => {
    test("should navigate through main sections in English locale", async ({ page }) => {
        const englishRoutes = [
            "/en",
            "/en/households",
            "/en/schedule",
            "/en/handout-locations",
            "/en/sms-failures",
        ];

        for (const route of englishRoutes) {
            await page.goto(route);

            // Should be on correct English URL (forward slashes don't need escaping in RegExp)
            await expect(page).toHaveURL(new RegExp(route));

            // Should be authenticated
            await expectAuthenticated(page);

            console.log(`✅ ${route} loaded successfully`);
        }

        console.log("✅ All English locale routes accessible");
    });
});
