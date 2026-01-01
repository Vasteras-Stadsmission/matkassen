/**
 * Integration tests for the Issues API (/api/admin/issues).
 *
 * These tests verify that the Issues API correctly filters data
 * and excludes anonymized households from all issue categories.
 *
 * IMPORTANT: Uses shared TEST_NOW for deterministic testing.
 *
 * NOTE ON TESTING APPROACH:
 * These tests use query functions that mirror the production queries in
 * issues/route.ts, running against a PGlite in-memory database. This approach:
 * - Tests query correctness with real SQL execution
 * - Provides isolation from production database
 * - Runs faster than HTTP-based tests
 *
 * Full API handler testing (auth, HTTP, errors) is covered by e2e tests.
 * See: e2e/api-health.spec.ts for end-to-end API validation.
 *
 * Future improvement: Refactor to support dependency injection for the database
 * connection, allowing tests to call actual handlers with the test database.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestFailedSms,
    resetHouseholdCounter,
    resetLocationCounter,
    resetSmsCounter,
} from "../../factories";
import { TEST_NOW, daysFromTestNow, hoursFromTestNow } from "../../test-time";
import {
    foodParcels,
    outgoingSms,
    households,
    pickupLocations,
    pickupLocationSchedules,
    pickupLocationScheduleDays,
} from "@/app/db/schema";
import { eq, and, gte, lt, asc, isNull, or, sql } from "drizzle-orm";
import { notDeleted } from "@/app/db/query-helpers";

// 24 hours threshold for stale SMS (matches production code)
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Query unresolved handouts - mirrors production query in issues/route.ts
 * Parcels where DATE has passed, no outcome set
 */
async function queryUnresolvedHandouts(
    db: Awaited<ReturnType<typeof getTestDb>>,
    now: Date = TEST_NOW,
) {
    // Use Stockholm timezone for date comparison
    // For testing, we'll use a simplified check since PGlite doesn't support AT TIME ZONE
    return db
        .select({
            parcelId: foodParcels.id,
            householdId: foodParcels.household_id,
            householdFirstName: households.first_name,
            householdLastName: households.last_name,
            pickupDateEarliest: foodParcels.pickup_date_time_earliest,
            pickupDateLatest: foodParcels.pickup_date_time_latest,
            locationName: pickupLocations.name,
        })
        .from(foodParcels)
        .innerJoin(households, eq(foodParcels.household_id, households.id))
        .innerJoin(pickupLocations, eq(foodParcels.pickup_location_id, pickupLocations.id))
        .where(
            and(
                notDeleted(),
                eq(foodParcels.is_picked_up, false),
                isNull(foodParcels.no_show_at),
                isNull(households.anonymized_at), // Exclude anonymized households
                lt(foodParcels.pickup_date_time_latest, now), // Past parcels
            ),
        )
        .orderBy(asc(foodParcels.pickup_date_time_earliest))
        .limit(100);
}

/**
 * Query future parcels for outside-hours check - mirrors production query
 */
async function queryFutureParcels(db: Awaited<ReturnType<typeof getTestDb>>, now: Date = TEST_NOW) {
    return db
        .select({
            parcelId: foodParcels.id,
            householdId: foodParcels.household_id,
            householdFirstName: households.first_name,
            householdLastName: households.last_name,
            pickupDateEarliest: foodParcels.pickup_date_time_earliest,
            pickupDateLatest: foodParcels.pickup_date_time_latest,
            locationId: foodParcels.pickup_location_id,
            locationName: pickupLocations.name,
            isPickedUp: foodParcels.is_picked_up,
        })
        .from(foodParcels)
        .innerJoin(households, eq(foodParcels.household_id, households.id))
        .innerJoin(pickupLocations, eq(foodParcels.pickup_location_id, pickupLocations.id))
        .where(
            and(
                notDeleted(),
                eq(foodParcels.is_picked_up, false),
                isNull(households.anonymized_at), // Exclude anonymized households
                gte(foodParcels.pickup_date_time_earliest, now), // Future only
            ),
        )
        .orderBy(asc(foodParcels.pickup_date_time_earliest))
        .limit(500);
}

/**
 * Query failed SMS - mirrors production query
 */
