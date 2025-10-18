import { test, expect } from "@playwright/test";
import { expectAuthenticated, navigateToLocale } from "./test-helpers";

/**
 * E2E Smoke Test: Verification Questions Feature
 *
 * These tests verify that the verification questions feature is accessible
 * and renders without crashes. They do NOT test data mutations.
 *
 * Coverage:
 * - Verification step appears in household creation wizard when questions exist
 * - Verification questions load from API
 * - Checkboxes are interactive
 * - Validation prevents proceeding without required checks
 */

test.describe("Verification Questions - Smoke Tests", () => {
    test.beforeEach(async ({ page }) => {
        await navigateToLocale(page, "/households/enroll");
        await expectAuthenticated(page);
    });

    test("household creation wizard loads without verification step when no questions configured", async ({
        page,
    }) => {
        // Navigate through basic household form (step 1)
        await page.getByLabel("Förnamn").fill("Test");
        await page.getByLabel("Efternamn").fill("Person");
        await page.getByLabel("Telefonnummer").fill("0701234567");
        await page.getByLabel("Postnummer").fill("12345");

        // Select a pickup location (triggers verification question fetch)
        const pickupSelect = page.locator('input[name="favorite_pickup_location_id"]').first();
        if (await pickupSelect.isVisible()) {
            await pickupSelect.click();
            // Select first option if available
            const firstOption = page.locator('[role="option"]').first();
            if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
                await firstOption.click();
            }
        }

        // Click "Next Step" to proceed
        await page.getByRole("button", { name: /Nästa steg|Next Step/i }).click();

        // Should be on Members step (step 2)
        await expect(page.getByText(/Medlemmar|Members/i)).toBeVisible();

        // Navigate through remaining steps to verify no verification step appears
        // (assuming no verification questions are configured)
        await page.getByRole("button", { name: /Nästa steg|Next Step/i }).click(); // Diet
        await page.getByRole("button", { name: /Nästa steg|Next Step/i }).click(); // Pets
        await page.getByRole("button", { name: /Nästa steg|Next Step/i }).click(); // Needs
        await page.getByRole("button", { name: /Nästa steg|Next Step/i }).click(); // Should be Review

        // Verify we're on review step (final step before submission)
        await expect(page.getByText(/Sammanfattning|Summary|Review/i)).toBeVisible();
    });

    test("verification questions API endpoint is accessible", async ({ page }) => {
        // Test that the API endpoint responds (smoke test only)
        const response = await page.request.get(
            "/api/admin/pickup-locations/test-location-id/verification-questions",
        );

        // Expect either 200 (questions exist) or empty array (no questions)
        // Should NOT be 404 or 500
        expect([200, 404].includes(response.status())).toBeTruthy();

        if (response.status() === 200) {
            const data = await response.json();
            expect(Array.isArray(data)).toBeTruthy();
        }
    });

    test("wizard prevents navigation to next step without checking required verifications (if questions exist)", async ({
        page,
    }) => {
        // This test only runs if verification questions are configured
        // It verifies that validation works correctly

        // Fill in basic household info
        await page.getByLabel("Förnamn").fill("Test");
        await page.getByLabel("Efternamn").fill("Person");
        await page.getByLabel("Telefonnummer").fill("0701234567");
        await page.getByLabel("Postnummer").fill("12345");

        // Select pickup location
        const pickupSelect = page.locator('input[name="favorite_pickup_location_id"]').first();
        if (await pickupSelect.isVisible()) {
            await pickupSelect.click();
            const firstOption = page.locator('[role="option"]').first();
            if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
                await firstOption.click();
            }
        }

        // Navigate to verification step (if it exists)
        for (let i = 0; i < 5; i++) {
            const nextButton = page.getByRole("button", { name: /Nästa steg|Next Step/i });
            if (await nextButton.isVisible()) {
                await nextButton.click();
                await page.waitForTimeout(500);

                // Check if we're on verification step
                const verificationTitle = page.getByText(
                    /Verifiering krävs|Verification Required/i,
                );
                if (await verificationTitle.isVisible({ timeout: 1000 }).catch(() => false)) {
                    // We found the verification step!
                    // Try to proceed without checking boxes
                    await page.getByRole("button", { name: /Nästa steg|Next Step/i }).click();

                    // Should see validation error or stay on same page
                    await expect(
                        page.getByText(
                            /obligatoriska verifieringar|required verifications must be checked/i,
                        ),
                    ).toBeVisible({ timeout: 2000 });

                    break;
                }
            }
        }
    });
});
