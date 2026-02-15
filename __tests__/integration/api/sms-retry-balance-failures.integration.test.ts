/**
 * Integration tests for POST /api/admin/sms/retry-balance-failures route handler.
 *
 * Tests:
 * - Happy path: re-queues undismissed balance failures
 * - Dismissed balance failures are not re-queued
 * - Non-balance failures are not affected
 * - Returns correct requeue count
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestBalanceFailedSms,
    createTestFailedSms,
    createTestSms,
    resetHouseholdCounter,
    resetSmsCounter,
} from "../../factories";
import { outgoingSms } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { TEST_NOW } from "../../test-time";

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
let retryBalanceFailuresPOST: typeof import("@/app/api/admin/sms/retry-balance-failures/route").POST;

describe("SMS Retry Balance Failures - Route handler integration", () => {
    beforeAll(async () => {
        ({ POST: retryBalanceFailuresPOST } =
            await import("@/app/api/admin/sms/retry-balance-failures/route"));
    });

    beforeEach(() => {
        resetHouseholdCounter();
        resetSmsCounter();
    });

    it("should re-queue undismissed balance failures and return count", async () => {
        const db = await getTestDb();
        const household = await createTestHousehold({ first_name: "Requeue" });

        const sms1 = await createTestBalanceFailedSms({ household_id: household.id });
        const sms2 = await createTestBalanceFailedSms({ household_id: household.id });

        const response = await retryBalanceFailuresPOST();
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.requeuedCount).toBe(2);

        // Verify DB state: both should be queued with balance_failure reset
        for (const id of [sms1.id, sms2.id]) {
            const [row] = await db.select().from(outgoingSms).where(eq(outgoingSms.id, id));
            expect(row.status).toBe("queued");
            expect(row.balance_failure).toBe(false);
            expect(row.attempt_count).toBe(0);
            expect(row.last_error_message).toBeNull();
        }
    });

    it("should not re-queue dismissed balance failures", async () => {
        const household = await createTestHousehold({ first_name: "Dismissed" });

        await createTestSms({
            household_id: household.id,
            status: "failed",
            balance_failure: true,
            attempt_count: 1,
            last_error_message: "Insufficient SMS credits",
            dismissed_at: TEST_NOW,
            dismissed_by_user_id: "someone",
        });

        const response = await retryBalanceFailuresPOST();
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.requeuedCount).toBe(0);
    });

    it("should not re-queue non-balance failures", async () => {
        const household = await createTestHousehold({ first_name: "NonBalance" });

        await createTestFailedSms({
            household_id: household.id,
            error_message: "Network timeout",
        });

        const response = await retryBalanceFailuresPOST();
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.requeuedCount).toBe(0);
    });

    it("should return 0 when there are no balance failures", async () => {
        const response = await retryBalanceFailuresPOST();
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.requeuedCount).toBe(0);
    });
});
