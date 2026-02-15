/**
 * Integration tests for GET /api/admin/sms/balance-status route handler.
 *
 * Tests:
 * - Happy path: returns balance and failure count
 * - Credits depleted: hasInsufficientBalance is true
 * - Balance check error: credits is null, failureStatus still works
 * - No balance failures: failedCount is 0
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import {
    createTestHousehold,
    createTestBalanceFailedSms,
    resetHouseholdCounter,
    resetSmsCounter,
} from "../../factories";
import { MockSmsGateway } from "@/app/utils/sms/mock-sms-gateway";
import { setSmsGateway, resetSmsGateway } from "@/app/utils/sms/sms-gateway";

vi.mock("@/app/utils/auth/api-auth", () => ({
    authenticateAdminRequest: vi.fn((_options?: unknown) =>
        Promise.resolve({
            success: true,
            session: {
                user: {
                    id: "test-admin-id",
                    role: "admin",
                    githubUsername: "test-admin",
                },
            },
        }),
    ),
}));

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let balanceStatusGET: typeof import("@/app/api/admin/sms/balance-status/route").GET;

describe("SMS Balance Status - Route handler integration", () => {
    let mockGateway: MockSmsGateway;

    beforeAll(async () => {
        ({ GET: balanceStatusGET } = await import("@/app/api/admin/sms/balance-status/route"));
    });

    beforeEach(() => {
        resetHouseholdCounter();
        resetSmsCounter();
        resetSmsGateway();
        mockGateway = new MockSmsGateway();
        setSmsGateway(mockGateway);
    });

    it("should return positive balance with no failures", async () => {
        mockGateway.mockBalance(100);

        const response = await balanceStatusGET();
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.hasInsufficientBalance).toBe(false);
        expect(data.credits).toBe(100);
        expect(data.balanceCheckError).toBeNull();
        expect(data.failedCount).toBe(0);
    });

    it("should return hasInsufficientBalance when credits are zero", async () => {
        mockGateway.mockBalance(0);

        const response = await balanceStatusGET();
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.hasInsufficientBalance).toBe(true);
        expect(data.credits).toBe(0);
    });

    it("should return hasInsufficientBalance when there are undismissed balance failures", async () => {
        mockGateway.mockBalance(50); // Credits restored, but old failures exist

        const household = await createTestHousehold({ first_name: "BalFail" });
        await createTestBalanceFailedSms({ household_id: household.id });

        const response = await balanceStatusGET();
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.hasInsufficientBalance).toBe(true);
        expect(data.credits).toBe(50);
        expect(data.failedCount).toBe(1);
    });

    it("should handle balance check error gracefully", async () => {
        mockGateway.mockBalanceError("API unreachable");

        const response = await balanceStatusGET();
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.credits).toBeNull();
        expect(data.balanceCheckError).toBe("API unreachable");
        expect(data.failedCount).toBe(0);
    });

    it("should include Cache-Control header", async () => {
        mockGateway.mockBalance(100);

        const response = await balanceStatusGET();
        expect(response.headers.get("Cache-Control")).toBe(
            "private, max-age=60, stale-while-revalidate=120",
        );
    });
});
