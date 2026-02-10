/**
 * Tests for adminFetch — the centralized auth redirect wrapper.
 *
 * These tests cover real scenarios that users encounter:
 * - Normal API calls work transparently
 * - Stale sessions (403) redirect to sign-in instead of showing dead-end errors
 * - Expired sessions (401) redirect to sign-in
 * - Server errors (500) are passed through to callers for normal error handling
 * - The current page URL is preserved so users return after re-authenticating
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We test the function in isolation by mocking fetch and window.location
const originalFetch = global.fetch;
const originalLocation = window.location;

// Import after mocks are set up
let adminFetch: typeof import("@/app/utils/auth/redirect-on-auth-error").adminFetch;

beforeEach(async () => {
    vi.useFakeTimers();
    global.fetch = vi.fn();

    // Mock window.location (not writable by default)
    Object.defineProperty(window, "location", {
        value: { pathname: "/households", href: "", reload: vi.fn() },
        writable: true,
        configurable: true,
    });

    // Fresh import each test to avoid stale module state
    const mod = await import("@/app/utils/auth/redirect-on-auth-error");
    adminFetch = mod.adminFetch;
});

afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
        configurable: true,
    });
});

describe("adminFetch", () => {
    // --- Scenario: Normal API usage ---

    it("returns the response for a successful API call", async () => {
        const mockResponse = { ok: true, status: 200, json: async () => ({ data: "test" }) };
        vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as Response);

        const result = await adminFetch("/api/admin/issues");
        expect(result).toBe(mockResponse);
    });

    it("passes through method, headers, and body to fetch", async () => {
        const mockResponse = { ok: true, status: 200 };
        vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as Response);

        await adminFetch("/api/admin/parcel/abc/pickup", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "resend" }),
        });

        expect(global.fetch).toHaveBeenCalledWith("/api/admin/parcel/abc/pickup", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "resend" }),
        });
    });

    it("returns server errors (500) to callers for normal error handling", async () => {
        const mockResponse = {
            ok: false,
            status: 500,
            json: async () => ({ error: "Internal server error" }),
        };
        vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as Response);

        const result = await adminFetch("/api/admin/issues");
        expect(result.status).toBe(500);
        expect(result.ok).toBe(false);
    });

    it("returns 404 errors to callers", async () => {
        const mockResponse = { ok: false, status: 404 };
        vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse as Response);

        const result = await adminFetch("/api/admin/parcel/missing/details");
        expect(result.status).toBe(404);
    });

    // --- Scenario: Stale session after deployment ---
    // User was logged in, a deployment changed session structure,
    // now the API returns 403 "Re-authentication required"

    it("redirects to sign-in on 403 (stale session)", async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
            ok: false,
            status: 403,
            json: async () => ({ error: "Re-authentication required" }),
        } as Response);

        // adminFetch should redirect and return a pending promise
        const result = adminFetch("/api/admin/issues");

        // Flush microtasks so the async function body completes
        await vi.advanceTimersByTimeAsync(0);

        expect(window.location.href).toBe("/api/auth/signin?callbackUrl=%2Fhouseholds");

        // The promise should not resolve (caller stops processing)
        let settled = false;
        result.then(
            () => {
                settled = true;
            },
            () => {
                settled = true;
            },
        );
        await vi.advanceTimersByTimeAsync(0);
        expect(settled).toBe(false);
    });

    // --- Scenario: Session expired / cookie deleted ---

    it("redirects to sign-in on 401 (no session)", async () => {
        vi.mocked(global.fetch).mockResolvedValueOnce({
            ok: false,
            status: 401,
            json: async () => ({ error: "Unauthorized" }),
        } as Response);

        adminFetch("/api/admin/issues");

        await vi.advanceTimersByTimeAsync(0);
        expect(window.location.href).toBe("/api/auth/signin?callbackUrl=%2Fhouseholds");
    });

    // --- Scenario: User is on a deep page when session expires ---
    // They should return to that page after re-authenticating

    it("preserves the current page path in the callback URL", async () => {
        window.location.pathname = "/households/abc123/edit";

        vi.mocked(global.fetch).mockResolvedValueOnce({
            ok: false,
            status: 401,
        } as Response);

        adminFetch("/api/admin/parcel/xyz/pickup");

        await vi.advanceTimersByTimeAsync(0);
        expect(window.location.href).toBe(
            "/api/auth/signin?callbackUrl=%2Fhouseholds%2Fabc123%2Fedit",
        );
    });

    // --- Scenario: AbortController cancels a fetch ---
    // IssuesPageClient uses this when the component unmounts

    it("propagates AbortError so callers can handle cancellation", async () => {
        const abortError = new DOMException("The operation was aborted.", "AbortError");
        vi.mocked(global.fetch).mockRejectedValueOnce(abortError);

        await expect(adminFetch("/api/admin/issues")).rejects.toThrow("The operation was aborted.");
        // Should NOT redirect on abort
        expect(window.location.href).toBe("");
    });

    // --- Scenario: Network failure (Wi-Fi drops, DNS error) ---
    // Should propagate to callers, NOT redirect to sign-in

    it("propagates network errors without redirecting", async () => {
        vi.mocked(global.fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));

        await expect(adminFetch("/api/admin/issues")).rejects.toThrow("Failed to fetch");
        // Should NOT redirect on network error
        expect(window.location.href).toBe("");
    });

    // --- Scenario: User is on a page with unicode or encoded characters in path ---

    it("correctly encodes special characters in the callback URL", async () => {
        window.location.pathname = "/households/söderström/edit";

        vi.mocked(global.fetch).mockResolvedValueOnce({
            ok: false,
            status: 401,
        } as Response);

        adminFetch("/api/admin/issues");

        await vi.advanceTimersByTimeAsync(0);
        expect(window.location.href).toBe(
            `/api/auth/signin?callbackUrl=${encodeURIComponent("/households/söderström/edit")}`,
        );
    });
});