async function queryFailedSms(db: Awaited<ReturnType<typeof getTestDb>>, now: Date = TEST_NOW) {
    const staleThreshold = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);

    return db
        .select({
            id: outgoingSms.id,
            intent: outgoingSms.intent,
            householdId: outgoingSms.household_id,
            householdFirstName: households.first_name,
            householdLastName: households.last_name,
            parcelId: outgoingSms.parcel_id,
            status: outgoingSms.status,
            providerStatus: outgoingSms.provider_status,
            errorMessage: outgoingSms.last_error_message,
            sentAt: outgoingSms.sent_at,
            createdAt: outgoingSms.created_at,
        })
        .from(outgoingSms)
        .innerJoin(households, eq(outgoingSms.household_id, households.id))
        .where(
            and(
                isNull(outgoingSms.dismissed_at), // Not dismissed
                isNull(households.anonymized_at), // Exclude anonymized households
                or(
                    eq(outgoingSms.status, "failed"), // Internal failure
                    and(
                        eq(outgoingSms.status, "sent"),
                        or(
                            eq(outgoingSms.provider_status, "failed"),
                            eq(outgoingSms.provider_status, "not delivered"),
                        ),
                    ),
                    and(
                        eq(outgoingSms.status, "sent"),
                        isNull(outgoingSms.provider_status),
                        lt(outgoingSms.sent_at, staleThreshold),
                    ),
                ),
            ),
        )
        .orderBy(asc(outgoingSms.created_at))
        .limit(100);
}

