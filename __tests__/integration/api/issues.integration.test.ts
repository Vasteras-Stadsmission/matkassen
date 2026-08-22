/**
 * Integration tests for the Issues API (/api/admin/issues).
 *
 * These tests verify that the Issues API correctly filters data
 * and excludes anonymized households from all issue categories.
 *
 * IMPORTANT: Uses shared TEST_NOW for deterministic testing.
 *
 * This test calls the actual route handler with mocked dependencies:
 * - Database: PGlite in-memory database
 * - Time: MockTimeProvider with TEST_NOW
 * - Auth: Mocked to always succeed
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestNoShowParcel,
    createTestPickedUpParcel,
    createTestFailedSms,
    createTestSms,
    createTestGlobalSetting,
    resetHouseholdCounter,
    resetLocationCounter,
    resetSmsCounter,
} from "../../factories";
import { TEST_NOW, daysFromTestNow } from "../../test-time";
import { foodParcels, households, pickupLocationDailyLimits } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import {
    MockTimeProvider,
    setTimeProvider,
    getTimeProvider,
    type ITimeProvider,
} from "@/app/utils/time-provider";
import { getStockholmDateKey } from "@/app/utils/date-utils";

// Store original time provider
let originalTimeProvider: ITimeProvider;

// Mock auth to always succeed
vi.mock("@/app/utils/auth/api-auth", () => ({
    authenticateAdminRequest: vi.fn(() =>
        Promise.resolve({
            success: true,
            session: { user: { id: "test-admin", role: "admin" } },
        }),
    ),
}));

// Import route handler AFTER mocking dependencies
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let GET: typeof import("@/app/api/admin/issues/route").GET;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let GET_COUNT: typeof import("@/app/api/admin/issues/count/route").GET;

describe("Issues API - Integration Tests", () => {
    beforeAll(async () => {
        // Set mock time provider with TEST_NOW
        originalTimeProvider = getTimeProvider();
        setTimeProvider(new MockTimeProvider(TEST_NOW));

        // Dynamically import the route handler after mocks are set up
        const routeModule = await import("@/app/api/admin/issues/route");
        GET = routeModule.GET;

        const countModule = await import("@/app/api/admin/issues/count/route");
        GET_COUNT = countModule.GET;
    });

    afterAll(async () => {
        // Restore original time provider
        setTimeProvider(originalTimeProvider);
    });

    beforeEach(async () => {
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
                let response = await GET();
                let data = await response.json();
                expect(data.unresolvedHandouts).toHaveLength(1);
                expect(data.unresolvedHandouts[0].householdFirstName).toBe("John");
                expect(data.counts.unresolvedHandouts).toBe(1);

                // Anonymize the household
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household.id));

                // Verify the unresolved handout is now excluded
                response = await GET();
                data = await response.json();
                expect(data.unresolvedHandouts).toHaveLength(0);
                expect(data.counts.unresolvedHandouts).toBe(0);
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
                const response = await GET();
                const data = await response.json();
                expect(data.unresolvedHandouts).toHaveLength(1);
                expect(data.unresolvedHandouts[0].householdFirstName).toBe("Bob");
            });
        });

        describe("Future Parcels (Outside Hours)", () => {
            it("should exclude anonymized households from future parcels", async () => {
                const db = await getTestDb();
                const household = await createTestHousehold({ first_name: "Jane" });
                // Only open on Monday so Sunday parcels are definitely outside opening hours
                const { location } = await createTestLocationWithSchedule(
                    {},
                    { weekdays: ["monday"], openingTime: "09:00", closingTime: "17:00" },
                );

                // TEST_NOW is Saturday, +1 day is Sunday (future)
                const tomorrow = daysFromTestNow(1);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: tomorrow,
                    pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                    is_picked_up: false,
                });

                // Verify the future parcel appears before anonymization
                let response = await GET();
                let data = await response.json();
                expect(data.outsideHours).toHaveLength(1);
                expect(data.outsideHours[0].householdFirstName).toBe("Jane");
                expect(data.counts.outsideHours).toBe(1);

                // Anonymize the household
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household.id));

                // Verify parcels from anonymized household are excluded
                response = await GET();
                data = await response.json();
                expect(data.outsideHours).toHaveLength(0);
                expect(data.counts.outsideHours).toBe(0);
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
                let response = await GET();
                let data = await response.json();
                expect(data.failedSms).toHaveLength(1);
                expect(data.failedSms[0].householdFirstName).toBe("Eve");
                expect(data.counts.failedSms).toBe(1);

                // Anonymize the household
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household.id));

                // Verify the failed SMS is now excluded
                response = await GET();
                data = await response.json();
                expect(data.failedSms).toHaveLength(0);
                expect(data.counts.failedSms).toBe(0);
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
                const response = await GET();
                const data = await response.json();
                expect(data.failedSms).toHaveLength(1);
                expect(data.failedSms[0].householdFirstName).toBe("Grace");
            });
        });

        describe("All Issue Types Together", () => {
            it("should exclude anonymized household from all issue categories simultaneously", async () => {
                const db = await getTestDb();
                const household = await createTestHousehold({ first_name: "Henry" });
                // Only open on Monday so Sunday parcels are definitely outside opening hours
                const { location } = await createTestLocationWithSchedule(
                    {},
                    { weekdays: ["monday"], openingTime: "09:00", closingTime: "17:00" },
                );

                // Create an unresolved handout (past parcel, no outcome)
                const yesterday = daysFromTestNow(-1);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: yesterday,
                    pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                    is_picked_up: false,
                });

                // Create a future parcel that is outside opening hours (Sunday)
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

                // Verify issues appear before anonymization
                let response = await GET();
                let data = await response.json();
                expect(data.unresolvedHandouts).toHaveLength(1);
                expect(data.outsideHours).toHaveLength(1);
                expect(data.failedSms).toHaveLength(1);
                expect(data.counts.total).toBe(3);

                // Anonymize the household
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household.id));

                // Verify all issues are now excluded
                response = await GET();
                data = await response.json();
                expect(data.unresolvedHandouts).toHaveLength(0);
                expect(data.outsideHours).toHaveLength(0);
                expect(data.failedSms).toHaveLength(0);
                expect(data.counts.total).toBe(0);
            });
        });
    });

    describe("SMS Failure Classification", () => {
        it("should classify failures as internal/provider_rejected/provider_unreachable/stale", async () => {
            const household = await createTestHousehold({ first_name: "Fail" });
            const createdAtBase = new Date(TEST_NOW.getTime() - 4 * 60 * 1000);

            // Internal failure (app-level status: "failed")
            await createTestSms({
                household_id: household.id,
                status: "failed",
                created_at: new Date(createdAtBase.getTime() + 0),
            });

            // Provider rejected (provider_status: "failed" — instant rejection, bad number)
            await createTestSms({
                household_id: household.id,
                status: "sent",
                provider_status: "failed",
                sent_at: new Date(TEST_NOW.getTime() - 60 * 60 * 1000),
                created_at: new Date(createdAtBase.getTime() + 1000),
            });

            // Provider unreachable (provider_status: "not delivered" — 48h timeout, phone off)
            await createTestSms({
                household_id: household.id,
                status: "sent",
                provider_status: "not delivered",
                sent_at: new Date(TEST_NOW.getTime() - 49 * 60 * 60 * 1000),
                created_at: new Date(createdAtBase.getTime() + 2000),
            });

            // Stale (sent but no provider status after 24h)
            await createTestSms({
                household_id: household.id,
                status: "sent",
                sent_at: new Date(TEST_NOW.getTime() - 25 * 60 * 60 * 1000),
                created_at: new Date(createdAtBase.getTime() + 3000),
            });

            const response = await GET();
            const data = await response.json();

            expect(data.failedSms).toHaveLength(4);
            expect(data.failedSms.map((s: { failureType: string }) => s.failureType)).toEqual([
                "internal",
                "provider_rejected",
                "provider_unreachable",
                "stale",
            ]);
        });

        it("should redact phone numbers from error messages", async () => {
            const household = await createTestHousehold({ first_name: "Redact" });
            await createTestFailedSms({
                household_id: household.id,
                error_message: "Delivery failed for +46701234567 (070-123 45 67)",
            });

            const response = await GET();
            const data = await response.json();

            expect(data.failedSms).toHaveLength(1);
            expect(data.failedSms[0].errorMessage).toContain("[PHONE REDACTED]");
            expect(data.failedSms[0].errorMessage).not.toContain("+46701234567");
            expect(data.failedSms[0].errorMessage).not.toContain("070-123 45 67");
        });

        it("should exclude balance failures from the issues list", async () => {
            const household = await createTestHousehold({ first_name: "BalExclude" });

            // Balance failure — should NOT appear on Issues page
            await createTestSms({
                household_id: household.id,
                status: "failed",
                attempt_count: 1,
                last_error_message: "Insufficient SMS credits",
                balance_failure: true,
            });

            // Regular failure — should appear
            await createTestFailedSms({
                household_id: household.id,
                error_message: "Network timeout",
            });

            const response = await GET();
            const data = await response.json();

            expect(data.failedSms).toHaveLength(1);
            expect(data.failedSms[0].errorMessage).toContain("Network timeout");
        });

        it("should exclude 'waiting' provider status from issues (non-terminal)", async () => {
            const household = await createTestHousehold({ first_name: "WaitExcl" });

            // SMS with provider_status "waiting" — should NOT appear on Issues page
            await createTestSms({
                household_id: household.id,
                status: "sent",
                provider_status: "waiting",
                sent_at: new Date(TEST_NOW.getTime() - 60 * 60 * 1000),
                provider_message_id: "msg_waiting_test",
                provider_status_updated_at: new Date(TEST_NOW.getTime() - 30 * 60 * 1000),
            });

            // Provider-failed SMS — should appear
            await createTestSms({
                household_id: household.id,
                status: "sent",
                provider_status: "failed",
                sent_at: new Date(TEST_NOW.getTime() - 60 * 60 * 1000),
                provider_message_id: "msg_failed_test",
                provider_status_updated_at: new Date(TEST_NOW.getTime() - 30 * 60 * 1000),
            });

            const response = await GET();
            const data = await response.json();

            expect(data.failedSms).toHaveLength(1);
            expect(data.failedSms[0].failureType).toBe("provider_rejected");

            // Count endpoint should also exclude waiting
            const countResponse = await GET_COUNT();
            const countData = await countResponse.json();
            expect(countData.failedSms).toBe(1);
        });

        it("should include pickupEarliest in the response", async () => {
            const household = await createTestHousehold({ first_name: "Pickup" });
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

            const response = await GET();
            const data = await response.json();

            expect(data.failedSms).toHaveLength(1);
            expect(data.failedSms[0].pickupEarliest).toBe(tomorrow.toISOString());
        });
    });

    describe("Over-capacity dates", () => {
        const allWeekdays = [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        ] as const;

        it("returns one issue per location/date with every affected parcel", async () => {
            const householdsForDate = [];
            for (const [index, firstName] of ["First", "Second", "Third"].entries()) {
                householdsForDate.push(
                    await createTestHousehold({
                        first_name: firstName,
                        phone_number: "+4681888000" + index,
                    }),
                );
            }
            const { location } = await createTestLocationWithSchedule(
                { name: "Capacity Kitchen", parcels_max_per_day: 1 },
                { weekdays: [...allWeekdays] },
            );
            const pickupDate = daysFromTestNow(2);

            for (const [index, household] of householdsForDate.entries()) {
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: new Date(
                        pickupDate.getTime() + index * 30 * 60 * 1000,
                    ),
                });
            }

            const response = await GET();
            const data = await response.json();
            const countResponse = await GET_COUNT();
            const countData = await countResponse.json();

            expect(data.overCapacityDates).toHaveLength(1);
            expect(data.overCapacityDates[0]).toMatchObject({
                locationId: location.id,
                locationName: "Capacity Kitchen",
                date: getStockholmDateKey(pickupDate),
                booked: 3,
                limit: 1,
                excess: 2,
                hasOverride: false,
            });
            expect(data.overCapacityDates[0].parcels).toHaveLength(3);
            expect(data.overCapacityDates[0].parcels[0]).toMatchObject({
                isPickedUp: false,
                noShowAt: null,
            });
            expect(
                data.overCapacityDates[0].parcels.map(
                    (parcel: { householdFirstName: string }) => parcel.householdFirstName,
                ),
            ).toEqual(["First", "Second", "Third"]);
            expect(data.counts.overCapacityDates).toBe(1);
            expect(countData.overCapacityDates).toBe(1);
        });

        it("does not flag dates that are exactly full, unlimited, deleted, or past", async () => {
            const householdRows = [];
            for (const index of [1, 2, 3, 4, 5]) {
                householdRows.push(
                    await createTestHousehold({
                        first_name: "Boundary" + index,
                        phone_number: "+4681999000" + index,
                    }),
                );
            }
            const { location: exactLocation } = await createTestLocationWithSchedule(
                { parcels_max_per_day: 2 },
                { weekdays: [...allWeekdays] },
            );
            const { location: unlimitedLocation } = await createTestLocationWithSchedule(
                { parcels_max_per_day: null },
                { weekdays: [...allWeekdays] },
            );
            const futureDate = daysFromTestNow(2);

            await createTestParcel({
                household_id: householdRows[0].id,
                pickup_location_id: exactLocation.id,
                pickup_date_time_earliest: futureDate,
            });
            await createTestParcel({
                household_id: householdRows[1].id,
                pickup_location_id: exactLocation.id,
                pickup_date_time_earliest: new Date(futureDate.getTime() + 30 * 60 * 1000),
            });
            await createTestParcel({
                household_id: householdRows[2].id,
                pickup_location_id: unlimitedLocation.id,
                pickup_date_time_earliest: futureDate,
            });
            await createTestParcel({
                household_id: householdRows[3].id,
                pickup_location_id: exactLocation.id,
                pickup_date_time_earliest: new Date(futureDate.getTime() + 60 * 60 * 1000),
                deleted_at: TEST_NOW,
            });
            await createTestParcel({
                household_id: householdRows[4].id,
                pickup_location_id: exactLocation.id,
                pickup_date_time_earliest: daysFromTestNow(-1),
            });

            const response = await GET();
            const data = await response.json();
            const countResponse = await GET_COUNT();
            const countData = await countResponse.json();

            expect(data.overCapacityDates).toHaveLength(0);
            expect(data.counts.overCapacityDates).toBe(0);
            expect(countData.overCapacityDates).toBe(0);
        });

        it("uses a date override and disappears when the effective max is raised", async () => {
            const db = await getTestDb();
            const first = await createTestHousehold({ first_name: "OverrideOne" });
            const second = await createTestHousehold({ first_name: "OverrideTwo" });
            const { location } = await createTestLocationWithSchedule(
                { parcels_max_per_day: 5 },
                { weekdays: [...allWeekdays] },
            );
            const pickupDate = daysFromTestNow(2);
            const dateKey = getStockholmDateKey(pickupDate);

            await createTestParcel({
                household_id: first.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupDate,
            });
            await createTestParcel({
                household_id: second.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: new Date(pickupDate.getTime() + 30 * 60 * 1000),
            });
            await db.insert(pickupLocationDailyLimits).values({
                pickup_location_id: location.id,
                date: dateKey,
                max_parcels: 1,
            });

            let response = await GET();
            let data = await response.json();
            expect(data.overCapacityDates[0]).toMatchObject({
                date: dateKey,
                booked: 2,
                limit: 1,
                excess: 1,
                hasOverride: true,
            });

            await db
                .update(pickupLocationDailyLimits)
                .set({ max_parcels: 2 })
                .where(eq(pickupLocationDailyLimits.pickup_location_id, location.id));

            response = await GET();
            data = await response.json();
            expect(data.overCapacityDates).toHaveLength(0);
        });

        it("disappears after enough parcels are moved or cancelled", async () => {
            const db = await getTestDb();
            const first = await createTestHousehold({ first_name: "ResolveOne" });
            const second = await createTestHousehold({ first_name: "ResolveTwo" });
            const { location } = await createTestLocationWithSchedule(
                { parcels_max_per_day: 1 },
                { weekdays: [...allWeekdays] },
            );
            const pickupDate = daysFromTestNow(2);
            await createTestParcel({
                household_id: first.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupDate,
            });
            const parcelToCancel = await createTestParcel({
                household_id: second.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: new Date(pickupDate.getTime() + 30 * 60 * 1000),
            });

            let response = await GET();
            let data = await response.json();
            expect(data.overCapacityDates).toHaveLength(1);

            await db
                .update(foodParcels)
                .set({ deleted_at: TEST_NOW })
                .where(eq(foodParcels.id, parcelToCancel.id));

            response = await GET();
            data = await response.json();
            expect(data.overCapacityDates).toHaveLength(0);
            expect(data.counts.overCapacityDates).toBe(0);
        });

        it("does not expose parcels belonging to anonymized households", async () => {
            const db = await getTestDb();
            const visibleHousehold = await createTestHousehold({ first_name: "Visible" });
            const anonymizedHousehold = await createTestHousehold({ first_name: "Anonymous" });
            const { location } = await createTestLocationWithSchedule(
                { parcels_max_per_day: 1 },
                { weekdays: [...allWeekdays] },
            );
            const pickupDate = daysFromTestNow(2);

            await createTestParcel({
                household_id: visibleHousehold.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupDate,
            });
            await createTestParcel({
                household_id: anonymizedHousehold.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: new Date(pickupDate.getTime() + 30 * 60 * 1000),
            });
            await db
                .update(households)
                .set({ anonymized_at: TEST_NOW })
                .where(eq(households.id, anonymizedHousehold.id));

            const response = await GET();
            const data = await response.json();
            const countResponse = await GET_COUNT();
            const countData = await countResponse.json();

            expect(data.overCapacityDates).toHaveLength(0);
            expect(data.counts.overCapacityDates).toBe(0);
            expect(countData.overCapacityDates).toBe(0);
        });

        it("returns handed-out and no-show status for terminal drawer rows", async () => {
            const pickedUpHousehold = await createTestHousehold({ first_name: "PickedUp" });
            const noShowHousehold = await createTestHousehold({ first_name: "NoShow" });
            const { location } = await createTestLocationWithSchedule(
                { parcels_max_per_day: 1 },
                { weekdays: [...allWeekdays] },
            );
            const pickupDate = daysFromTestNow(2);

            await createTestPickedUpParcel({
                household_id: pickedUpHousehold.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupDate,
            });
            await createTestNoShowParcel({
                household_id: noShowHousehold.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: new Date(pickupDate.getTime() + 30 * 60 * 1000),
            });

            const response = await GET();
            const data = await response.json();

            expect(data.overCapacityDates).toHaveLength(1);
            expect(data.overCapacityDates[0].parcels).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        householdFirstName: "PickedUp",
                        isPickedUp: true,
                        noShowAt: null,
                    }),
                    expect.objectContaining({
                        householdFirstName: "NoShow",
                        isPickedUp: false,
                        noShowAt: expect.any(String),
                    }),
                ]),
            );
        });
    });

    describe("Counts", () => {
        it("should return counts larger than the 100-item display limit", async () => {
            const household = await createTestHousehold({ first_name: "Count" });
            const { location } = await createTestLocationWithSchedule();
            const yesterday = daysFromTestNow(-1);

            for (let i = 0; i < 101; i++) {
                const earliest = new Date(yesterday.getTime() + i * 60 * 1000);
                const latest = new Date(earliest.getTime() + 30 * 60 * 1000);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: earliest,
                    pickup_date_time_latest: latest,
                    is_picked_up: false,
                });
            }

            const response = await GET();
            const data = await response.json();

            expect(data.unresolvedHandouts).toHaveLength(100);
            expect(data.counts.unresolvedHandouts).toBe(101);
            expect(data.counts.total).toBe(101);
        });

        it("should match the lightweight count endpoint", async () => {
            const household = await createTestHousehold({ first_name: "Badge" });
            const noshowHousehold = await createTestHousehold({ first_name: "NoShow" });
            const { location } = await createTestLocationWithSchedule(
                {},
                { weekdays: ["monday"], openingTime: "09:00", closingTime: "17:00" },
            );

            // unresolvedHandouts
            const yesterday = daysFromTestNow(-1);
            await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: yesterday,
                pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                is_picked_up: false,
            });

            // outsideHours (Sunday)
            const tomorrow = daysFromTestNow(1);
            const outsideParcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                is_picked_up: false,
            });

            // failedSms
            await createTestFailedSms({ household_id: household.id, parcel_id: outsideParcel.id });

            // noShowFollowups - 2 consecutive no-shows (meets default threshold of 2)
            await createTestNoShowParcel({
                household_id: noshowHousehold.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: daysFromTestNow(-3),
                no_show_at: daysFromTestNow(-3),
            });
            await createTestNoShowParcel({
                household_id: noshowHousehold.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: daysFromTestNow(-2),
                no_show_at: daysFromTestNow(-2),
            });

            const mainResponse = await GET();
            const mainData = await mainResponse.json();

            const countResponse = await GET_COUNT();
            const countData = await countResponse.json();

            expect(mainData.counts.noShowFollowups).toBeGreaterThan(0);
            expect(countData).toEqual({
                total: mainData.counts.total,
                unresolvedHandouts: mainData.counts.unresolvedHandouts,
                outsideHours: mainData.counts.outsideHours,
                failedSms: mainData.counts.failedSms,
                noShowFollowups: mainData.counts.noShowFollowups,
                overCapacityDates: mainData.counts.overCapacityDates,
            });
        });
    });

    describe("No-Show Followups", () => {
        it("should count no-show followups exceeding consecutive threshold", async () => {
            const household = await createTestHousehold({ first_name: "ConsecNS" });
            const { location } = await createTestLocationWithSchedule();

            // 2 consecutive no-shows (default consecutive threshold = 2)
            await createTestNoShowParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: daysFromTestNow(-3),
                no_show_at: daysFromTestNow(-3),
            });
            await createTestNoShowParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: daysFromTestNow(-2),
                no_show_at: daysFromTestNow(-2),
            });

            const response = await GET();
            const data = await response.json();
            expect(data.noShowFollowups).toHaveLength(1);
            expect(data.noShowFollowups[0].householdFirstName).toBe("ConsecNS");
            expect(data.counts.noShowFollowups).toBe(1);

            // Count endpoint should agree
            const countResponse = await GET_COUNT();
            const countData = await countResponse.json();
            expect(countData.noShowFollowups).toBe(1);
        });

        it("should count no-show followups exceeding total threshold", async () => {
            const household = await createTestHousehold({ first_name: "TotalNS" });
            const { location } = await createTestLocationWithSchedule();

            // 4 no-shows interspersed with pickups (breaks consecutive, hits total threshold = 4)
            // Pattern: noshow, pickup, noshow, pickup, noshow, pickup, noshow
            for (let i = 0; i < 7; i++) {
                const date = daysFromTestNow(-8 + i);
                if (i % 2 === 0) {
                    // no-show
                    await createTestNoShowParcel({
                        household_id: household.id,
                        pickup_location_id: location.id,
                        pickup_date_time_earliest: date,
                        no_show_at: date,
                    });
                } else {
                    // pickup (breaks consecutive streak)
                    await createTestPickedUpParcel({
                        household_id: household.id,
                        pickup_location_id: location.id,
                        pickup_date_time_earliest: date,
                        picked_up_at: date,
                    });
                }
            }

            const response = await GET();
            const data = await response.json();
            expect(data.noShowFollowups).toHaveLength(1);
            expect(data.noShowFollowups[0].householdFirstName).toBe("TotalNS");
            expect(data.noShowFollowups[0].totalNoShows).toBe(4);
            expect(data.counts.noShowFollowups).toBe(1);

            // Count endpoint should agree
            const countResponse = await GET_COUNT();
            const countData = await countResponse.json();
            expect(countData.noShowFollowups).toBe(1);
        });

        it("should return 0 when noshow followup is disabled", async () => {
            await createTestGlobalSetting("noshow_followup_enabled", "false");

            const household = await createTestHousehold({ first_name: "Disabled" });
            const { location } = await createTestLocationWithSchedule();

            // Create qualifying no-show data (2 consecutive)
            await createTestNoShowParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: daysFromTestNow(-3),
                no_show_at: daysFromTestNow(-3),
            });
            await createTestNoShowParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: daysFromTestNow(-2),
                no_show_at: daysFromTestNow(-2),
            });

            const response = await GET();
            const data = await response.json();
            expect(data.noShowFollowups).toHaveLength(0);
            expect(data.counts.noShowFollowups).toBe(0);

            const countResponse = await GET_COUNT();
            const countData = await countResponse.json();
            expect(countData.noShowFollowups).toBe(0);
        });

        it("should exclude dismissed followups", async () => {
            const household = await createTestHousehold({
                first_name: "Dismissed",
                // Dismissed AFTER the last no-show
                noshow_followup_dismissed_at: daysFromTestNow(-1),
            });
            const { location } = await createTestLocationWithSchedule();

            // 2 consecutive no-shows at day -3 and -2 (before dismissal at day -1)
            await createTestNoShowParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: daysFromTestNow(-3),
                no_show_at: daysFromTestNow(-3),
            });
            await createTestNoShowParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: daysFromTestNow(-2),
                no_show_at: daysFromTestNow(-2),
            });

            const response = await GET();
            const data = await response.json();
            expect(data.noShowFollowups).toHaveLength(0);
            expect(data.counts.noShowFollowups).toBe(0);

            const countResponse = await GET_COUNT();
            const countData = await countResponse.json();
            expect(countData.noShowFollowups).toBe(0);
        });
    });

    describe("Response Structure", () => {
        it("should return expected response structure", async () => {
            const response = await GET();
            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data).toHaveProperty("unresolvedHandouts");
            expect(data).toHaveProperty("outsideHours");
            expect(data).toHaveProperty("failedSms");
            expect(data).toHaveProperty("overCapacityDates");
            expect(data).toHaveProperty("counts");
            expect(Array.isArray(data.unresolvedHandouts)).toBe(true);
            expect(Array.isArray(data.outsideHours)).toBe(true);
            expect(Array.isArray(data.failedSms)).toBe(true);
            expect(Array.isArray(data.overCapacityDates)).toBe(true);
        });

        it("should include no-store Cache-Control header for fresh data", async () => {
            const response = await GET();
            const cacheControl = response.headers.get("Cache-Control");
            // Main issues endpoint uses no-store for real-time data
            // (count endpoint uses private with short cache for navigation badges)
            expect(cacheControl).toContain("no-store");
        });

        it("should include short private cache headers for the count endpoint", async () => {
            const response = await GET_COUNT();
            const cacheControl = response.headers.get("Cache-Control");
            expect(cacheControl).toContain("private");
            expect(cacheControl).toContain("max-age=30");
        });
    });
});
