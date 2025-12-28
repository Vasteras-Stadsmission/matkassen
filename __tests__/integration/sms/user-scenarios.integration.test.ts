/**
 * Integration tests for real-world SMS user scenarios.
 *
 * These tests verify complete user workflows, not just query logic.
 * Each test represents something a staff member would actually do.
 *
 * IMPORTANT: Uses shared TEST_NOW for deterministic testing.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestFailedSms,
    createTestSentSms,
    createTestSms,
    createTestProviderFailedSms,
    createTestDismissedFailedSms,
    resetHouseholdCounter,
    resetLocationCounter,
    resetSmsCounter,
} from "../../factories";
import { TEST_NOW, daysFromTestNow } from "../../test-time";
import { foodParcels, outgoingSms, households } from "@/app/db/schema";
import { eq, and, gte, asc, sql, or, isNull, isNotNull } from "drizzle-orm";
import { notDeleted } from "@/app/db/query-helpers";

// Simulate the failures dashboard query
async function getFailuresDashboard(
    db: Awaited<ReturnType<typeof getTestDb>>,
    now: Date,
    filter: "active" | "dismissed" = "active",
) {
    const dismissCondition =
        filter === "dismissed"
            ? isNotNull(outgoingSms.dismissed_at)
            : isNull(outgoingSms.dismissed_at);

    return db
        .select({
            id: outgoingSms.id,
            householdName: sql<string>`${households.first_name} || ' ' || ${households.last_name}`,
            phoneNumber: outgoingSms.to_e164,
            parcelId: outgoingSms.parcel_id,
            pickupDate: foodParcels.pickup_date_time_earliest,
            status: outgoingSms.status,
            providerStatus: outgoingSms.provider_status,
            errorMessage: outgoingSms.last_error_message,
            dismissedAt: outgoingSms.dismissed_at,
        })
        .from(outgoingSms)
        .innerJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
        .innerJoin(households, eq(foodParcels.household_id, households.id))
        .where(
            and(
                notDeleted(),
                gte(foodParcels.pickup_date_time_latest, now),
                dismissCondition,
                or(
                    eq(outgoingSms.status, "failed"),
                    and(
                        eq(outgoingSms.status, "sent"),
                        or(
                            eq(outgoingSms.provider_status, "failed"),
                            eq(outgoingSms.provider_status, "not delivered"),
                        ),
                    ),
                ),
            ),
        )
        .orderBy(asc(foodParcels.pickup_date_time_earliest));
}

// Simulate the badge count query
async function getFailureBadgeCount(db: Awaited<ReturnType<typeof getTestDb>>, now: Date) {
    const result = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(outgoingSms)
        .innerJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
        .where(
            and(
                notDeleted(),
                gte(foodParcels.pickup_date_time_latest, now),
                isNull(outgoingSms.dismissed_at),
                or(
                    eq(outgoingSms.status, "failed"),
                    and(
                        eq(outgoingSms.status, "sent"),
                        or(
                            eq(outgoingSms.provider_status, "failed"),
                            eq(outgoingSms.provider_status, "not delivered"),
                        ),
                    ),
                ),
            ),
        );
    return result[0]?.count || 0;
}

// Simulate dismissing a failure
async function dismissFailure(
    db: Awaited<ReturnType<typeof getTestDb>>,
    smsId: string,
    userId: string,
) {
    await db
        .update(outgoingSms)
        .set({ dismissed_at: TEST_NOW, dismissed_by_user_id: userId })
        .where(eq(outgoingSms.id, smsId));
}

// Simulate restoring a dismissed failure
async function restoreFailure(db: Awaited<ReturnType<typeof getTestDb>>, smsId: string) {
    await db
        .update(outgoingSms)
        .set({ dismissed_at: null, dismissed_by_user_id: null })
        .where(eq(outgoingSms.id, smsId));
}

// Simulate cancelling a parcel (soft delete)
async function cancelParcel(
    db: Awaited<ReturnType<typeof getTestDb>>,
    parcelId: string,
    userId: string,
) {
    await db
        .update(foodParcels)
        .set({ deleted_at: TEST_NOW, deleted_by_user_id: userId })
        .where(eq(foodParcels.id, parcelId));
}

// Simulate webhook updating provider status
async function updateProviderStatus(
    db: Awaited<ReturnType<typeof getTestDb>>,
    providerMessageId: string,
    providerStatus: string,
) {
    await db
        .update(outgoingSms)
        .set({
            provider_status: providerStatus,
            provider_status_updated_at: TEST_NOW,
        })
        .where(eq(outgoingSms.provider_message_id, providerMessageId));
}

// Simulate creating a resend (new SMS record for same parcel)
async function resendSms(
    db: Awaited<ReturnType<typeof getTestDb>>,
    householdId: string,
    parcelId: string,
) {
    // Resend creates a new SMS with a unique idempotency key
    const [sms] = await db
        .insert(outgoingSms)
        .values({
            household_id: householdId,
            parcel_id: parcelId,
            intent: "pickup_reminder",
            to_e164: "+46701234567",
            text: "Resent reminder",
            status: "queued",
            idempotency_key: `pickup_reminder|${parcelId}|manual|${Date.now()}`,
            attempt_count: 0,
        })
        .returning();
    return sms;
}

describe("SMS User Scenarios - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
    });

    describe("Scenario: Staff reviews failed SMS for tomorrow's pickups", () => {
        it("shows failures with household name, phone, pickup time, and error details", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                first_name: "Anna",
                last_name: "Andersson",
                phone_number: "+46701234567",
            });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
                to_e164: "+46701234567",
                error_message: "Connection timeout after 30s",
            });

            const dashboard = await getFailuresDashboard(db, TEST_NOW);

            expect(dashboard).toHaveLength(1);
            expect(dashboard[0].householdName).toBe("Anna Andersson");
            expect(dashboard[0].phoneNumber).toBe("+46701234567");
            expect(dashboard[0].errorMessage).toBe("Connection timeout after 30s");
            expect(dashboard[0].status).toBe("failed");
        });

        it("shows failures ordered by pickup time (most urgent first)", async () => {
            const db = await getTestDb();
            const { location } = await createTestLocationWithSchedule();

            // Create three households with pickups at different times
            const household1 = await createTestHousehold({ first_name: "Later" });
            const household2 = await createTestHousehold({ first_name: "Earliest" });
            const household3 = await createTestHousehold({ first_name: "Middle" });

            const day3 = daysFromTestNow(3);
            const day1 = daysFromTestNow(1);
            const day2 = daysFromTestNow(2);

            const parcel1 = await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: day3,
                pickup_date_time_latest: new Date(day3.getTime() + 30 * 60 * 1000),
            });
            const parcel2 = await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: day1,
                pickup_date_time_latest: new Date(day1.getTime() + 30 * 60 * 1000),
            });
            const parcel3 = await createTestParcel({
                household_id: household3.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: day2,
                pickup_date_time_latest: new Date(day2.getTime() + 30 * 60 * 1000),
            });

            await createTestFailedSms({ household_id: household1.id, parcel_id: parcel1.id });
            await createTestFailedSms({ household_id: household2.id, parcel_id: parcel2.id });
            await createTestFailedSms({ household_id: household3.id, parcel_id: parcel3.id });

            const dashboard = await getFailuresDashboard(db, TEST_NOW);

            expect(dashboard).toHaveLength(3);
            expect(dashboard[0].householdName).toContain("Earliest");
            expect(dashboard[1].householdName).toContain("Middle");
            expect(dashboard[2].householdName).toContain("Later");
        });
    });

    describe("Scenario: HelloSMS reports delivery failure via webhook", () => {
        it("SMS appears in failures after provider reports failed status", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // SMS was sent successfully (our API call worked)
            const sms = await createTestSentSms({
                household_id: household.id,
                parcel_id: parcel.id,
                provider_message_id: "msg_abc123",
            });

            // Initially not in failures (sent successfully, no provider status yet)
            let dashboard = await getFailuresDashboard(db, TEST_NOW);
            expect(dashboard).toHaveLength(0);

            // Webhook arrives: HelloSMS says delivery failed
            await updateProviderStatus(db, "msg_abc123", "failed");

            // Now appears in failures
            dashboard = await getFailuresDashboard(db, TEST_NOW);
            expect(dashboard).toHaveLength(1);
            expect(dashboard[0].id).toBe(sms.id);
            expect(dashboard[0].status).toBe("sent");
            expect(dashboard[0].providerStatus).toBe("failed");
        });

        it("SMS with 'not delivered' status also appears in failures", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            await createTestSentSms({
                household_id: household.id,
                parcel_id: parcel.id,
                provider_message_id: "msg_xyz789",
            });

            // Webhook: phone was off/unreachable
            await updateProviderStatus(db, "msg_xyz789", "not delivered");

            const dashboard = await getFailuresDashboard(db, TEST_NOW);
            expect(dashboard).toHaveLength(1);
            expect(dashboard[0].providerStatus).toBe("not delivered");
        });

        it("Successfully delivered SMS does NOT appear in failures", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            await createTestSentSms({
                household_id: household.id,
                parcel_id: parcel.id,
                provider_message_id: "msg_success",
            });

            // Webhook: delivered successfully
            await updateProviderStatus(db, "msg_success", "delivered");

            const dashboard = await getFailuresDashboard(db, TEST_NOW);
            expect(dashboard).toHaveLength(0);
        });
    });

    describe("Scenario: Staff dismisses a failure they've handled", () => {
        it("dismissed failure moves from active to dismissed tab", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const sms = await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
            });

            // Initially in active tab
            let active = await getFailuresDashboard(db, TEST_NOW, "active");
            let dismissed = await getFailuresDashboard(db, TEST_NOW, "dismissed");
            expect(active).toHaveLength(1);
            expect(dismissed).toHaveLength(0);

            // Staff dismisses it
            await dismissFailure(db, sms.id, "staff-anna");

            // Moves to dismissed tab
            active = await getFailuresDashboard(db, TEST_NOW, "active");
            dismissed = await getFailuresDashboard(db, TEST_NOW, "dismissed");
            expect(active).toHaveLength(0);
            expect(dismissed).toHaveLength(1);
            expect(dismissed[0].dismissedAt).not.toBeNull();
        });

        it("dismissed failure no longer counts in badge", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const sms = await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
            });

            // Badge shows 1
            let badgeCount = await getFailureBadgeCount(db, TEST_NOW);
            expect(badgeCount).toBe(1);

            // Dismiss it
            await dismissFailure(db, sms.id, "staff-bob");

            // Badge shows 0
            badgeCount = await getFailureBadgeCount(db, TEST_NOW);
            expect(badgeCount).toBe(0);
        });

        it("staff can restore a mistakenly dismissed failure", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const sms = await createTestDismissedFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
            });

            // Currently dismissed
            let active = await getFailuresDashboard(db, TEST_NOW, "active");
            expect(active).toHaveLength(0);

            // Restore it
            await restoreFailure(db, sms.id);

            // Back in active
            active = await getFailuresDashboard(db, TEST_NOW, "active");
            expect(active).toHaveLength(1);
        });
    });

    describe("Scenario: Staff resends SMS after failure", () => {
        it("resend creates new SMS record, old failure remains until dismissed", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // Initial SMS failed
            await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
            });

            // Staff clicks resend - creates new SMS record
            const newSms = await resendSms(db, household.id, parcel.id);
            expect(newSms.status).toBe("queued");

            // Old failure still shows (staff should dismiss it if handled)
            const dashboard = await getFailuresDashboard(db, TEST_NOW);
            expect(dashboard).toHaveLength(1);
        });

        it("if resend also fails, both failures show separately", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // First attempt failed
            await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
                error_message: "First attempt failed",
            });

            // Second attempt (resend) also failed
            await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
                error_message: "Second attempt failed",
            });

            const dashboard = await getFailuresDashboard(db, TEST_NOW);
            expect(dashboard).toHaveLength(2);
        });
    });

    describe("Scenario: Parcel is cancelled after SMS failure", () => {
        it("failure disappears from dashboard when parcel is cancelled", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
            });

            // Initially visible
            let dashboard = await getFailuresDashboard(db, TEST_NOW);
            expect(dashboard).toHaveLength(1);

            // Admin cancels the parcel
            await cancelParcel(db, parcel.id, "admin-user");

            // Failure no longer shows (parcel is cancelled, no action needed)
            dashboard = await getFailuresDashboard(db, TEST_NOW);
            expect(dashboard).toHaveLength(0);
        });
    });

    describe("Scenario: Badge count accuracy across different failure types", () => {
        it("badge counts both internal failures and provider failures", async () => {
            const db = await getTestDb();
            const { location } = await createTestLocationWithSchedule();
            const tomorrow = daysFromTestNow(1);

            // Internal failure (our API call failed)
            const household1 = await createTestHousehold();
            const parcel1 = await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });
            await createTestFailedSms({ household_id: household1.id, parcel_id: parcel1.id });

            // Provider failure (we sent it, but delivery failed)
            const household2 = await createTestHousehold();
            const parcel2 = await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 60 * 60 * 1000),
            });
            await createTestProviderFailedSms({
                household_id: household2.id,
                parcel_id: parcel2.id,
                provider_status: "failed",
            });

            const badgeCount = await getFailureBadgeCount(db, TEST_NOW);
            expect(badgeCount).toBe(2);
        });

        it("badge excludes successfully delivered SMS", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // Successfully sent and delivered
            await createTestSentSms({
                household_id: household.id,
                parcel_id: parcel.id,
            });

            const badgeCount = await getFailureBadgeCount(db, TEST_NOW);
            expect(badgeCount).toBe(0);
        });
    });

    describe("Scenario: Staff sees full context for decision making", () => {
        it("distinguishes between internal failure and provider failure", async () => {
            const db = await getTestDb();
            const { location } = await createTestLocationWithSchedule();
            const tomorrow = daysFromTestNow(1);

            const household1 = await createTestHousehold({ first_name: "Internal" });
            const parcel1 = await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });
            await createTestFailedSms({
                household_id: household1.id,
                parcel_id: parcel1.id,
                error_message: "API timeout",
            });

            const household2 = await createTestHousehold({ first_name: "Provider" });
            const parcel2 = await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: new Date(tomorrow.getTime() + 60 * 60 * 1000),
                pickup_date_time_latest: new Date(tomorrow.getTime() + 90 * 60 * 1000),
            });
            await createTestProviderFailedSms({
                household_id: household2.id,
                parcel_id: parcel2.id,
                provider_status: "not delivered",
            });

            const dashboard = await getFailuresDashboard(db, TEST_NOW);

            const internalFailure = dashboard.find(f => f.householdName.includes("Internal"));
            const providerFailure = dashboard.find(f => f.householdName.includes("Provider"));

            // Internal failure: status=failed, no provider status
            expect(internalFailure?.status).toBe("failed");
            expect(internalFailure?.providerStatus).toBeNull();
            expect(internalFailure?.errorMessage).toBe("API timeout");

            // Provider failure: status=sent, provider says not delivered
            expect(providerFailure?.status).toBe("sent");
            expect(providerFailure?.providerStatus).toBe("not delivered");
        });
    });
});
