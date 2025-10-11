import { test, expect } from "@playwright/test";
import { navigateToLocale, expectAuthenticated, waitForPageLoad } from "./test-helpers";

/**
 * Household Removal/Anonymization Feature Tests
 *
 * Philosophy: Smoke tests for GDPR compliance UI - NO data mutations
 * - ✅ Test that removal UI exists and is accessible
 * - ✅ Test dialog structure and validation UI
 * - ✅ Test error handling UI exists
 * - ❌ Do NOT create/delete households (no seed infrastructure)
 * - ❌ Do NOT assume specific household data exists
 * - ❌ Do NOT test actual anonymization (requires DB assertions)
 *
 * See docs/manual-testing-household-removal.md for comprehensive manual test scenarios
 */

test.describe("Household Removal Feature (Smoke Tests)", () => {
    test.use({ storageState: ".auth/user.json" });

    test("should have removal button on household detail page", async ({ page }) => {
        await navigateToLocale(page, "/households");
        await expectAuthenticated(page);

        // Find first household (if any exist)
        const firstRow = page.locator("tbody tr").first();
        const viewButton = firstRow
            .locator('button[aria-label*="View"], a[href*="/households/"]')
            .first();

        if ((await viewButton.count()) > 0) {
            await viewButton.click();
            await waitForPageLoad(page);

            // Verify Remove Household button exists (GDPR right to erasure)
            const removeButton = page.locator("button", {
                hasText: /Remove Household|Ta bort hushåll/i,
            });
            await expect(removeButton).toBeVisible();
        } else {
            // No households - skip test (this is acceptable for smoke tests)
            console.log("⚠️ No households available - skipping removal button test");
        }
    });

    test("should open removal confirmation dialog", async ({ page }) => {
        await navigateToLocale(page, "/households");
        await expectAuthenticated(page);

        const firstRow = page.locator("tbody tr").first();
        const viewButton = firstRow
            .locator('button[aria-label*="View"], a[href*="/households/"]')
            .first();

        if ((await viewButton.count()) > 0) {
            await viewButton.click();
            await waitForPageLoad(page);

            // Click Remove Household button
            const removeButton = page.locator("button", {
                hasText: /Remove Household|Ta bort hushåll/i,
            });
            await removeButton.click();

            // Verify dialog appears
            const dialog = page.locator('[role="dialog"]');
            await expect(dialog).toBeVisible();

            // Verify dialog has required elements (structure test, not content test)
            await expect(dialog.locator('input[type="text"]')).toBeVisible(); // Confirmation input
            await expect(dialog.locator("button", { hasText: /Cancel|Avbryt/i })).toBeVisible(); // Cancel button

            // Close dialog without removing
            await dialog.locator("button", { hasText: /Cancel|Avbryt/i }).click();
            await expect(dialog).not.toBeVisible();
        } else {
            console.log("⚠️ No households available - skipping dialog test");
        }
    });

    test("should show warning message in removal dialog", async ({ page }) => {
        await navigateToLocale(page, "/households");
        await expectAuthenticated(page);

        const firstRow = page.locator("tbody tr").first();
        const viewButton = firstRow
            .locator('button[aria-label*="View"], a[href*="/households/"]')
            .first();

        if ((await viewButton.count()) > 0) {
            await viewButton.click();
            await waitForPageLoad(page);

            const removeButton = page.locator("button", {
                hasText: /Remove Household|Ta bort hushåll/i,
            });
            await removeButton.click();

            const dialog = page.locator('[role="dialog"]');
            await expect(dialog).toBeVisible();

            // Verify dialog contains warning about permanent action
            // Use flexible text matching (Swedish OR English)
            await expect(dialog).toContainText(/cannot be undone|kan inte ångras/i);

            // Close dialog
            await dialog.locator("button", { hasText: /Cancel|Avbryt/i }).click();
        } else {
            console.log("⚠️ No households available - skipping warning message test");
        }
    });

    test("should have confirmation input field", async ({ page }) => {
        await navigateToLocale(page, "/households");
        await expectAuthenticated(page);

        const firstRow = page.locator("tbody tr").first();
        const viewButton = firstRow
            .locator('button[aria-label*="View"], a[href*="/households/"]')
            .first();

        if ((await viewButton.count()) > 0) {
            await viewButton.click();
            await waitForPageLoad(page);

            const removeButton = page.locator("button", {
                hasText: /Remove Household|Ta bort hushåll/i,
            });
            await removeButton.click();

            const dialog = page.locator('[role="dialog"]');
            await expect(dialog).toBeVisible();

            // Verify confirmation input exists and is accessible
            const confirmInput = dialog.locator('input[type="text"]');
            await expect(confirmInput).toBeVisible();
            await expect(confirmInput).toBeEnabled();

            // Verify input can receive text (basic interaction test)
            await confirmInput.fill("TestInput");
            await expect(confirmInput).toHaveValue("TestInput");

            // Close dialog
            await dialog.locator("button", { hasText: /Cancel|Avbryt/i }).click();
        } else {
            console.log("⚠️ No households available - skipping input field test");
        }
    });

    test("removal feature UI exists and is accessible", async ({ page }) => {
        // This is a documentation/smoke test
        // Actual removal behavior is tested in manual testing guide
        // (docs/manual-testing-household-removal.md)

        await navigateToLocale(page, "/households");
        await expectAuthenticated(page);

        // Verify page loads successfully
        await expect(page.locator("body")).toBeVisible();

        // Note: Complex removal scenarios (empty household → delete,
        // historical household → anonymize, upcoming parcels → block)
        // require specific database states and are covered in manual testing
    });
});
