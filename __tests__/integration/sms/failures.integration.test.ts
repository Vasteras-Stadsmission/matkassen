/**
 * Integration tests for SMS failures query logic.
 *
 * Tests the database query that powers /api/admin/sms/failures endpoint.
 * Verifies correct filtering, ordering, and data retrieval.
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
    resetHouseholdCounter,
    resetLocationCounter,
    resetSmsCounter,
} from "../../factories";
import { foodParcels, outgoingSms, households } from "@/app/db/schema";
import { eq, and, gte, asc, sql } from "drizzle-orm";
import { notDeleted } from "@/app/db/query-helpers";

/**
 * Query function matching the failures list API endpoint logic.
 */
async function queryFailedSms(db: Awaited<ReturnType<typeof getTestDb>>) {
    return db
        .select({
            id: outgoingSms.id,
            householdId: foodParcels.household_id,
            householdFirstName: households.first_name,
            householdLastName: households.last_name,
            parcelId: outgoingSms.parcel_id,
            pickupDateEarliest: foodParcels.pickup_date_time_earliest,
            pickupDateLatest: foodParcels.pickup_date_time_latest,
            errorMessage: outgoingSms.last_error_message,
        })
        .from(outgoingSms)
        .innerJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
        .innerJoin(households, eq(foodParcels.household_id, households.id))
        .where(
            and(
                notDeleted(),
                gte(foodParcels.pickup_date_time_latest, new Date()),
                eq(outgoingSms.status, "failed"),
            ),
        )
        .orderBy(asc(foodParcels.pickup_date_time_earliest))
        .limit(100);
}

/**
 * Query function matching the failure count API endpoint logic.
 */
async function queryFailedSmsCount(db: Awaited<ReturnType<typeof getTestDb>>) {
    const result = await db
        .select({
            count: sql<number>`count(*)::int`,
        })
        .from(outgoingSms)
        .innerJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
        .where(
            and(
                notDeleted(),
                gte(foodParcels.pickup_date_time_latest, new Date()),
                eq(outgoingSms.status, "failed"),
            ),
        );
    return result[0]?.count || 0;
}

describe("SMS Failures Query - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
    });

    describe("Basic Filtering", () => {
        it("should return empty array when no failed SMS exist", async () => {
            const db = await getTestDb();

            const results = await queryFailedSms(db);

            expect(results).toHaveLength(0);
        });

        it("should return failed SMS for upcoming parcels", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create parcel for tomorrow
            const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // Create failed SMS for this parcel
            await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
                error_message: "Invalid phone number",
            });

            const results = await queryFailedSms(db);

            expect(results).toHaveLength(1);
            expect(results[0].householdFirstName).toBe(household.first_name);
            expect(results[0].householdLastName).toBe(household.last_name);
            expect(results[0].errorMessage).toBe("Invalid phone number");
        });

        it("should exclude failed SMS for past parcels", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create parcel for yesterday (past)
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const pastParcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: yesterday,
                pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
            });

            // Create failed SMS for past parcel
            await createTestFailedSms({
                household_id: household.id,
                parcel_id: pastParcel.id,
            });

            const results = await queryFailedSms(db);

            expect(results).toHaveLength(0);
        });

        it("should exclude failed SMS for soft-deleted parcels", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create and soft-delete a parcel
            const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const [deletedParcel] = await db
                .insert(foodParcels)
                .values({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: tomorrow,
                    pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                    deleted_at: new Date(), // Soft-deleted
                    deleted_by_user_id: "test-admin",
                })
                .returning();

            // Create failed SMS for deleted parcel
            await createTestFailedSms({
                household_id: household.id,
                parcel_id: deletedParcel.id,
            });

            const results = await queryFailedSms(db);

            expect(results).toHaveLength(0);
        });

        it("should exclude non-failed SMS statuses", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // Create SMS with various statuses (none failed)
            await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                status: "queued",
            });
            await createTestSentSms({
                household_id: household.id,
                parcel_id: parcel.id,
            });
            await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                status: "sending",
            });

            const results = await queryFailedSms(db);

            expect(results).toHaveLength(0);
        });
    });

    describe("Ordering", () => {
        it("should order by pickup date ascending (soonest first)", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create parcels at different times
            const in3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
            const in1Day = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
            const in2Days = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

            const parcel3Days = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: in3Days,
                pickup_date_time_latest: new Date(in3Days.getTime() + 30 * 60 * 1000),
            });

            const parcel1Day = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: in1Day,
                pickup_date_time_latest: new Date(in1Day.getTime() + 30 * 60 * 1000),
            });

            const parcel2Days = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: in2Days,
                pickup_date_time_latest: new Date(in2Days.getTime() + 30 * 60 * 1000),
            });

            // Create failed SMS for each (in different order than expected result)
            await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel3Days.id,
                error_message: "Error 3",
            });
            await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel1Day.id,
                error_message: "Error 1",
            });
            await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel2Days.id,
                error_message: "Error 2",
            });

            const results = await queryFailedSms(db);

            expect(results).toHaveLength(3);
            // Should be ordered: 1 day, 2 days, 3 days (soonest first)
            expect(results[0].errorMessage).toBe("Error 1");
            expect(results[1].errorMessage).toBe("Error 2");
            expect(results[2].errorMessage).toBe("Error 3");
        });
    });

    describe("Multiple Households", () => {
        it("should return failures from multiple households", async () => {
            const db = await getTestDb();
            const household1 = await createTestHousehold({ first_name: "Alice" });
            const household2 = await createTestHousehold({ first_name: "Bob" });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

            const parcel1 = await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const parcel2 = await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: new Date(tomorrow.getTime() + 60 * 60 * 1000),
                pickup_date_time_latest: new Date(tomorrow.getTime() + 90 * 60 * 1000),
            });

            await createTestFailedSms({
                household_id: household1.id,
                parcel_id: parcel1.id,
            });
            await createTestFailedSms({
                household_id: household2.id,
                parcel_id: parcel2.id,
            });

            const results = await queryFailedSms(db);

            expect(results).toHaveLength(2);
            const names = results.map(r => r.householdFirstName);
            expect(names).toContain("Alice");
            expect(names).toContain("Bob");
        });
    });

    describe("Limit", () => {
        it("should limit results to 100", async () => {
            const db = await getTestDb();
            const { location } = await createTestLocationWithSchedule();

            // Create 105 failed SMS
            for (let i = 0; i < 105; i++) {
                const household = await createTestHousehold();
                const tomorrow = new Date(Date.now() + (24 + i) * 60 * 60 * 1000);
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
            }

            const results = await queryFailedSms(db);

            expect(results).toHaveLength(100);
        });
    });

    describe("Count-List Consistency", () => {
        it("should have count match list length", async () => {
            const db = await getTestDb();
            const { location } = await createTestLocationWithSchedule();

            // Create multiple failed SMS
            for (let i = 0; i < 5; i++) {
                const household = await createTestHousehold();
                const tomorrow = new Date(Date.now() + (24 + i) * 60 * 60 * 1000);
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
            }

            const list = await queryFailedSms(db);
            const count = await queryFailedSmsCount(db);

            expect(count).toBe(list.length);
            expect(count).toBe(5);
        });

        it("should both return zero when no failures", async () => {
            const db = await getTestDb();

            const list = await queryFailedSms(db);
            const count = await queryFailedSmsCount(db);

            expect(list).toHaveLength(0);
            expect(count).toBe(0);
        });
    });
});
