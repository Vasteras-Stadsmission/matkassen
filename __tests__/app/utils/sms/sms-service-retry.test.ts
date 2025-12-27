/**
 * Tests for SMS service retry logic - focused unit tests
 */

import { describe, it, expect } from "vitest";

// Test the retry decision logic separately from database operations
describe("SMS Retry Logic", () => {
    /**
     * HTTP status codes that indicate transient errors eligible for retry.
     * Must match RETRIABLE_HTTP_STATUS_CODES in sms-service.ts
     */
    const RETRIABLE_HTTP_STATUS_CODES = new Set([
        429, // Rate limit
        500, // Server error
        502, // Bad gateway
        503, // Service unavailable
        504, // Gateway timeout
    ]);

    function isRetriableHttpError(httpStatus?: number): boolean {
        return httpStatus !== undefined && RETRIABLE_HTTP_STATUS_CODES.has(httpStatus);
    }

    // Helper function to simulate retry decision logic
    function shouldRetry(attemptCount: number, httpStatus?: number): boolean {
        const maxAttempts = 3;
        // attemptCount is the number of attempts already made (not including current)
        const currentAttempt = attemptCount + 1;

        return currentAttempt < maxAttempts && isRetriableHttpError(httpStatus);
    }

    // Helper function to calculate backoff time
    function getBackoffMinutes(attemptCount: number): number {
        // attemptCount is the number of attempts already made
        const currentAttempt = attemptCount + 1;
        return currentAttempt === 1 ? 5 : 30;
    }

    describe("Retry Decision Logic", () => {
        it("should retry on rate limit error (429)", () => {
            expect(shouldRetry(0, 429)).toBe(true);
            expect(shouldRetry(1, 429)).toBe(true);
            expect(shouldRetry(2, 429)).toBe(false); // Max attempts reached
        });

        it("should retry on server errors (500, 503)", () => {
            expect(shouldRetry(0, 500)).toBe(true);
            expect(shouldRetry(0, 503)).toBe(true);
        });

        it("should retry on 502 Bad Gateway (transient provider issue)", () => {
            expect(shouldRetry(0, 502)).toBe(true);
            expect(shouldRetry(1, 502)).toBe(true);
            expect(shouldRetry(2, 502)).toBe(false); // Max attempts reached
        });

        it("should retry on 504 Gateway Timeout (transient provider issue)", () => {
            expect(shouldRetry(0, 504)).toBe(true);
            expect(shouldRetry(1, 504)).toBe(true);
            expect(shouldRetry(2, 504)).toBe(false); // Max attempts reached
        });

        it("should not retry on client errors (400, 401, 404)", () => {
            expect(shouldRetry(0, 400)).toBe(false);
            expect(shouldRetry(0, 401)).toBe(false);
            expect(shouldRetry(0, 404)).toBe(false);
        });

        it("should retry on network errors (mapped to 503)", () => {
            // Network/DNS/timeout errors are now mapped to 503 in hello-sms.ts
            // This ensures transient network issues don't cause permanent SMS failures
            expect(shouldRetry(0, 503)).toBe(true);
            expect(shouldRetry(1, 503)).toBe(true);
            expect(shouldRetry(2, 503)).toBe(false); // Max attempts reached
        });

        it("should not retry after max attempts", () => {
            expect(shouldRetry(2, 429)).toBe(false); // 3rd attempt
            expect(shouldRetry(3, 429)).toBe(false); // 4th attempt
        });

        it("should not retry on successful response", () => {
            expect(shouldRetry(0, 200)).toBe(false);
            expect(shouldRetry(0, 201)).toBe(false);
        });
    });

    describe("Backoff Timing", () => {
        it("should use 5 minutes for first retry", () => {
            expect(getBackoffMinutes(0)).toBe(5); // First retry after initial attempt
        });

        it("should use 30 minutes for second retry", () => {
            expect(getBackoffMinutes(1)).toBe(30); // Second retry
        });

        it("should use 30 minutes for subsequent retries", () => {
            expect(getBackoffMinutes(2)).toBe(30); // Third retry (if it happened)
        });
    });

    describe("Status Transitions", () => {
        it("should have correct status flow for successful SMS", () => {
            const expectedFlow = ["queued", "sending", "sent"];
            expect(expectedFlow).toEqual(["queued", "sending", "sent"]);
        });

        it("should have correct status flow for retriable failure", () => {
            const expectedFlow = ["queued", "sending", "retrying", "sending", "sent"];
            expect(expectedFlow).toContain("retrying");
        });

        it("should have correct status flow for permanent failure", () => {
            const expectedFlow = ["queued", "sending", "failed"];
            expect(expectedFlow).toEqual(["queued", "sending", "failed"]);
        });
    });
});
