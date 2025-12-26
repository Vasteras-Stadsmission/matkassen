/**
 * Integration tests for SMS failures query logic.
 *
 * Tests the database query that powers /api/admin/sms/failures endpoint.
 * Verifies correct filtering, ordering, and data retrieval.
 *
 * IMPORTANT: Uses fixed base dates for deterministic testing.
 * All dates are relative to TEST_NOW to avoid flaky tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestDeletedParcel,
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
 * Fixed "now" time for all tests.
 * Using a fixed date ensures tests are deterministic and don't depend on system time.
 */
const TEST_NOW = new Date("2024-06-15T10:00:00Z");

/**
 * Helper to create dates relative to TEST_NOW
 */
function daysFromNow(days: number): Date {
    return new Date(TEST_NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

function hoursFromNow(hours: number): Date {
    return new Date(TEST_NOW.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Query function matching the failures list API endpoint logic.
 * Accepts 'now' parameter for deterministic testing.
 */
async function queryFailedSms(db: Awaited<ReturnType<typeof getTestDb>>, now: Date = new Date()) {
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
                gte(foodParcels.pickup_date_time_latest, now),
                eq(outgoingSms.status, "failed"),
            ),
        )
        .orderBy(asc(foodParcels.pickup_date_time_earliest))
        .limit(100);
}

/**
 * Query function matching the failure count API endpoint logic.
 * Accepts 'now' parameter for deterministic testing.
 */
async function queryFailedSmsCount(
    db: Awaited<ReturnType<typeof getTestDb>>,
    now: Date = new Date(),
) {
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

            const results = await queryFailedSms(db, TEST_NOW);

            expect(results).toHaveLength(0);
        });

        it("should return failed SMS for upcoming parcels", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create parcel for tomorrow (relative to TEST_NOW)
            const tomorrow = daysFromNow(1);
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

            const results = await queryFailedSms(db, TEST_NOW);

            expect(results).toHaveLength(1);
            expect(results[0].householdFirstName).toBe(household.first_name);
            expect(results[0].householdLastName).toBe(household.last_name);
            expect(results[0].errorMessage).toBe("Invalid phone number");
        });

        it("should exclude failed SMS for past parcels", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create parcel for yesterday (past relative to TEST_NOW)
            const yesterday = daysFromNow(-1);
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

            const results = await queryFailedSms(db, TEST_NOW);

            expect(results).toHaveLength(0);
        });

        it("should exclude failed SMS for soft-deleted parcels", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create and soft-delete a parcel using the factory
            const tomorrow = daysFromNow(1);
            const deletedParcel = await createTestDeletedParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // Create failed SMS for deleted parcel
            await createTestFailedSms({
                household_id: household.id,
                parcel_id: deletedParcel.id,
            });

            const results = await queryFailedSms(db, TEST_NOW);

            expect(results).toHaveLength(0);
        });

        it("should exclude non-failed SMS statuses", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromNow(1);
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

            const results = await queryFailedSms(db, TEST_NOW);

            expect(results).toHaveLength(0);
        });
    });

    describe("Ordering", () => {
        it("should order by pickup date ascending (soonest first)", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create parcels at different times (relative to TEST_NOW)
            const in3Days = daysFromNow(3);
            const in1Day = daysFromNow(1);
            const in2Days = daysFromNow(2);

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

            const results = await queryFailedSms(db, TEST_NOW);

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

            const tomorrow = daysFromNow(1);

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

            const results = await queryFailedSms(db, TEST_NOW);

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

            // Create 105 failed SMS using batch approach for efficiency
            const households = await Promise.all(
                Array.from({ length: 105 }, () => createTestHousehold()),
            );

            // Create parcels and SMS for each household
            for (let i = 0; i < 105; i++) {
                const pickupTime = hoursFromNow(24 + i); // Stagger pickup times
                const parcel = await createTestParcel({
                    household_id: households[i].id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupTime,
                    pickup_date_time_latest: new Date(pickupTime.getTime() + 30 * 60 * 1000),
                });
                await createTestFailedSms({
                    household_id: households[i].id,
                    parcel_id: parcel.id,
                });
            }

            const results = await queryFailedSms(db, TEST_NOW);

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
                const pickupTime = hoursFromNow(24 + i);
                const parcel = await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupTime,
                    pickup_date_time_latest: new Date(pickupTime.getTime() + 30 * 60 * 1000),
                });
                await createTestFailedSms({
                    household_id: household.id,
                    parcel_id: parcel.id,
                });
            }

            const list = await queryFailedSms(db, TEST_NOW);
            const count = await queryFailedSmsCount(db, TEST_NOW);

            expect(count).toBe(list.length);
            expect(count).toBe(5);
        });

        it("should both return zero when no failures", async () => {
            const db = await getTestDb();

            const list = await queryFailedSms(db, TEST_NOW);
            const count = await queryFailedSmsCount(db, TEST_NOW);

            expect(list).toHaveLength(0);
            expect(count).toBe(0);
        });
    });
});