describe("Issues API - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
    });

    describe("Anonymized Household Exclusion", () => {
        describe("Unresolved Handouts", () => {
            it("should exclude anonymized households from unresolved handouts", async () => {
                const db = await getTestDb();
                const household = await createTestHousehold({ first_name: "John" });
                const { location } = await createTestLocationWithSchedule();

                // Create past parcel with no outcome (unresolved handout)
                const yesterday = daysFromTestNow(-1);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: yesterday,
                    pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                    is_picked_up: false,
                });

                // Verify the unresolved handout appears before anonymization
                let results = await queryUnresolvedHandouts(db, TEST_NOW);
                expect(results).toHaveLength(1);
                expect(results[0].householdFirstName).toBe("John");

                // Anonymize the household
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household.id));

                // Verify the unresolved handout is now excluded
                results = await queryUnresolvedHandouts(db, TEST_NOW);
                expect(results).toHaveLength(0);
            });

            it("should still show non-anonymized households in unresolved handouts", async () => {
                const db = await getTestDb();
                const household1 = await createTestHousehold({ first_name: "Alice" });
                const household2 = await createTestHousehold({ first_name: "Bob" });
                const { location } = await createTestLocationWithSchedule();

                const yesterday = daysFromTestNow(-1);

                // Create unresolved parcels for both households
                await createTestParcel({
                    household_id: household1.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: yesterday,
                    pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                    is_picked_up: false,
                });

                await createTestParcel({
                    household_id: household2.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: new Date(yesterday.getTime() + 60 * 60 * 1000),
                    pickup_date_time_latest: new Date(yesterday.getTime() + 90 * 60 * 1000),
                    is_picked_up: false,
                });

                // Anonymize only household1
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household1.id));

                // Verify only household2 (non-anonymized) appears
                const results = await queryUnresolvedHandouts(db, TEST_NOW);
                expect(results).toHaveLength(1);
                expect(results[0].householdFirstName).toBe("Bob");
            });
        });

        describe("Future Parcels (Outside Hours)", () => {
            it("should exclude anonymized households from future parcels", async () => {
                const db = await getTestDb();
                const household = await createTestHousehold({ first_name: "Jane" });
                const { location } = await createTestLocationWithSchedule();

                // Create future parcel
                const tomorrow = daysFromTestNow(1);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: tomorrow,
                    pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                    is_picked_up: false,
                });

                // Verify the future parcel appears before anonymization
                let results = await queryFutureParcels(db, TEST_NOW);
                expect(results).toHaveLength(1);
                expect(results[0].householdFirstName).toBe("Jane");

                // Anonymize the household
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household.id));

                // Verify the future parcel is now excluded
                results = await queryFutureParcels(db, TEST_NOW);
                expect(results).toHaveLength(0);
            });

            it("should still show non-anonymized households in future parcels", async () => {
                const db = await getTestDb();
                const household1 = await createTestHousehold({ first_name: "Charlie" });
                const household2 = await createTestHousehold({ first_name: "Diana" });
                const { location } = await createTestLocationWithSchedule();

                const tomorrow = daysFromTestNow(1);

                // Create future parcels for both households
                await createTestParcel({
                    household_id: household1.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: tomorrow,
                    pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                    is_picked_up: false,
                });

                await createTestParcel({
                    household_id: household2.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: new Date(tomorrow.getTime() + 60 * 60 * 1000),
                    pickup_date_time_latest: new Date(tomorrow.getTime() + 90 * 60 * 1000),
                    is_picked_up: false,
                });

                // Anonymize only household1
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household1.id));

                // Verify only household2 (non-anonymized) appears
                const results = await queryFutureParcels(db, TEST_NOW);
                expect(results).toHaveLength(1);
                expect(results[0].householdFirstName).toBe("Diana");
            });
        });

        describe("Failed SMS", () => {
            it("should exclude anonymized households from failed SMS", async () => {
                const db = await getTestDb();
                const household = await createTestHousehold({ first_name: "Eve" });
                const { location } = await createTestLocationWithSchedule();

                // Create a parcel for the SMS
                const tomorrow = daysFromTestNow(1);
                const parcel = await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: tomorrow,
                    pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                });

                // Create failed SMS
                await createTestFailedSms({
                    household_id: household.id,
                    parcel_id: parcel.id,
                    error_message: "Delivery failed",
                });

                // Verify the failed SMS appears before anonymization
                let results = await queryFailedSms(db, TEST_NOW);
                expect(results).toHaveLength(1);
                expect(results[0].householdFirstName).toBe("Eve");

                // Anonymize the household
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household.id));

                // Verify the failed SMS is now excluded
                results = await queryFailedSms(db, TEST_NOW);
                expect(results).toHaveLength(0);
            });

            it("should still show non-anonymized households in failed SMS", async () => {
                const db = await getTestDb();
                const household1 = await createTestHousehold({ first_name: "Frank" });
                const household2 = await createTestHousehold({ first_name: "Grace" });
                const { location } = await createTestLocationWithSchedule();

                const tomorrow = daysFromTestNow(1);

                // Create parcels and failed SMS for both households
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

                // Anonymize only household1
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household1.id));

                // Verify only household2 (non-anonymized) appears
                const results = await queryFailedSms(db, TEST_NOW);
                expect(results).toHaveLength(1);
                expect(results[0].householdFirstName).toBe("Grace");
            });
        });

        describe("All Issue Types Together", () => {
            it("should exclude anonymized household from all issue categories simultaneously", async () => {
                const db = await getTestDb();
                const household = await createTestHousehold({ first_name: "Henry" });
                const { location } = await createTestLocationWithSchedule();

                // Create an unresolved handout (past parcel, no outcome)
                const yesterday = daysFromTestNow(-1);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: yesterday,
                    pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                    is_picked_up: false,
                });

                // Create a future parcel (for outside hours check)
                const tomorrow = daysFromTestNow(1);
                const futureParcel = await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: tomorrow,
                    pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                    is_picked_up: false,
                });

                // Create a failed SMS
                await createTestFailedSms({
                    household_id: household.id,
                    parcel_id: futureParcel.id,
                });

                // Verify all issues appear before anonymization
                let unresolvedResults = await queryUnresolvedHandouts(db, TEST_NOW);
                let futureResults = await queryFutureParcels(db, TEST_NOW);
                let smsResults = await queryFailedSms(db, TEST_NOW);

                expect(unresolvedResults).toHaveLength(1);
                expect(futureResults).toHaveLength(1);
                expect(smsResults).toHaveLength(1);

                // Anonymize the household
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household.id));

                // Verify all issues are now excluded
                unresolvedResults = await queryUnresolvedHandouts(db, TEST_NOW);
                futureResults = await queryFutureParcels(db, TEST_NOW);
                smsResults = await queryFailedSms(db, TEST_NOW);

                expect(unresolvedResults).toHaveLength(0);
                expect(futureResults).toHaveLength(0);
                expect(smsResults).toHaveLength(0);
            });
        });
    });
});
