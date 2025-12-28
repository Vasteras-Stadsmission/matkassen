/**
 * Integration tests for SMS health statistics
 *
 * These tests verify the getSmsHealthStats() function correctly
 * aggregates SMS delivery statistics for the daily health report.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getSmsHealthStats } from "@/app/utils/sms/sms-service";
import { createTestHousehold, resetHouseholdCounter } from "../../factories/household.factory";
import {
    createTestSms,
    createTestSentSms,
    createTestFailedSms,
    createTestProviderFailedSms,
    createTestDismissedFailedSms,
    resetSmsCounter,
} from "../../factories/sms.factory";
import { TEST_NOW } from "../../test-time";

describe("SMS Health Statistics", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetSmsCounter();
        // Mock Time.now() to return TEST_NOW for consistent testing
        vi.useFakeTimers();
        vi.setSystemTime(TEST_NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("Basic counting", () => {
        it("returns zero counts when no SMS exist", async () => {
            const stats = await getSmsHealthStats();

            expect(stats.sent).toBe(0);
            expect(stats.delivered).toBe(0);
            expect(stats.providerFailed).toBe(0);
            expect(stats.notDelivered).toBe(0);
            expect(stats.awaiting).toBe(0);
            expect(stats.internalFailed).toBe(0);
            expect(stats.staleUnconfirmed).toBe(0);
            expect(stats.hasIssues).toBe(false);
        });

        it("counts sent SMS awaiting confirmation", async () => {
            const household = await createTestHousehold();

            // Create sent SMS without provider status (awaiting confirmation)
            await createTestSentSms({
                household_id: household.id,
            });

            const stats = await getSmsHealthStats();

            expect(stats.sent).toBe(1);
            expect(stats.awaiting).toBe(1);
            expect(stats.hasIssues).toBe(false); // Awaiting is not an issue
        });

        it("counts delivered SMS", async () => {
            const household = await createTestHousehold();

            await createTestSms({
                household_id: household.id,
                status: "sent",
                sent_at: TEST_NOW,
                provider_message_id: "msg_1",
                provider_status: "delivered",
                provider_status_updated_at: TEST_NOW,
            });

            const stats = await getSmsHealthStats();

            expect(stats.sent).toBe(1);
            expect(stats.delivered).toBe(1);
            expect(stats.hasIssues).toBe(false);
        });

        it("counts provider failures as issues", async () => {
            const household = await createTestHousehold();

            await createTestProviderFailedSms({
                household_id: household.id,
                provider_status: "failed",
            });

            const stats = await getSmsHealthStats();

            expect(stats.sent).toBe(1);
            expect(stats.providerFailed).toBe(1);
            expect(stats.hasIssues).toBe(true);
        });

        it("counts 'not delivered' status as issues", async () => {
            const household = await createTestHousehold();

            await createTestProviderFailedSms({
                household_id: household.id,
                provider_status: "not delivered",
            });

            const stats = await getSmsHealthStats();

            expect(stats.sent).toBe(1);
            expect(stats.notDelivered).toBe(1);
            expect(stats.hasIssues).toBe(true);
        });

        it("counts internal failures as issues", async () => {
            const household = await createTestHousehold();

            await createTestFailedSms({
                household_id: household.id,
            });

            const stats = await getSmsHealthStats();

            expect(stats.internalFailed).toBe(1);
            expect(stats.hasIssues).toBe(true);
        });
    });

    describe("Dismissed items exclusion", () => {
        it("excludes dismissed internal failures from counts", async () => {
            const household = await createTestHousehold();

            // Create a dismissed failed SMS
            await createTestDismissedFailedSms({
                household_id: household.id,
            });

            const stats = await getSmsHealthStats();

            // Should not count dismissed failures
            expect(stats.internalFailed).toBe(0);
            expect(stats.hasIssues).toBe(false);
        });

        it("excludes dismissed sent SMS from counts", async () => {
            const household = await createTestHousehold();

            await createTestSms({
                household_id: household.id,
                status: "sent",
                sent_at: TEST_NOW,
                provider_message_id: "msg_1",
                provider_status: "failed",
                provider_status_updated_at: TEST_NOW,
                dismissed_at: TEST_NOW,
                dismissed_by_user_id: "test-user",
            });

            const stats = await getSmsHealthStats();

            expect(stats.sent).toBe(0);
            expect(stats.providerFailed).toBe(0);
            expect(stats.hasIssues).toBe(false);
        });
    });

    describe("Stale unconfirmed detection", () => {
        it("detects SMS sent more than 24 hours ago without provider status", async () => {
            const household = await createTestHousehold();

            // SMS sent 25 hours ago, still no provider status
            const staleTime = new Date(TEST_NOW.getTime() - 25 * 60 * 60 * 1000);
            await createTestSms({
                household_id: household.id,
                status: "sent",
                sent_at: staleTime,
                // No provider_status = callback never arrived
            });

            const stats = await getSmsHealthStats();

            expect(stats.staleUnconfirmed).toBe(1);
            expect(stats.hasIssues).toBe(true);
        });

        it("does not count recently sent SMS without status as stale", async () => {
            const household = await createTestHousehold();

            // SMS sent 2 hours ago, no provider status yet (normal)
            const recentTime = new Date(TEST_NOW.getTime() - 2 * 60 * 60 * 1000);
            await createTestSms({
                household_id: household.id,
                status: "sent",
                sent_at: recentTime,
            });

            const stats = await getSmsHealthStats();

            // Should be in awaiting, not stale
            expect(stats.awaiting).toBe(1);
            expect(stats.staleUnconfirmed).toBe(0);
            expect(stats.hasIssues).toBe(false);
        });

        it("excludes dismissed stale SMS from stale count", async () => {
            const household = await createTestHousehold();

            // Stale SMS that was dismissed
            const staleTime = new Date(TEST_NOW.getTime() - 25 * 60 * 60 * 1000);
            await createTestSms({
                household_id: household.id,
                status: "sent",
                sent_at: staleTime,
                dismissed_at: TEST_NOW,
                dismissed_by_user_id: "test-user",
            });

            const stats = await getSmsHealthStats();

            expect(stats.staleUnconfirmed).toBe(0);
            expect(stats.hasIssues).toBe(false);
        });

        it("does not count SMS with provider status as stale", async () => {
            const household = await createTestHousehold();

            // Old SMS that was delivered (has provider status)
            const oldTime = new Date(TEST_NOW.getTime() - 48 * 60 * 60 * 1000);
            await createTestSms({
                household_id: household.id,
                status: "sent",
                sent_at: oldTime,
                provider_message_id: "msg_old",
                provider_status: "delivered",
                provider_status_updated_at: oldTime,
            });

            const stats = await getSmsHealthStats();

            expect(stats.staleUnconfirmed).toBe(0);
            // Old delivered SMS not in 24h window for regular stats
            expect(stats.sent).toBe(0);
        });
    });

    describe("Mixed scenarios", () => {
        it("correctly counts mixed SMS statuses", async () => {
            const household = await createTestHousehold();

            // 2 delivered
            await createTestSms({
                household_id: household.id,
                status: "sent",
                sent_at: TEST_NOW,
                provider_message_id: "msg_1",
                provider_status: "delivered",
                provider_status_updated_at: TEST_NOW,
            });
            await createTestSms({
                household_id: household.id,
                status: "sent",
                sent_at: TEST_NOW,
                provider_message_id: "msg_2",
                provider_status: "delivered",
                provider_status_updated_at: TEST_NOW,
            });

            // 1 provider failed
            await createTestProviderFailedSms({
                household_id: household.id,
                provider_status: "failed",
            });

            // 1 awaiting
            await createTestSentSms({
                household_id: household.id,
            });

            // 1 internal failed
            await createTestFailedSms({
                household_id: household.id,
            });

            // 1 dismissed (should not count)
            await createTestDismissedFailedSms({
                household_id: household.id,
            });

            const stats = await getSmsHealthStats();

            expect(stats.sent).toBe(4); // 2 delivered + 1 failed + 1 awaiting
            expect(stats.delivered).toBe(2);
            expect(stats.providerFailed).toBe(1);
            expect(stats.awaiting).toBe(1);
            expect(stats.internalFailed).toBe(1);
            expect(stats.hasIssues).toBe(true);
        });

        it("hasIssues is false when only successful deliveries exist", async () => {
            const household = await createTestHousehold();

            // Multiple successful deliveries
            for (let i = 0; i < 5; i++) {
                await createTestSms({
                    household_id: household.id,
                    status: "sent",
                    sent_at: TEST_NOW,
                    provider_message_id: `msg_${i}`,
                    provider_status: "delivered",
                    provider_status_updated_at: TEST_NOW,
                });
            }

            const stats = await getSmsHealthStats();

            expect(stats.sent).toBe(5);
            expect(stats.delivered).toBe(5);
            expect(stats.hasIssues).toBe(false);
        });
    });
});
