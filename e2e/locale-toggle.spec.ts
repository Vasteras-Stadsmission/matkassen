import { test, expect } from "@playwright/test";

/**
 * Language Switching Tests
 *
 * Status: SKIPPED - Requires data-testid attributes on LanguageSwitcher component
 *
 * TODO before enabling:
 * 1. Add data-testid="language-switcher" to LanguageSwitcher.tsx button
 * 2. Add data-testid="language-sv" to Swedish option
 * 3. Add data-testid="language-en" to English option
 *
 * Purpose: Test i18n routing and language switching functionality
 * Philosophy: Test the locale mechanism, not the translations themselves
 */

test.describe.skip("Language Switching", () => {
    test("should toggle between Swedish and English", async ({ page }) => {
        // Start on Swedish households page
        await page.goto("/sv/households");
        await expect(page).toHaveURL(/\/sv\/households/);

        // Click language switcher
        await page.locator('[data-testid="language-switcher"]').click();

        // Select English
        await page.locator('[data-testid="language-en"]').click();

        // Should navigate to English version
        await expect(page).toHaveURL(/\/en\/households/);

        // Should still be authenticated
        await expect(page).not.toHaveURL(/\/auth\/signin/);

        console.log("✅ Switched from Swedish to English");
    });

    test("should switch back to Swedish from English", async ({ page }) => {
        // Start on English page
        await page.goto("/en/schedule");
        await expect(page).toHaveURL(/\/en\/schedule/);

        // Click language switcher
        await page.locator('[data-testid="language-switcher"]').click();

        // Select Swedish
        await page.locator('[data-testid="language-sv"]').click();

        // Should navigate to Swedish version
        await expect(page).toHaveURL(/\/sv\/schedule/);

        // Should still be authenticated
        await expect(page).not.toHaveURL(/\/auth\/signin/);

        console.log("✅ Switched from English to Swedish");
    });

    test("should preserve current page when switching languages", async ({ page }) => {
        // Start on Swedish handout locations
        await page.goto("/sv/handout-locations");

        // Switch to English
        await page.locator('[data-testid="language-switcher"]').click();
        await page.locator('[data-testid="language-en"]').click();

        // Should be on English handout locations (same page, different locale)
        await expect(page).toHaveURL(/\/en\/handout-locations/);

        console.log("✅ Page context preserved during language switch");
    });

    test("should maintain authentication across language switches", async ({ page }) => {
        // Navigate and switch languages multiple times
        await page.goto("/sv/households");

        await page.locator('[data-testid="language-switcher"]').click();
        await page.locator('[data-testid="language-en"]').click();
        await expect(page).not.toHaveURL(/\/auth\/signin/);

        await page.locator('[data-testid="language-switcher"]').click();
        await page.locator('[data-testid="language-sv"]').click();
        await expect(page).not.toHaveURL(/\/auth\/signin/);

        // Should still see user avatar
        await expect(page.locator('[data-testid="user-avatar"]')).toBeVisible();

        console.log("✅ Authentication maintained through language switches");
    });

    test("should handle browser back button after language switch", async ({ page }) => {
        // Swedish → English → Back
        await page.goto("/sv/households");
        await page.locator('[data-testid="language-switcher"]').click();
        await page.locator('[data-testid="language-en"]').click();

        await expect(page).toHaveURL(/\/en\/households/);

        // Go back
        await page.goBack();

        // Should return to Swedish version
        await expect(page).toHaveURL(/\/sv\/households/);

        console.log("✅ Browser back button works with language switching");
    });
});

/**
 * Note: Once data-testid attributes are added to LanguageSwitcher component,
 * remove the .skip() from the describe block above.
 *
 * Implementation checklist:
 * 1. Open components/LanguageSwitcher.tsx
 * 2. Add data-testid="language-switcher" to main button/trigger
 * 3. Add data-testid="language-sv" to Svenska/Swedish option
 * 4. Add data-testid="language-en" to English option
 * 5. Remove .skip() from test.describe above
 * 6. Run: pnpm run test:e2e e2e/locale-toggle.spec.ts
 */
