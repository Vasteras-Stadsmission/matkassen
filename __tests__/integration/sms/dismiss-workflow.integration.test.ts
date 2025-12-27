/**
 * Integration tests for SMS dismiss workflow and provider failure tracking.
 *
 * Tests the business logic for:
 * - Dismissing and restoring SMS failures
 * - Filtering by dismiss status
 * - Provider failures counting in failure badge
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
    createTestDismissedFailedSms,
    createTestProviderFailedSms,
    createTestSentSms,
    resetHouseholdCounter,
    resetLocationCounter,
    resetSmsCounter,
} from "../../factories";
import { TEST_NOW, daysFromTestNow } from "../../test-time";
import { foodParcels, outgoingSms, households } from "@/app/db/schema";
import { eq, and, gte, asc, sql, or, isNull, isNotNull } from "drizzle-orm";
import { notDeleted } from "@/app/db/query-helpers";

/**
 * Query function matching the failures list API with dismiss filtering.
 */
async function queryFailuresWithDismissFilter(
    db: Awaited<ReturnType<typeof getTestDb>>,
    now: Date,
    dismissedFilter: "active" | "dismissed",
) {
    const dismissCondition =
        dismissedFilter === "dismissed"
            ? isNotNull(outgoingSms.dismissed_at)
            : isNull(outgoingSms.dismissed_at);

    return db
        .select({
            id: outgoingSms.id,
            status: outgoingSms.status,
            providerStatus: outgoingSms.provider_status,
            dismissedAt: outgoingSms.dismissed_at,
            dismissedByUserId: outgoingSms.dismissed_by_user_id,
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
        .orderBy(asc(foodParcels.pickup_date_time_earliest))
        .limit(100);
}

/**
 * Query function matching the failure count API including provider failures.
 */
async function queryFailureCount(db: Awaited<ReturnType<typeof getTestDb>>, now: Date) {
    const result = await db
        .select({
            count: sql<number>`count(*)::int`,
        })
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

describe("SMS Dismiss Workflow - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
    });

    describe("Dismiss Filtering", () => {
        it("should only return active (non-dismissed) failures by default", async () => {
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

            // Create one active and one dismissed failure
            await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
                error_message: "Active failure",
            });
            await createTestDismissedFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
                error_message: "Dismissed failure",
            });

            const activeResults = await queryFailuresWithDismissFilter(db, TEST_NOW, "active");

            expect(activeResults).toHaveLength(1);
            expect(activeResults[0].dismissedAt).toBeNull();
        });

        it("should return dismissed failures when filter is dismissed", async () => {
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
            await createTestDismissedFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
                dismissed_by: "admin-user",
            });

            const dismissedResults = await queryFailuresWithDismissFilter(
                db,
                TEST_NOW,
                "dismissed",
            );

            expect(dismissedResults).toHaveLength(1);
            expect(dismissedResults[0].dismissedAt).not.toBeNull();
            expect(dismissedResults[0].dismissedByUserId).toBe("admin-user");
        });
    });

    describe("Provider Failures", () => {
        it("should include provider failed SMS in failures list", async () => {
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

            // Create provider-failed SMS (sent successfully but delivery failed)
            await createTestProviderFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
                provider_status: "failed",
            });

            const results = await queryFailuresWithDismissFilter(db, TEST_NOW, "active");

            expect(results).toHaveLength(1);
            expect(results[0].status).toBe("sent");
            expect(results[0].providerStatus).toBe("failed");
        });

        it("should include not delivered SMS in failures list", async () => {
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

            await createTestProviderFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
                provider_status: "not delivered",
            });

            const results = await queryFailuresWithDismissFilter(db, TEST_NOW, "active");

            expect(results).toHaveLength(1);
            expect(results[0].providerStatus).toBe("not delivered");
        });

        it("should NOT include successfully delivered SMS in failures", async () => {
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

            // Create SMS that was delivered successfully
            await createTestSentSms({
                household_id: household.id,
                parcel_id: parcel.id,
            });

            const results = await queryFailuresWithDismissFilter(db, TEST_NOW, "active");

            expect(results).toHaveLength(0);
        });
    });

    describe("Failure Count with Provider Failures", () => {
        it("should count both internal and provider failures", async () => {
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

            // Create one internal failure and one provider failure
            await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
            });
            await createTestProviderFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
                provider_status: "failed",
            });

            const count = await queryFailureCount(db, TEST_NOW);

            expect(count).toBe(2);
        });

        it("should NOT count dismissed failures in badge count", async () => {
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

            // Create one active and one dismissed failure
            await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
            });
            await createTestDismissedFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
            });

            const count = await queryFailureCount(db, TEST_NOW);

            expect(count).toBe(1); // Only the active one
        });

        it("should return zero when all failures are dismissed", async () => {
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

            await createTestDismissedFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
            });

            const count = await queryFailureCount(db, TEST_NOW);

            expect(count).toBe(0);
        });
    });

    describe("Mixed Failure Types", () => {
        it("should handle mix of internal failures, provider failures, and dismissed", async () => {
            const db = await getTestDb();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);

            // Create 5 different scenarios
            const scenarios = [
                { type: "internal-active" },
                { type: "internal-dismissed" },
                { type: "provider-failed-active" },
                { type: "provider-not-delivered-active" },
                { type: "delivered-success" },
            ];

            for (let i = 0; i < scenarios.length; i++) {
                const household = await createTestHousehold();
                const parcel = await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: tomorrow,
                    pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                });

                switch (scenarios[i].type) {
                    case "internal-active":
                        await createTestFailedSms({
                            household_id: household.id,
                            parcel_id: parcel.id,
                        });
                        break;
                    case "internal-dismissed":
                        await createTestDismissedFailedSms({
                            household_id: household.id,
                            parcel_id: parcel.id,
                        });
                        break;
                    case "provider-failed-active":
                        await createTestProviderFailedSms({
                            household_id: household.id,
                            parcel_id: parcel.id,
                            provider_status: "failed",
                        });
                        break;
                    case "provider-not-delivered-active":
                        await createTestProviderFailedSms({
                            household_id: household.id,
                            parcel_id: parcel.id,
                            provider_status: "not delivered",
                        });
                        break;
                    case "delivered-success":
                        await createTestSentSms({
                            household_id: household.id,
                            parcel_id: parcel.id,
                        });
                        break;
                }
            }

            // Active should have: internal-active, provider-failed, provider-not-delivered = 3
            const activeResults = await queryFailuresWithDismissFilter(db, TEST_NOW, "active");
            expect(activeResults).toHaveLength(3);

            // Dismissed should have: internal-dismissed = 1
            const dismissedResults = await queryFailuresWithDismissFilter(
                db,
                TEST_NOW,
                "dismissed",
            );
            expect(dismissedResults).toHaveLength(1);

            // Badge count should match active = 3
            const count = await queryFailureCount(db, TEST_NOW);
            expect(count).toBe(3);
        });
    });
});
