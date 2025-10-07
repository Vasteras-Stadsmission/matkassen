import { Page, expect } from "@playwright/test";

/**
 * Shared test utilities for Playwright tests
 */

/**
 * Wait for the page to finish loading
 * Note: Avoids networkidle as it's unreliable with Next.js (keeps connections open)
 */
export async function waitForPageLoad(page: Page) {
    await page.waitForLoadState("domcontentloaded");
}

/**
 * Navigate to a localized route
 */
export async function navigateToLocale(page: Page, path: string, locale: "sv" | "en" = "sv") {
    const url = `/${locale}${path.startsWith("/") ? path : `/${path}`}`;
    await page.goto(url);
    await waitForPageLoad(page);
}

/**
 * Take a screenshot with a descriptive name
 * Writes to test-results/ to avoid dirtying the repo
 */
export async function takeScreenshot(page: Page, name: string) {
    await page.screenshot({
        path: `test-results/${name}-${Date.now()}.png`,
        fullPage: true,
    });
}

/**
 * Check if user is authenticated by verifying we're not on auth pages
 */
export async function expectAuthenticated(page: Page) {
    await expect(page).not.toHaveURL(/\/auth\//);
}

/**
 * Check if an element is visible by test ID
 */
export async function expectVisibleByTestId(page: Page, testId: string) {
    await expect(page.locator(`[data-testid="${testId}"]`)).toBeVisible();
}

/**
 * Click an element by test ID
 */
export async function clickByTestId(page: Page, testId: string) {
    await page.locator(`[data-testid="${testId}"]`).click();
}
