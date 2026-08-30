import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    storeCspViolation: vi.fn(),
    checkRateLimit: vi.fn(),
    logError: vi.fn(),
}));

vi.mock("@/app/db/csp-violations", () => ({
    storeCspViolation: mocks.storeCspViolation,
}));

vi.mock("@/app/utils/rate-limit", () => ({
    checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("@/app/utils/logger", () => ({
    logError: mocks.logError,
}));

import { OPTIONS, POST } from "@/app/api/csp-report/route";

const sampleReport = {
    "blocked-uri": "https://evil.example/script.js",
    "violated-directive": "script-src 'self'",
    "effective-directive": "script-src",
    "original-policy": "script-src 'self'; object-src 'none';",
    "disposition": "enforce",
    "referrer": "https://example.com/page",
    "source-file": "https://example.com/page",
    "line-number": 42,
    "column-number": 10,
    "script-sample": "eval('alert(1)')",
};

function createRequest(body: string, headers: Record<string, string> = {}): NextRequest {
    return new NextRequest("http://localhost/api/csp-report", {
        method: "POST",
        headers: {
            "Content-Type": "application/csp-report",
            "x-real-ip": "192.0.2.10",
            ...headers,
        },
        body,
    });
}

describe("CSP report route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.checkRateLimit.mockReturnValue({
            allowed: true,
            remaining: 19,
            resetTime: Date.now() + 60_000,
        });
        mocks.storeCspViolation.mockResolvedValue(true);
    });

    it("returns the public CORS contract for preflight requests", async () => {
        const response = await OPTIONS();

        expect(response.status).toBe(200);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
        expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
        expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
        expect(await response.text()).toBe("");
    });

    it("maps a wrapped browser report into the server-only persistence utility", async () => {
        const response = await POST(
            createRequest(JSON.stringify({ "csp-report": sampleReport }), {
                "User-Agent": "Test Browser",
            }),
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ status: "received" });
        expect(mocks.storeCspViolation).toHaveBeenCalledWith({
            blockedUri: "https://evil.example/script.js",
            violatedDirective: "script-src 'self'",
            effectiveDirective: "script-src",
            originalPolicy: "script-src 'self'; object-src 'none';",
            disposition: "enforce",
            referrer: "https://example.com/page",
            sourceFile: "https://example.com/page",
            lineNumber: 42,
            columnNumber: 10,
            userAgent: "Test Browser",
            scriptSample: "eval('alert(1)')",
        });
    });

    it("accepts the direct report format and defaults the disposition", async () => {
        const response = await POST(
            createRequest(JSON.stringify({ "violated-directive": "style-src 'self'" })),
        );

        expect(response.status).toBe(200);
        expect(mocks.storeCspViolation).toHaveBeenCalledWith(
            expect.objectContaining({
                violatedDirective: "style-src 'self'",
                disposition: "enforce",
                userAgent: undefined,
            }),
        );
    });

    it("acknowledges a storage failure so browsers do not retry-loop", async () => {
        mocks.storeCspViolation.mockResolvedValue(false);

        const response = await POST(createRequest(JSON.stringify({ "csp-report": sampleReport })));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ status: "received" });
    });

    it("rejects malformed JSON", async () => {
        const response = await POST(createRequest("{not-json"));

        expect(response.status).toBe(400);
        expect(mocks.storeCspViolation).not.toHaveBeenCalled();
    });

    it("rejects payloads larger than 10 KiB before parsing or persistence", async () => {
        const response = await POST(createRequest("x".repeat(10 * 1024 + 1)));

        expect(response.status).toBe(413);
        expect(mocks.storeCspViolation).not.toHaveBeenCalled();
    });

    it("rate limits before reading or persisting the request body", async () => {
        mocks.checkRateLimit.mockReturnValue({
            allowed: false,
            remaining: 0,
            resetTime: Date.now() + 30_000,
            error: "Rate limit exceeded",
        });

        const response = await POST(createRequest(JSON.stringify({ "csp-report": sampleReport })));

        expect(response.status).toBe(429);
        expect(mocks.storeCspViolation).not.toHaveBeenCalled();
    });
});
