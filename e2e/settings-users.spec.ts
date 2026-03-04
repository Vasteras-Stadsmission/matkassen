import { test, expect } from "@playwright/test";

/**
 * Settings → Users page tests
 *
 * Tests the admin-only user management page introduced by the two-role system.
 *
 * Philosophy:
 * - NO assumptions about the number of users in the DB
 * - NO assumptions about specific usernames (except that the logged-in user is admin)
 * - Focus on: page loads, correct structure, role UI, navigation entry point
 */

test.describe("Settings → Users page", () => {
    test("should load without error for an admin", async ({ page }) => {
        await page.goto("/sv/settings/users");

        // Should stay on the page (not redirect to auth or show error)
        await expect(page).toHaveURL(/\/sv\/settings\/users/);
        await expect(page).not.toHaveURL(/\/auth\//);

        // Basic page structure renders
        await expect(page.locator("body")).toBeVisible();
    });

    test("should display the user management heading", async ({ page }) => {
        await page.goto("/sv/settings/users");

        // Swedish locale — heading is "Användarhantering"
        await expect(page.getByRole("heading", { name: "Användarhantering" })).toBeVisible({
            timeout: 10000,
        });
    });

    test("should display the users table with column headers", async ({ page }) => {
        await page.goto("/sv/settings/users");

        // Table must be present
        await expect(page.locator("table")).toBeVisible({ timeout: 10000 });

        // Column headers in Swedish
        await expect(page.getByRole("columnheader", { name: "Användare" })).toBeVisible();
        await expect(page.getByRole("columnheader", { name: "Roll" })).toBeVisible();
    });

    test("should show the current user's role as a badge (not a dropdown)", async ({ page }) => {
        await page.goto("/sv/settings/users");

        // The logged-in e2e user is admin. Their row shows a static badge ("Administratör")
        // rather than a role <Select> dropdown — you can't demote yourself.
        //
        // We verify this by checking that at least one "Administratör" text exists in the
        // table WITHOUT being inside a combobox element (which is how Mantine renders Select).
        await expect(page.locator("table")).toBeVisible({ timeout: 10000 });

        // Find any cell containing "Administratör" text
        const adminBadgeCells = page.locator("td").filter({ hasText: "Administratör" });
        await expect(adminBadgeCells.first()).toBeVisible();

        // That cell must NOT contain a combobox (which would mean it's a Select, not a Badge)
        const badgeCellCount = await adminBadgeCells.count();
        let foundBadge = false;
        for (let i = 0; i < badgeCellCount; i++) {
            const cell = adminBadgeCells.nth(i);
            const hasCombobox = (await cell.locator('[role="combobox"]').count()) > 0;
            if (!hasCombobox) {
                foundBadge = true;
                break;
            }
        }
        expect(foundBadge).toBe(true);
    });

    test("should show at least one row in the users table", async ({ page }) => {
        await page.goto("/sv/settings/users");

        await expect(page.locator("table")).toBeVisible({ timeout: 10000 });

        // The logged-in user must appear, so there's at least one tbody row
        const rows = page.locator("tbody tr");
        await expect(rows.first()).toBeVisible();
    });
});

test.describe("Settings menu — Users navigation entry", () => {
    test("settings dropdown contains a link to the Users page", async ({ page }) => {
        await page.goto("/sv");

        // Open the settings menu (aria-label is "Inställningsmeny" in Swedish)
        const settingsButton = page
            .getByRole("button", { name: "Inställningsmeny" })
            .first();
        await settingsButton.click();

        // The Users link should be visible in the dropdown
        await expect(page.getByRole("menuitem", { name: /användare/i })).toBeVisible({
            timeout: 5000,
        });
    });

    test("clicking the Users menu item navigates to the users page", async ({ page }) => {
        await page.goto("/sv");

        const settingsButton = page
            .getByRole("button", { name: "Inställningsmeny" })
            .first();
        await settingsButton.click();

        await page.getByRole("menuitem", { name: /användare/i }).click();

        await expect(page).toHaveURL(/\/sv\/settings\/users/);
        await expect(page).not.toHaveURL(/\/auth\//);
    });
});
