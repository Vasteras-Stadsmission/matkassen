/**
 * Critical regression tests for middleware auth protection
 * These tests ensure that API authentication doesn't break
 */

import { NextRequest } from "next/server";
import { describe, it, expect, vi, beforeEach } from "vitest";
import middleware from "@/middleware";

// Mock next-intl middleware
vi.mock("next-intl/middleware", () => ({
    default: () => {
        return (request: NextRequest) => {
            // Simple mock that returns NextResponse.next()
            const { NextResponse } = require("next/server");
            return NextResponse.next();
        };
    },
}));

// Mock routing config
vi.mock("@/app/i18n/routing", () => ({
    routing: {
        locales: ["en", "sv"],
        defaultLocale: "en",
    },
}));

// Mock crypto for CSP nonce generation
Object.defineProperty(global, "crypto", {
    value: {
        getRandomValues: vi.fn(() => new Uint8Array(16).fill(1)),
    },
});

// Mock btoa
Object.defineProperty(global, "btoa", {
    value: vi.fn(() => "mockedNonce"),
});

describe("Middleware API Authentication", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * TEST 1: Critical - Protected admin routes MUST require auth
     * This prevents the disaster scenario of unprotected admin endpoints
     */
    it("should block unauthenticated requests to protected admin API routes", async () => {
        const protectedRoutes = [
            "/api/admin/sms/process-queue",
            "/api/admin/sms/parcel/123",
            "/api/admin/parcel/123/pickup",
            "/api/admin/parcels/upcoming",
        ];

        for (const route of protectedRoutes) {
            const request = new NextRequest(`http://localhost:3000${route}`, {
                method: "POST",
            });

            const response = await middleware(request);

            expect(response.status).toBe(401);
            const responseBody = await response.json();
            expect(responseBody.error).toBe("Unauthorized");
        }
    });

    /**
     * TEST 2: Critical - Public routes MUST remain accessible
     * This ensures essential endpoints like health checks always work
     */
    it("should allow unauthenticated requests to public API routes", async () => {
        const publicRoutes = [
            "/api/health",
            "/api/auth/providers",
            "/api/auth/signin",
            "/api/csp-report",
            "/api/pickup-locations",
        ];

        for (const route of publicRoutes) {
            const request = new NextRequest(`http://localhost:3000${route}`, {
                method: "GET",
            });

            const response = await middleware(request);

            // Should pass through to the actual route handler (status 200, not 401)
            expect(response.status).not.toBe(401);
            expect(response.status).toBe(200); // NextResponse.next() returns 200
        }
    });

    /**
     * TEST 3: Regression - /api/admin/issues/count MUST return 401, not redirect
     *
     * HeaderSimple (the global nav bar) fetches this endpoint on every page,
     * including the sign-in page. If this returned a redirect instead of 401,
     * or if HeaderSimple used adminFetch (which converts 401 → window redirect),
     * unauthenticated users hit an infinite redirect loop that overwhelms the
     * server and triggers nginx 503 errors.
     *
     * See: fix/staging-503-redirect-loop
     */
    it("should return 401 (not redirect) for unauthenticated /api/admin/issues/count", async () => {
        const request = new NextRequest("http://localhost:3000/api/admin/issues/count", {
            method: "GET",
        });

        const response = await middleware(request);

        // Must be a clean 401 JSON response, NOT a 3xx redirect
        expect(response.status).toBe(401);
        expect(response.headers.get("Content-Type")).toContain("application/json");
        const body = await response.json();
        expect(body.error).toBe("Unauthorized");
    });

    /**
     * TEST 4: Callback URL must preserve query params after auth redirect
     *
     * When middleware redirects unauthenticated page requests to sign-in,
     * query params (filters, page number, etc.) must survive the round-trip
     * so users don't lose state after re-authenticating.
     */
    it("should preserve query params in callback URL when redirecting to sign-in", async () => {
        const request = new NextRequest(
            "http://localhost:3000/sv/households?status=active&page=3",
            { method: "GET" },
        );

        const response = await middleware(request);

        expect(response.status).toBe(307);
        const location = response.headers.get("Location")!;
        const redirectUrl = new URL(location);
        const callbackUrl = redirectUrl.searchParams.get("callbackUrl")!;
        expect(callbackUrl).toBe("/households?status=active&page=3");
    });

    /**
     * TEST 5: Critical - CSP headers MUST be added to all API responses
     * This ensures security headers are always present, preventing XSS attacks
     */
    it("should add CSP headers to all API responses", async () => {
        const testRoutes = [
            "/api/health", // Public route
            "/api/admin/parcels/upcoming", // Protected route (will be 401 but still has headers)
        ];

        for (const route of testRoutes) {
            const request = new NextRequest(`http://localhost:3000${route}`, {
                method: "GET",
            });

            const response = await middleware(request);

            // All API responses should have CSP headers
            expect(response.headers.get("Content-Security-Policy")).toBeDefined();
            expect(response.headers.get("x-nonce")).toBeDefined();
            expect(response.headers.get("x-nonce")).toBe("mockedNonce");

            // CSP should contain essential security directives
            const csp = response.headers.get("Content-Security-Policy");
            expect(csp).toContain("default-src 'self'");
            expect(csp).toContain("script-src 'self' 'nonce-mockedNonce'");
        }
    });
});
