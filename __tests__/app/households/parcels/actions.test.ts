/**
 * Tests for household parcel update actions
 *
 * These tests verify that parcels scheduled for later today are not silently dropped,
 * which was a bug where filtering by midnight pickupDate instead of actual pickup times
 * caused same-day parcels to be excluded.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FoodParcels } from "@/app/[locale]/households/enroll/types";

// Track inserted parcels for verification
let insertedParcels: any[] = [];
let deleteCalled = false;

// Mock the database module
vi.mock("@/app/db/drizzle", () => {
    const mockDb = {
        transaction: vi.fn(async (callback: any) => {
            // Execute the transaction callback with a mock transaction object
            return await callback(mockDb);
        }),
        delete: vi.fn(() => {
            deleteCalled = true;
            return {
                where: vi.fn(() => Promise.resolve()),
            };
        }),
        select: vi.fn(() => ({
            from: vi.fn(() => ({
                where: vi.fn(() => ({
                    limit: vi.fn(() => Promise.resolve([])), // No existing parcels
                })),
            })),
        })),
        insert: vi.fn((table: any) => ({
            values: vi.fn((values: any) => {
                // Store the inserted parcels for verification
                insertedParcels.push(...values);
                return Promise.resolve();
            }),
        })),
    };

    return {
        db: mockDb,
    };
});

// Mock the auth module
vi.mock("@/app/utils/auth/protected-action", () => ({
    protectedHouseholdAction: (fn: any) => {
        // Return a function that calls the original with mock session and household
        return async (householdId: string, ...args: any[]) => {
            const mockSession = {
                user: { id: "test-user-id", email: "test@example.com" },
            };
            const mockHousehold = {
                id: householdId,
                first_name: "Test",
                last_name: "Household",
            };
            return fn(mockSession, mockHousehold, ...args);
        };
    },
}));

// Mock the schedule actions validation
vi.mock("@/app/[locale]/schedule/actions", () => ({
    validateParcelAssignments: vi.fn(async () => ({ success: true })),
    recomputeOutsideHoursCount: vi.fn(async () => {}),
}));

describe("updateHouseholdParcels - Same-day parcel handling", () => {
    const testHouseholdId = "test-household-123";
    const testLocationId = "test-location-456";

    beforeEach(() => {
        // Reset tracking arrays
        insertedParcels = [];
        deleteCalled = false;
        vi.clearAllMocks();
    });

    it("should include parcels scheduled for later today", async () => {
        // Import after mocks are set up
        const { updateHouseholdParcels } = await import(
            "@/app/[locale]/households/[id]/parcels/actions"
        );

        // Scenario: It's 2:00 PM today, user schedules a parcel for 4:00-4:30 PM today
        const now = new Date();
        now.setHours(14, 0, 0, 0); // 2:00 PM

        // Mock the current time
        vi.useFakeTimers();
        vi.setSystemTime(now);

        try {
            // Create parcel for later today (4:00-4:30 PM)
            const todayMidnight = new Date(now);
            todayMidnight.setHours(0, 0, 0, 0);

            const pickupStart = new Date(now);
            pickupStart.setHours(16, 0, 0, 0); // 4:00 PM

            const pickupEnd = new Date(now);
            pickupEnd.setHours(16, 30, 0, 0); // 4:30 PM

            const parcelsData: FoodParcels = {
                pickupLocationId: testLocationId,
                parcels: [
                    {
                        pickupDate: todayMidnight, // Midnight today
                        pickupEarliestTime: pickupStart, // 4:00 PM today
                        pickupLatestTime: pickupEnd, // 4:30 PM today
                    },
                ],
            };

            // Call the action
            const result = await updateHouseholdParcels(testHouseholdId, parcelsData);

            // Verify the result was successful
            expect(result.success).toBe(true);

            // Verify the delete was called (to remove existing future parcels)
            expect(deleteCalled).toBe(true);

            // Verify the parcel was inserted (not filtered out)
            expect(insertedParcels).toHaveLength(1);
            expect(insertedParcels[0].pickup_location_id).toBe(testLocationId);
            expect(insertedParcels[0].pickup_date_time_earliest).toEqual(pickupStart);
            expect(insertedParcels[0].pickup_date_time_latest).toEqual(pickupEnd);
        } finally {
            vi.useRealTimers();
        }
    });

    it("should exclude parcels scheduled for past times today", async () => {
        // Import after mocks are set up
        const { updateHouseholdParcels } = await import(
            "@/app/[locale]/households/[id]/parcels/actions"
        );

        // Scenario: It's 2:00 PM today, user tries to schedule a parcel for 10:00-10:30 AM today (past)
        const now = new Date();
        now.setHours(14, 0, 0, 0); // 2:00 PM

        // Mock the current time
        vi.useFakeTimers();
        vi.setSystemTime(now);

        try {
            // Create parcel for earlier today (10:00-10:30 AM) - should be filtered out
            const todayMidnight = new Date(now);
            todayMidnight.setHours(0, 0, 0, 0);

            const pickupStart = new Date(now);
            pickupStart.setHours(10, 0, 0, 0); // 10:00 AM

            const pickupEnd = new Date(now);
            pickupEnd.setHours(10, 30, 0, 0); // 10:30 AM

            const parcelsData: FoodParcels = {
                pickupLocationId: testLocationId,
                parcels: [
                    {
                        pickupDate: todayMidnight, // Midnight today
                        pickupEarliestTime: pickupStart, // 10:00 AM today (past)
                        pickupLatestTime: pickupEnd, // 10:30 AM today (past)
                    },
                ],
            };

            // Call the action
            const result = await updateHouseholdParcels(testHouseholdId, parcelsData);

            // Verify the result was successful (no error, just no parcels inserted)
            expect(result.success).toBe(true);

            // Verify delete was called (to remove existing future parcels)
            expect(deleteCalled).toBe(true);

            // Verify NO parcel was inserted (because it's in the past)
            expect(insertedParcels).toHaveLength(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it("should include parcels scheduled for future dates", async () => {
        // Import after mocks are set up
        const { updateHouseholdParcels } = await import(
            "@/app/[locale]/households/[id]/parcels/actions"
        );

        // Scenario: User schedules a parcel for tomorrow at 12:00-12:30 PM
        const now = new Date();
        now.setHours(14, 0, 0, 0); // 2:00 PM today

        // Mock the current time
        vi.useFakeTimers();
        vi.setSystemTime(now);

        try {
            // Create parcel for tomorrow
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const tomorrowMidnight = new Date(tomorrow);
            tomorrowMidnight.setHours(0, 0, 0, 0);

            const pickupStart = new Date(tomorrow);
            pickupStart.setHours(12, 0, 0, 0); // 12:00 PM tomorrow

            const pickupEnd = new Date(tomorrow);
            pickupEnd.setHours(12, 30, 0, 0); // 12:30 PM tomorrow

            const parcelsData: FoodParcels = {
                pickupLocationId: testLocationId,
                parcels: [
                    {
                        pickupDate: tomorrowMidnight, // Midnight tomorrow
                        pickupEarliestTime: pickupStart, // 12:00 PM tomorrow
                        pickupLatestTime: pickupEnd, // 12:30 PM tomorrow
                    },
                ],
            };

            // Call the action
            const result = await updateHouseholdParcels(testHouseholdId, parcelsData);

            // Verify the result was successful
            expect(result.success).toBe(true);

            // Verify delete was called
            expect(deleteCalled).toBe(true);

            // Verify the parcel was inserted
            expect(insertedParcels).toHaveLength(1);
            expect(insertedParcels[0].pickup_location_id).toBe(testLocationId);
            expect(insertedParcels[0].pickup_date_time_earliest).toEqual(pickupStart);
            expect(insertedParcels[0].pickup_date_time_latest).toEqual(pickupEnd);
        } finally {
            vi.useRealTimers();
        }
    });

    it("should handle mixed parcels: past, later today, and future", async () => {
        // Import after mocks are set up
        const { updateHouseholdParcels } = await import(
            "@/app/[locale]/households/[id]/parcels/actions"
        );

        // Scenario: User submits multiple parcels with different times
        const now = new Date();
        now.setHours(14, 0, 0, 0); // 2:00 PM today

        // Mock the current time
        vi.useFakeTimers();
        vi.setSystemTime(now);

        try {
            const todayMidnight = new Date(now);
            todayMidnight.setHours(0, 0, 0, 0);

            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowMidnight = new Date(tomorrow);
            tomorrowMidnight.setHours(0, 0, 0, 0);

            // Past parcel: 10:00-10:30 AM today
            const pastStart = new Date(now);
            pastStart.setHours(10, 0, 0, 0);
            const pastEnd = new Date(now);
            pastEnd.setHours(10, 30, 0, 0);

            // Later today parcel: 4:00-4:30 PM today
            const laterTodayStart = new Date(now);
            laterTodayStart.setHours(16, 0, 0, 0);
            const laterTodayEnd = new Date(now);
            laterTodayEnd.setHours(16, 30, 0, 0);

            // Future parcel: 2:00-2:30 PM tomorrow
            const futureStart = new Date(tomorrow);
            futureStart.setHours(14, 0, 0, 0);
            const futureEnd = new Date(tomorrow);
            futureEnd.setHours(14, 30, 0, 0);

            const parcelsData: FoodParcels = {
                pickupLocationId: testLocationId,
                parcels: [
                    {
                        pickupDate: todayMidnight,
                        pickupEarliestTime: pastStart,
                        pickupLatestTime: pastEnd,
                    },
                    {
                        pickupDate: todayMidnight,
                        pickupEarliestTime: laterTodayStart,
                        pickupLatestTime: laterTodayEnd,
                    },
                    {
                        pickupDate: tomorrowMidnight,
                        pickupEarliestTime: futureStart,
                        pickupLatestTime: futureEnd,
                    },
                ],
            };

            // Call the action
            const result = await updateHouseholdParcels(testHouseholdId, parcelsData);

            // Verify the result was successful
            expect(result.success).toBe(true);

            // Verify delete was called
            expect(deleteCalled).toBe(true);

            // Verify only the future parcels were inserted (later today + tomorrow)
            expect(insertedParcels).toHaveLength(2);

            // First parcel should be later today (4:00 PM)
            expect(insertedParcels[0].pickup_date_time_earliest).toEqual(laterTodayStart);
            expect(insertedParcels[0].pickup_date_time_latest).toEqual(laterTodayEnd);

            // Second parcel should be tomorrow (2:00 PM)
            expect(insertedParcels[1].pickup_date_time_earliest).toEqual(futureStart);
            expect(insertedParcels[1].pickup_date_time_latest).toEqual(futureEnd);
        } finally {
            vi.useRealTimers();
        }
    });
});
