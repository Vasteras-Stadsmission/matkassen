import { test, expect } from "@playwright/test";

/**
 * API Health Check Tests
 *
 * Purpose: Verify API endpoints are reachable and return appropriate status codes
 * Philosophy: "Reachable" means 200/403/401, but NEVER 404 (route missing) or 500 (crash)
 *
 * Why this matters:
 * - Catches misconfigured routes early
 * - Detects server-side crashes that UI tests might miss
 * - Quick sanity check that API surface is intact
 *
 * What we DON'T test:
 * - API response content (that's for API integration tests)
 * - Complex business logic (that's for unit tests)
 * - Data mutations (requires seed infrastructure)
 */

test.describe("Admin API Health Checks", () => {
    test("should return valid status codes for admin endpoints (never 500)", async ({ page }) => {
        // Ensure we're authenticated
        await page.goto("/sv");
        await expect(page).not.toHaveURL(/\/auth\/signin/);

        const adminEndpoints = [
            "/api/admin/issues",
            "/api/admin/issues/count",
            "/api/pickup-locations", // Public endpoint but good to test
        ];

        for (const endpoint of adminEndpoints) {
            const response = await page.request.get(endpoint);

            // Should be reachable (not 404 - route exists)
            expect(response.status()).not.toBe(404);

            // Should not crash (never 500)
            expect(response.status()).toBeLessThan(500);

            // Should return 2xx (success) or 4xx (auth/validation)
            const statusCategory = Math.floor(response.status() / 100);
            expect([2, 4]).toContain(statusCategory);

            console.log(`✅ ${endpoint}: ${response.status()}`);
        }

        console.log("✅ All admin API endpoints reachable");
    });

    test("should handle API errors gracefully (no 500s on invalid requests)", async ({ page }) => {
        await page.goto("/sv");

        // Try some edge cases that might cause crashes
        const edgeCases = [
            "/api/admin/sms/parcel/not-a-real-parcel-id",
            "/api/pickup-locations?limit=999999",
        ];

        for (const endpoint of edgeCases) {
            const response = await page.request.get(endpoint);

            // Should not crash (may return 400 bad request, but not 500)
            expect(response.status()).toBeLessThan(500);

            console.log(`✅ ${endpoint}: ${response.status()} (no crash)`);
        }
    });
});

test.describe("Public API Health Checks", () => {
    test("should allow access to public health endpoint without auth", async ({ page }) => {
        // Clear any auth state
        await page.context().clearCookies();

        const response = await page.request.get("/api/health");

        // Should succeed
        expect(response.ok()).toBe(true);
        expect(response.status()).toBe(200);

        console.log("✅ /api/health endpoint accessible without auth");
    });

    test("should include scheduler health in response", async ({ page }) => {
        // Clear auth state
        await page.context().clearCookies();

        const response = await page.request.get("/api/health");
        expect(response.ok()).toBe(true);

        const health = await response.json();

        // Should have scheduler check
        expect(health.checks).toHaveProperty("scheduler");

        // Should include scheduler details
        if (health.checks.schedulerDetails) {
            const details = health.checks.schedulerDetails;

            // Verify scheduler status fields exist
            expect(details).toHaveProperty("schedulerRunning");
            expect(details).toHaveProperty("smsSchedulerRunning");
            expect(details).toHaveProperty("anonymizationSchedulerRunning");
            expect(details).toHaveProperty("lastAnonymizationRun");
            expect(details).toHaveProperty("timestamp");

            console.log("✅ Scheduler health details present:", {
                schedulerRunning: details.schedulerRunning,
                lastAnonymizationRun: details.lastAnonymizationRun,
            });
        } else {
            console.log("ℹ️  Scheduler details not available (may be starting up)");
        }
    });

    test("should reject unauthenticated requests to admin endpoints", async ({ page }) => {
        // Clear auth state
        await page.context().clearCookies();

        const protectedEndpoints = ["/api/admin/issues", "/api/admin/issues/count"];

        for (const endpoint of protectedEndpoints) {
            const response = await page.request.get(endpoint);

            // Should be rejected (401 or 403)
            const isRejected = response.status() === 401 || response.status() === 403;
            expect(isRejected).toBe(true);

            console.log(`✅ ${endpoint}: ${response.status()} (correctly rejected)`);
        }

        console.log("✅ Protected endpoints require authentication");
    });
});

test.describe("API Response Integrity", () => {
    test("should return valid JSON from API endpoints", async ({ page }) => {
        await page.goto("/sv");

        const jsonEndpoints = [
            {
                path: "/api/admin/issues",
                extractArray: (d: { unresolvedHandouts: unknown[] }) => d.unresolvedHandouts,
            },
            { path: "/api/pickup-locations", extractArray: (d: unknown[]) => d },
        ];

        for (const endpoint of jsonEndpoints) {
            const response = await page.request.get(endpoint.path);

            if (response.ok()) {
                // Should parse as valid JSON
                let jsonData;
                try {
                    jsonData = await response.json();
                } catch (error) {
                    throw new Error(`${endpoint.path} did not return valid JSON`);
                }

                // Extract array from response (some endpoints wrap in object)
                const arrayData = endpoint.extractArray(jsonData);
                expect(Array.isArray(arrayData)).toBe(true);

                console.log(`✅ ${endpoint.path}: Valid JSON with ${arrayData.length} items`);
            } else {
                console.log(`ℹ️  ${endpoint.path}: ${response.status()} (skipping JSON check)`);
            }
        }
    });

    test("should include proper content-type headers", async ({ page }) => {
        await page.goto("/sv");

        const response = await page.request.get("/api/admin/issues");

        if (response.ok()) {
            const contentType = response.headers()["content-type"];
            expect(contentType).toContain("application/json");

            console.log("✅ API returns proper content-type header");
        }
    });
});

test.describe("API Error Handling", () => {
    test("should return appropriate error responses for not-found routes", async ({ page }) => {
        await page.goto("/sv");

        // Try to access a route that definitely doesn't exist
        const response = await page.request.get("/api/admin/nonexistent-endpoint-12345");

        // Should return 404 (not 500)
        expect(response.status()).toBe(404);

        console.log("✅ Non-existent API routes return 404");
    });

    test("should handle unsupported HTTP methods without crashing", async ({ page }) => {
        await page.goto("/sv");

        // POST to a GET-only endpoint
        const response = await page.request.post("/api/admin/issues", {
            data: {}, // Empty/invalid data
        });

        // Should return 4xx error (405 Method Not Allowed) or similar, not 500
        expect(response.status()).toBeLessThan(500);

        console.log(`✅ Unsupported method handled gracefully: ${response.status()}`);
    });
});
