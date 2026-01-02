/**
 * Integration tests for statistics server actions.
 *
 * Tests the getAllStatistics action and its component queries.
 * Uses PGlite with deterministic time (TEST_NOW = 2024-06-15T10:00:00Z, Saturday)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTestDb } from "../../db/test-db";
import { households } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import {
    createTestHousehold,
    createTestHouseholdWithMembers,
} from "../../factories/household.factory";
import { createTestPickupLocation } from "../../factories/pickup-location.factory";
import {
    createTestParcel,
    createTestPickedUpParcel,
    createTestDeletedParcel,
} from "../../factories/food-parcel.factory";
import {
    createTestSentSms,
    createTestFailedSms,
    createTestQueuedSms,
} from "../../factories/sms.factory";
import { daysFromTestNow } from "../../test-time";

// Import the actions - must use dynamic import after mock setup
// The mock is set up in __tests__/integration/setup.ts
const getActions = async () => {
    const { getAllStatistics } = await import("@/app/[locale]/statistics/actions");
    return { getAllStatistics };
};

// Mock the authentication
vi.mock("@/app/utils/auth/server-action-auth", () => ({
    verifyServerActionAuth: vi.fn().mockResolvedValue({
        success: true,
        data: {
            user: {
                id: "test-user-id",
                name: "Test User",
                email: "test@example.com",
                githubUsername: "testuser",
            },
        },
    }),
    verifyHouseholdAccess: vi.fn(),
}));

describe("Statistics Actions", () => {
    describe("getAllStatistics", () => {
        describe("Overview Stats", () => {
            it("should return zero counts with no data", async () => {
                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("7d");

                expect(result.success).toBe(true);
                if (!result.success) return;

                expect(result.data.overview.totalHouseholds).toBe(0);
                expect(result.data.overview.newHouseholds).toBe(0);
                expect(result.data.overview.removedHouseholds).toBe(0);
                expect(result.data.overview.totalParcels).toBe(0);
                expect(result.data.overview.pickedUpParcels).toBe(0);
                expect(result.data.overview.pickupRate).toBeNull();
                expect(result.data.overview.smsDeliveryRate).toBeNull();
            });

            it("should count total active households", async () => {
                await createTestHousehold();
                await createTestHousehold();
                await createTestHousehold();

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("7d");

                expect(result.success).toBe(true);
                if (!result.success) return;

                expect(result.data.overview.totalHouseholds).toBe(3);
            });

            it("should not count anonymized households in total", async () => {
                const db = await getTestDb();
                await createTestHousehold();
                const anonymized = await createTestHousehold();
                await db
                    .update(households)
                    .set({ anonymized_at: new Date(), anonymized_by: "system" })
                    .where(eq(households.id, anonymized.id));

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("7d");

                expect(result.success).toBe(true);
                if (!result.success) return;

                expect(result.data.overview.totalHouseholds).toBe(1);
                expect(result.data.overview.removedHouseholds).toBe(1);
            });

            it("should count new households in period", async () => {
                // Created now (within 7d period)
                await createTestHousehold();
                await createTestHousehold();

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("7d");

                expect(result.success).toBe(true);
                if (!result.success) return;

                expect(result.data.overview.newHouseholds).toBe(2);
            });

            it("should count parcels correctly", async () => {
                const household = await createTestHousehold();
                const location = await createTestPickupLocation();

                // Parcels in period (yesterday and 2 days ago)
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-1),
                });
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-2),
                });

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("7d");

                expect(result.success).toBe(true);
                if (!result.success) return;

                expect(result.data.overview.totalParcels).toBe(2);
            });

            it("should calculate pickup rate correctly (excluding same-day)", async () => {
                const household = await createTestHousehold();
                const location = await createTestPickupLocation();

                // Past parcels (eligible for pickup rate)
                await createTestPickedUpParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-2),
                });
                await createTestPickedUpParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-1),
                });
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-3),
                    is_picked_up: false,
                });

                // Same-day parcel (should not affect pickup rate)
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(0), // Today
                    is_picked_up: false,
                });

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("7d");

                expect(result.success).toBe(true);
                if (!result.success) return;

                // 2 picked up out of 3 eligible (same-day excluded)
                expect(result.data.overview.pickupRate).toBeCloseTo(66.67, 1);
            });
        });

        describe("Household Stats", () => {
            it("should group households by locale", async () => {
                await createTestHousehold({ locale: "sv" });
                await createTestHousehold({ locale: "sv" });
                await createTestHousehold({ locale: "en" });

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("all");

                expect(result.success).toBe(true);
                if (!result.success) return;

                const svLocale = result.data.households.byLocale.find(l => l.locale === "sv");
                const enLocale = result.data.households.byLocale.find(l => l.locale === "en");

                expect(svLocale?.count).toBe(2);
                expect(enLocale?.count).toBe(1);
            });

            it("should group households by postal code", async () => {
                await createTestHousehold({ postal_code: "12345" });
                await createTestHousehold({ postal_code: "12345" });
                await createTestHousehold({ postal_code: "67890" });

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("all");

                expect(result.success).toBe(true);
                if (!result.success) return;

                const postalCode12345 = result.data.households.byPostalCode.find(
                    p => p.postalCode === "12345",
                );
                expect(postalCode12345?.count).toBe(2);
            });

            it("should calculate age distribution correctly", async () => {
                // Household with a child (6-12) and an adult (18-64)
                await createTestHouseholdWithMembers({}, [
                    { age: 8, sex: "male" },
                    { age: 35, sex: "female" },
                ]);

                // Household with elderly (65+)
                await createTestHouseholdWithMembers({}, [{ age: 70, sex: "male" }]);

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("all");

                expect(result.success).toBe(true);
                if (!result.success) return;

                const bucket6_12 = result.data.households.ageDistribution.find(
                    a => a.bucket === "6-12",
                );
                const bucket18_64 = result.data.households.ageDistribution.find(
                    a => a.bucket === "18-64",
                );
                const bucket65Plus = result.data.households.ageDistribution.find(
                    a => a.bucket === "65+",
                );

                expect(bucket6_12?.count).toBe(1);
                expect(bucket18_64?.count).toBe(1);
                expect(bucket65Plus?.count).toBe(1);
            });

            it("should calculate member count distribution", async () => {
                // Household with 2 members
                await createTestHouseholdWithMembers({}, [
                    { age: 35, sex: "male" },
                    { age: 33, sex: "female" },
                ]);

                // Household with 1 additional member (total: 2 with head)
                await createTestHouseholdWithMembers({}, [{ age: 45, sex: "male" }]);

                // Household with no additional members (total: 1 - just the head)
                await createTestHousehold();

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("all");

                expect(result.success).toBe(true);
                if (!result.success) return;

                // Member counts now include head of household (+1)
                // - First household: 2 members + head = 3
                // - Second household: 1 member + head = 2
                // - Third household: 0 members + head = 1
                const distribution = result.data.households.memberCountDistribution;
                expect(distribution.find(d => d.memberCount === 1)?.households).toBe(1);
                expect(distribution.find(d => d.memberCount === 2)?.households).toBe(1);
                expect(distribution.find(d => d.memberCount === 3)?.households).toBe(1);
            });

            it("should filter removed households by period", async () => {
                const db = await getTestDb();

                // Create household removed within 7 days (3 days ago)
                const recentlyRemoved = await createTestHousehold();
                await db
                    .update(households)
                    .set({
                        anonymized_at: daysFromTestNow(-3),
                        anonymized_by: "system",
                    })
                    .where(eq(households.id, recentlyRemoved.id));

                // Create household removed 15 days ago (outside 7d period)
                const oldRemoved = await createTestHousehold();
                await db
                    .update(households)
                    .set({
                        anonymized_at: daysFromTestNow(-15),
                        anonymized_by: "system",
                    })
                    .where(eq(households.id, oldRemoved.id));

                const { getAllStatistics } = await getActions();

                // 7d should only count recent removal
                const result7d = await getAllStatistics("7d");
                expect(result7d.success).toBe(true);
                if (!result7d.success) return;
                expect(result7d.data.overview.removedHouseholds).toBe(1);

                // 30d should count both
                const result30d = await getAllStatistics("30d");
                expect(result30d.success).toBe(true);
                if (!result30d.success) return;
                expect(result30d.data.overview.removedHouseholds).toBe(2);
            });

            it("should respect Stockholm timezone for period boundaries near midnight", async () => {
                const db = await getTestDb();

                // TEST_NOW is 2024-06-15T10:00:00Z (Saturday, summer)
                // In Stockholm (CEST, UTC+2): 2024-06-15 12:00:00
                // 7 days ago in Stockholm: 2024-06-09 00:00:00 CEST = 2024-06-08 22:00:00 UTC

                // Create household at 23:00 UTC on 2024-06-08
                // This is 01:00 Stockholm on 2024-06-09 (INSIDE 7d period)
                const insidePeriod = await createTestHousehold();
                await db
                    .update(households)
                    .set({
                        // 2024-06-08 23:00:00 UTC = 2024-06-09 01:00:00 Stockholm
                        created_at: new Date("2024-06-08T23:00:00Z"),
                    })
                    .where(eq(households.id, insidePeriod.id));

                // Create household at 21:00 UTC on 2024-06-08
                // This is 23:00 Stockholm on 2024-06-08 (OUTSIDE 7d period - before June 9)
                const outsidePeriod = await createTestHousehold();
                await db
                    .update(households)
                    .set({
                        // 2024-06-08 21:00:00 UTC = 2024-06-08 23:00:00 Stockholm
                        created_at: new Date("2024-06-08T21:00:00Z"),
                    })
                    .where(eq(households.id, outsidePeriod.id));

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("7d");

                expect(result.success).toBe(true);
                if (!result.success) return;

                // Only the household created at 01:00 Stockholm on June 9 should be counted
                // The one created at 23:00 Stockholm on June 8 is outside the 7d period
                expect(result.data.overview.newHouseholds).toBe(1);
            });
        });

        describe("Parcel Stats", () => {
            it("should count parcels by location", async () => {
                const household = await createTestHousehold();
                const location1 = await createTestPickupLocation({ name: "Location A" });
                const location2 = await createTestPickupLocation({ name: "Location B" });

                // 2 parcels at Location A, 1 at Location B
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location1.id,
                    pickup_date_time_earliest: daysFromTestNow(-1),
                });
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location1.id,
                    pickup_date_time_earliest: daysFromTestNow(-2),
                });
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location2.id,
                    pickup_date_time_earliest: daysFromTestNow(-3),
                });

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("7d");

                expect(result.success).toBe(true);
                if (!result.success) return;

                const locationA = result.data.parcels.byLocation.find(
                    l => l.locationName === "Location A",
                );
                const locationB = result.data.parcels.byLocation.find(
                    l => l.locationName === "Location B",
                );

                expect(locationA?.count).toBe(2);
                expect(locationB?.count).toBe(1);
            });

            it("should count cancelled (soft-deleted) parcels", async () => {
                const household = await createTestHousehold();
                const location = await createTestPickupLocation();

                // Active parcel
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-1),
                });

                // Deleted parcel
                await createTestDeletedParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-2),
                });

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("7d");

                expect(result.success).toBe(true);
                if (!result.success) return;

                expect(result.data.parcels.total).toBe(1); // Active only
                expect(result.data.parcels.cancelled).toBe(1);
            });

            it("should calculate average parcels per household", async () => {
                const household1 = await createTestHousehold();
                const household2 = await createTestHousehold();
                const location = await createTestPickupLocation();

                // Household 1: 3 parcels
                await createTestParcel({
                    household_id: household1.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-1),
                });
                await createTestParcel({
                    household_id: household1.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-2),
                });
                await createTestParcel({
                    household_id: household1.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-3),
                });

                // Household 2: 1 parcel
                await createTestParcel({
                    household_id: household2.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-1),
                });

                const { getAllStatistics } = await getActions();
                // Use "all" period to avoid date filtering edge cases
                const result = await getAllStatistics("all");

                expect(result.success).toBe(true);
                if (!result.success) return;

                // (3 + 1) / 2 = 2
                expect(result.data.parcels.avgPerHousehold).toBeCloseTo(2, 1);
            });
        });

        describe("Location Stats", () => {
            it("should calculate pickup rate by location", async () => {
                const household = await createTestHousehold();
                const location1 = await createTestPickupLocation({ name: "High Pickup" });
                const location2 = await createTestPickupLocation({ name: "Low Pickup" });

                // Location 1: 2 picked up, 0 not picked up = 100%
                await createTestPickedUpParcel({
                    household_id: household.id,
                    pickup_location_id: location1.id,
                    pickup_date_time_earliest: daysFromTestNow(-1),
                });
                await createTestPickedUpParcel({
                    household_id: household.id,
                    pickup_location_id: location1.id,
                    pickup_date_time_earliest: daysFromTestNow(-2),
                });

                // Location 2: 1 picked up, 1 not picked up = 50%
                await createTestPickedUpParcel({
                    household_id: household.id,
                    pickup_location_id: location2.id,
                    pickup_date_time_earliest: daysFromTestNow(-1),
                });
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location2.id,
                    pickup_date_time_earliest: daysFromTestNow(-2),
                    is_picked_up: false,
                });

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("7d");

                expect(result.success).toBe(true);
                if (!result.success) return;

                const highPickup = result.data.locations.pickupRateByLocation.find(
                    l => l.locationName === "High Pickup",
                );
                const lowPickup = result.data.locations.pickupRateByLocation.find(
                    l => l.locationName === "Low Pickup",
                );

                expect(highPickup?.rate).toBe(100);
                expect(lowPickup?.rate).toBe(50);
            });

            it("should generate capacity usage for next 7 days", async () => {
                const household = await createTestHousehold();
                const location = await createTestPickupLocation({
                    name: "Capacity Test",
                    parcels_max_per_day: 10,
                });

                // Schedule 3 parcels for tomorrow (30% capacity)
                const tomorrow = daysFromTestNow(1);
                for (let i = 0; i < 3; i++) {
                    const h = await createTestHousehold();
                    await createTestParcel({
                        household_id: h.id,
                        pickup_location_id: location.id,
                        pickup_date_time_earliest: tomorrow,
                    });
                }

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("7d");

                expect(result.success).toBe(true);
                if (!result.success) return;

                // Should have capacity entries for this location for 7 days
                const locationCapacity = result.data.locations.capacityUsage.filter(
                    c => c.locationName === "Capacity Test",
                );
                expect(locationCapacity.length).toBe(7);

                // Find tomorrow's entry and verify usage percentage
                const tomorrowStr = tomorrow.toISOString().split("T")[0];
                const tomorrowCapacity = locationCapacity.find(c => c.date === tomorrowStr);
                expect(tomorrowCapacity).toBeDefined();
                expect(tomorrowCapacity?.scheduled).toBe(3);
                expect(tomorrowCapacity?.max).toBe(10);
                expect(tomorrowCapacity?.usagePercent).toBe(30); // 3/10 * 100 = 30%
            });

            it("should identify near-capacity alerts (>= 80%)", async () => {
                const household = await createTestHousehold();
                const location = await createTestPickupLocation({
                    name: "Near Capacity",
                    parcels_max_per_day: 5,
                });

                // Schedule 4 parcels for tomorrow (80% = alert threshold)
                for (let i = 0; i < 4; i++) {
                    const h = await createTestHousehold();
                    await createTestParcel({
                        household_id: h.id,
                        pickup_location_id: location.id,
                        pickup_date_time_earliest: daysFromTestNow(1),
                    });
                }

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("7d");

                expect(result.success).toBe(true);
                if (!result.success) return;

                const alerts = result.data.locations.nearCapacityAlerts.filter(
                    a => a.locationName === "Near Capacity",
                );
                expect(alerts.length).toBeGreaterThanOrEqual(1);
                expect(alerts[0]?.usagePercent).toBe(80);
            });
        });

        describe("SMS Stats", () => {
            it("should count SMS by status", async () => {
                const household = await createTestHousehold();
                const location = await createTestPickupLocation();
                const parcel = await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-1),
                });

                // 2 sent, 1 failed, 1 queued
                await createTestSentSms({ household_id: household.id, parcel_id: parcel.id });
                await createTestSentSms({ household_id: household.id, parcel_id: parcel.id });
                await createTestFailedSms({ household_id: household.id, parcel_id: parcel.id });
                await createTestQueuedSms({ household_id: household.id, parcel_id: parcel.id });

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("7d");

                expect(result.success).toBe(true);
                if (!result.success) return;

                expect(result.data.sms.totalSent).toBe(2);
                expect(result.data.sms.failedInternal).toBe(1);
                expect(result.data.sms.pending).toBe(1);
            });

            it("should group SMS by intent", async () => {
                const household = await createTestHousehold();
                const location = await createTestPickupLocation();
                const parcel = await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-1),
                });

                await createTestSentSms({
                    household_id: household.id,
                    parcel_id: parcel.id,
                    intent: "pickup_reminder",
                });
                await createTestSentSms({
                    household_id: household.id,
                    parcel_id: parcel.id,
                    intent: "pickup_reminder",
                });
                await createTestSentSms({
                    household_id: household.id,
                    parcel_id: parcel.id,
                    intent: "pickup_updated",
                });

                const { getAllStatistics } = await getActions();
                const result = await getAllStatistics("7d");

                expect(result.success).toBe(true);
                if (!result.success) return;

                const reminderIntent = result.data.sms.byIntent.find(
                    i => i.intent === "pickup_reminder",
                );
                const updatedIntent = result.data.sms.byIntent.find(
                    i => i.intent === "pickup_updated",
                );

                expect(reminderIntent?.count).toBe(2);
                expect(updatedIntent?.count).toBe(1);
            });
        });

        describe("Period Filtering", () => {
            it("should filter parcels by 7d period", async () => {
                const household = await createTestHousehold();
                const location = await createTestPickupLocation();

                // Parcel within 7 days (3 days ago)
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-3),
                });

                // Parcel outside 7 days (10 days ago)
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-10),
                });

                const { getAllStatistics } = await getActions();

                // With 7d filter, should only see the recent parcel
                const result7d = await getAllStatistics("7d");
                expect(result7d.success).toBe(true);
                if (!result7d.success) return;
                expect(result7d.data.period).toBe("7d");
                expect(result7d.data.parcels.total).toBe(1);

                // With 30d filter, should see both parcels
                const result30d = await getAllStatistics("30d");
                expect(result30d.success).toBe(true);
                if (!result30d.success) return;
                expect(result30d.data.period).toBe("30d");
                expect(result30d.data.parcels.total).toBe(2);
            });

            it("should count SMS sent within period", async () => {
                // Note: SMS filtering uses sent_at timestamp, not parcel pickup date.
                // The test factory always creates SMS at TEST_NOW, so we test that
                // SMS created "now" are counted in both 7d and 30d periods.
                const household = await createTestHousehold();
                const location = await createTestPickupLocation();
                const parcel = await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-2),
                });

                // Create 2 SMS at TEST_NOW (within any period)
                await createTestSentSms({
                    household_id: household.id,
                    parcel_id: parcel.id,
                });
                await createTestSentSms({
                    household_id: household.id,
                    parcel_id: parcel.id,
                });

                const { getAllStatistics } = await getActions();

                // Both 7d and 30d should count SMS created at TEST_NOW
                const result7d = await getAllStatistics("7d");
                expect(result7d.success).toBe(true);
                if (!result7d.success) return;
                expect(result7d.data.sms.totalSent).toBe(2);

                const result30d = await getAllStatistics("30d");
                expect(result30d.success).toBe(true);
                if (!result30d.success) return;
                expect(result30d.data.sms.totalSent).toBe(2);
            });

            it("should respect 90d and year period filters", async () => {
                const { getAllStatistics } = await getActions();

                const result90d = await getAllStatistics("90d");
                expect(result90d.success).toBe(true);
                if (!result90d.success) return;
                expect(result90d.data.period).toBe("90d");

                const resultYear = await getAllStatistics("year");
                expect(resultYear.success).toBe(true);
                if (!resultYear.success) return;
                expect(resultYear.data.period).toBe("year");
            });

            it("should include all data with 'all' period filter", async () => {
                const household = await createTestHousehold();
                const location = await createTestPickupLocation();

                // Parcel from 100 days ago
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: daysFromTestNow(-100),
                });

                const { getAllStatistics } = await getActions();

                // 90d should not include it
                const result90d = await getAllStatistics("90d");
                expect(result90d.success).toBe(true);
                if (!result90d.success) return;
                expect(result90d.data.parcels.total).toBe(0);

                // 'all' should include it
                const resultAll = await getAllStatistics("all");
                expect(resultAll.success).toBe(true);
                if (!resultAll.success) return;
                expect(resultAll.data.period).toBe("all");
                expect(resultAll.data.parcels.total).toBe(1);
            });
        });
    });
});
