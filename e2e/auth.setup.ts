import { test as setup, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import { SESSION_COOKIE_NAME, SESSION_COOKIE_NAME_SECURE } from "../app/utils/auth/session-cookie";

/**
 * Authentication setup for Playwright tests
 *
 * This script validates that authentication is configured.
 * If not configured, it provides instructions for the simple manual setup.
 *
 * To set up authentication (ONE TIME):
 * 1. Run: pnpm run test:e2e:auth
 * 2. Copy/paste your session cookie from DevTools
 * 3. Done! Tests will reuse this for ~30 days
 */

const authFile = path.join(__dirname, "..", ".auth", "user.json");

setup("authenticate", async ({ page, context }) => {
    setup.setTimeout(30000); // 30 seconds is plenty

    // Check if we have auth state
    if (!fs.existsSync(authFile)) {
        throw new Error(
            "\n\n" +
                "❌ No authentication found!\n\n" +
                "Run this command to set up auth (takes 10 seconds):\n" +
                "  pnpm run test:e2e:auth\n\n" +
                "Then try running tests again.\n",
        );
    }

    console.log("🔐 Loading authentication...");

    // Load and validate auth state
    const authState = JSON.parse(fs.readFileSync(authFile, "utf-8"));

    if (!authState.cookies || authState.cookies.length === 0) {
        throw new Error("❌ Invalid auth state - please run: pnpm run test:e2e:auth");
    }

    // Check for session cookie
    const hasSessionCookie = authState.cookies.some(
        (cookie: any) =>
            cookie.name === SESSION_COOKIE_NAME || cookie.name === SESSION_COOKIE_NAME_SECURE,
    );

    if (!hasSessionCookie) {
        throw new Error("❌ No session cookie found - please run: pnpm run test:e2e:auth");
    }

    // Apply cookies
    await context.addCookies(authState.cookies);

    // Verify authentication works
    await page.goto("/sv", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000); // Wait for potential redirects

    if (page.url().includes("/auth/signin")) {
        throw new Error(
            "\n\n" +
                "❌ Authentication expired!\n\n" +
                "Your session cookie is no longer valid.\n" +
                "Run this command to refresh:\n" +
                "  pnpm run test:e2e:auth\n\n",
        );
    }

    console.log("✅ Authentication valid!");
});
