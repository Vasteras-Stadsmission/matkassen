/**
 * Tests for household parcel location changes.
 *
 * These tests verify that changing a parcel's location while keeping the same time window
 * works correctly. This was a bug where the upsert would skip the insert (due to time conflict)
 * and the deletion logic wouldn't remove the old location parcel (only checked times, not location).
 *
 * The fix: Include pickup_location_id in the unique constraint and deletion key.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FoodParcels } from "@/app/[locale]/households/enroll/types";

// Track database operations for verification
let insertedParcels: any[] = [];
let insertedAuditEvents: any[] = [];
let deletedParcelIds: string[] = [];
let existingParcels: any[] = [];
let updatedParcels: any[] = [];

// Mock the database module with location-aware logic
vi.mock("@/app/db/drizzle", () => {
    const queryResult = (value: any[]) =>
        Object.assign(Promise.resolve(value), {
            limit: vi.fn(() => Promise.resolve(value.slice(0, 1))),
        });

    const mockDb = {
        transaction: vi.fn(async (callback: any) => {
            // Execute the transaction callback with a mock transaction object
            return await callback(mockDb);
        }),
        delete: vi.fn(() => ({
            where: vi.fn((condition: any) => {
                // Mock delete - we'll track the IDs in the test
                return Promise.resolve();
            }),
        })),
        update: vi.fn(() => ({
            set: vi.fn((values: any) => ({
                where: vi.fn((condition: any) => {
                    // Mock soft delete via update - track the operation
                    // In real implementation, this would set deleted_at and deleted_by_user_id
                    updatedParcels.push(values);
                    return Promise.resolve();
                }),
            })),
        })),
        select: vi.fn(() => ({
            from: vi.fn((table: any) => ({
                where: vi.fn(() => {
                    const tableName = table?.[Symbol.for("drizzle:Name")];

                    if (tableName === "pickup_locations") {
                        return queryResult([
                            {
                                id: "test-location",
                                maxParcelsPerDay: 15,
                                maxParcelsPerSlot: 15,
                            },
                            {
                                id: "location-a-456",
                                maxParcelsPerDay: 15,
                                maxParcelsPerSlot: 15,
                            },
                            {
                                id: "location-b-789",
                                maxParcelsPerDay: 15,
                                maxParcelsPerSlot: 15,
                            },
                        ]);
                    }

                    if (tableName === "pickup_location_schedules") {
                        return queryResult([
                            {
                                id: "test-schedule",
                                name: "Test Schedule",
                                startDate: "2020-01-01",
                                endDate: "2030-01-01",
                            },
                        ]);
                    }

                    if (tableName === "pickup_location_schedule_days") {
                        return queryResult(
                            [
                                "monday",
                                "tuesday",
                                "wednesday",
                                "thursday",
                                "friday",
                                "saturday",
                                "sunday",
                            ].map(weekday => ({
                                weekday,
                                isOpen: true,
                                openingTime: "00:00",
                                closingTime: "23:59",
                            })),
                        );
                    }

                    // Return existing parcels (will be set by each test)
                    return queryResult(existingParcels);
                }),
            })),
        })),
        insert: vi.fn((table: any) => ({
            values: vi.fn((values: any) => {
                const tableName = table?.[Symbol.for("drizzle:Name")];
                if (tableName === "audit_log") {
                    insertedAuditEvents.push(values);
                    return Promise.resolve();
                }

                // Store the inserted parcels for verification
                insertedParcels.push(...values);
                // Return an object with onConflictDoNothing method
                return {
                    onConflictDoNothing: vi.fn(() => ({
                        returning: vi.fn(() => Promise.resolve([])),
                    })),
                };
            }),
        })),
        execute: vi.fn(async () => {
            // Mock execute for any raw SQL queries
            return Promise.resolve();
        }),
    };

    return {
        db: mockDb,
    };
});

// Mock the auth module
const mockAdminHouseholdAction = (fn: any) => {
    return async (householdId: string, ...args: any[]) => {
        const mockSession = {
            user: {
                githubUsername: "test-user",
                role: "admin",
                name: "Test User",
                email: "test@example.com",
            },
        };
        const mockHousehold = {
            id: householdId,
            first_name: "Test",
            last_name: "Household",
        };
        return fn(mockSession, mockHousehold, ...args);
    };
};

vi.mock("@/app/utils/auth/protected-action", () => ({
    protectedHouseholdAction: mockAdminHouseholdAction,
    protectedAdminHouseholdAction: mockAdminHouseholdAction,
    protectedAgreementHouseholdAction: mockAdminHouseholdAction,
}));

// Mock the schedule actions validation
vi.mock("@/app/[locale]/schedule/actions", () => ({
    validateParcelAssignments: vi.fn(async () => ({ success: true })),
    recomputeOutsideHoursCount: vi.fn(async () => {}),
}));

// Mock the parcel state-transitions module (createParcels + lenient soft delete)
vi.mock("@/app/utils/parcels/state-transitions", () => ({
    createParcels: vi.fn(async (_tx, args) => {
        // Mock insert — just track that it was called via the helper
        insertedParcels.push(...args.parcels);
        return args.parcels.map((_parcel: unknown, index: number) => `created-${index}`);
    }),
    softDeleteParcelLenient: vi.fn(async () => {
        // Mock SMS-aware lenient soft delete — just track that it was called
        return { skipped: false, smsCancelled: false, smsSent: false };
    }),
}));

describe("updateHouseholdParcels - Location Changes", () => {
    const testHouseholdId = "test-household-123";
    const locationA = "location-a-456";
    const locationB = "location-b-789";

    beforeEach(() => {
        // Reset tracking arrays
        insertedParcels = [];
        insertedAuditEvents = [];
        deletedParcelIds = [];
        existingParcels = [];
        updatedParcels = [];
        vi.clearAllMocks();
    });

    it("should handle location change with same time window", async () => {
        // Import after mocks are set up
        const { updateHouseholdParcels } =
            await import("@/app/[locale]/households/[id]/parcels/actions");

        const now = new Date();
        now.setHours(14, 0, 0, 0); // 2:00 PM today

        vi.useFakeTimers();
        vi.setSystemTime(now);

        try {
            // Create a future parcel time window
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(10, 0, 0, 0);

            const pickupStart = new Date(tomorrow);
            const pickupEnd = new Date(tomorrow);
            pickupEnd.setHours(11, 0, 0, 0);

            // Existing parcel is at location A
            existingParcels = [
                {
                    id: "existing-parcel-123",
                    locationId: locationA,
                    earliest: pickupStart,
                    latest: pickupEnd,
                },
            ];

            // User updates to location B with same times
            const parcelsData: FoodParcels = {
                pickupLocationId: locationB, // Changed from A to B
                parcels: [
                    {
                        id: "existing-parcel-123",
                        pickupDate: tomorrow,
                        pickupEarliestTime: pickupStart,
                        pickupLatestTime: pickupEnd,
                    },
                ],
            };

            // Call the action
            const result = await updateHouseholdParcels(testHouseholdId, parcelsData);

            // Verify the result was successful
            expect(result.success).toBe(true);

            // Existing future parcels keep their ID when moved, so sent reminders
            // can produce pickup_updated SMS instead of cancellation semantics.
            expect(insertedParcels).toHaveLength(0);
            const finalUpdates = updatedParcels.filter(
                update => update.pickup_date_time_earliest.getUTCFullYear() !== 2100,
            );
            expect(finalUpdates).toHaveLength(1);
            expect(finalUpdates[0].pickup_location_id).toBe(locationB);
            expect(finalUpdates[0].pickup_date_time_earliest).toEqual(pickupStart);
            expect(finalUpdates[0].pickup_date_time_latest).toEqual(pickupEnd);

            const scheduleActions = await import("@/app/[locale]/schedule/actions");
            const recomputeOutsideHoursCountMock = vi.mocked(
                scheduleActions.recomputeOutsideHoursCount,
            );
            expect(recomputeOutsideHoursCountMock).toHaveBeenCalledWith(locationA);
            expect(recomputeOutsideHoursCountMock).toHaveBeenCalledWith(locationB);
        } finally {
            vi.useRealTimers();
        }
    });

    it("should not delete parcels when location changes but times remain", async () => {
        // Import after mocks are set up
        const { updateHouseholdParcels } =
            await import("@/app/[locale]/households/[id]/parcels/actions");

        const now = new Date();
        now.setHours(14, 0, 0, 0);

        vi.useFakeTimers();
        vi.setSystemTime(now);

        try {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(10, 0, 0, 0);

            const pickupStart = new Date(tomorrow);
            const pickupEnd = new Date(tomorrow);
            pickupEnd.setHours(11, 0, 0, 0);

            // Existing parcel is at location A - should NOT be deleted
            // because we're submitting the same location and times
            existingParcels = [
                {
                    id: "existing-parcel-123",
                    locationId: locationA,
                    earliest: pickupStart,
                    latest: pickupEnd,
                },
            ];

            // Submit same location and times (idempotent operation)
            const parcelsData: FoodParcels = {
                pickupLocationId: locationA, // Same location
                parcels: [
                    {
                        id: "existing-parcel-123",
                        pickupDate: tomorrow,
                        pickupEarliestTime: pickupStart,
                        pickupLatestTime: pickupEnd,
                    },
                ],
            };

            const result = await updateHouseholdParcels(testHouseholdId, parcelsData);

            expect(result.success).toBe(true);

            // Unchanged future parcels are already in the desired state, so the
            // diff-based action should neither reinsert nor delete them.
            expect(insertedParcels).toHaveLength(0);
            expect(updatedParcels).toHaveLength(0);

            // The existing parcel should NOT be marked for deletion
            // because it matches the desired state (same location + times)
        } finally {
            vi.useRealTimers();
        }
    });

    it("should handle multiple parcels with location changes", async () => {
        const { updateHouseholdParcels } =
            await import("@/app/[locale]/households/[id]/parcels/actions");

        const now = new Date();
        now.setHours(14, 0, 0, 0);

        vi.useFakeTimers();
        vi.setSystemTime(now);

        try {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const slot1Start = new Date(tomorrow);
            slot1Start.setHours(10, 0, 0, 0);
            const slot1End = new Date(tomorrow);
            slot1End.setHours(11, 0, 0, 0);

            const dayAfterTomorrow = new Date(now);
            dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

            const slot2Start = new Date(dayAfterTomorrow);
            slot2Start.setHours(14, 0, 0, 0);
            const slot2End = new Date(dayAfterTomorrow);
            slot2End.setHours(15, 0, 0, 0);

            // Existing: Both parcels at location A
            existingParcels = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: slot1Start,
                    latest: slot1End,
                },
                {
                    id: "parcel-2",
                    locationId: locationA,
                    earliest: slot2Start,
                    latest: slot2End,
                },
            ];

            // Update: Move both to location B
            const parcelsData: FoodParcels = {
                pickupLocationId: locationB,
                parcels: [
                    {
                        id: "parcel-1",
                        pickupDate: tomorrow,
                        pickupEarliestTime: slot1Start,
                        pickupLatestTime: slot1End,
                    },
                    {
                        id: "parcel-2",
                        pickupDate: tomorrow,
                        pickupEarliestTime: slot2Start,
                        pickupLatestTime: slot2End,
                    },
                ],
            };

            const result = await updateHouseholdParcels(testHouseholdId, parcelsData);

            expect(result.success).toBe(true);

            // Should update both existing parcels in place.
            expect(insertedParcels).toHaveLength(0);
            const finalUpdates = updatedParcels.filter(
                update => update.pickup_date_time_earliest.getUTCFullYear() !== 2100,
            );
            expect(finalUpdates).toHaveLength(2);
            expect(finalUpdates[0].pickup_location_id).toBe(locationB);
            expect(finalUpdates[1].pickup_location_id).toBe(locationB);
        } finally {
            vi.useRealTimers();
        }
    });

    it("should handle partial location changes (one changed, one stays)", async () => {
        const { updateHouseholdParcels } =
            await import("@/app/[locale]/households/[id]/parcels/actions");

        const now = new Date();
        now.setHours(14, 0, 0, 0);

        vi.useFakeTimers();
        vi.setSystemTime(now);

        try {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const slot1Start = new Date(tomorrow);
            slot1Start.setHours(10, 0, 0, 0);
            const slot1End = new Date(tomorrow);
            slot1End.setHours(11, 0, 0, 0);

            const dayAfterTomorrow = new Date(now);
            dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

            const slot2Start = new Date(dayAfterTomorrow);
            slot2Start.setHours(14, 0, 0, 0);
            const slot2End = new Date(dayAfterTomorrow);
            slot2End.setHours(15, 0, 0, 0);

            // Existing: First parcel at location A, second at location B
            existingParcels = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: slot1Start,
                    latest: slot1End,
                },
                {
                    id: "parcel-2",
                    locationId: locationB,
                    earliest: slot2Start,
                    latest: slot2End,
                },
            ];

            // Update: Keep first at A, but with a note this tests that
            // we're correctly building keys with location included
            const parcelsData: FoodParcels = {
                pickupLocationId: locationA,
                parcels: [
                    {
                        id: "parcel-1",
                        pickupDate: tomorrow,
                        pickupEarliestTime: slot1Start,
                        pickupLatestTime: slot1End,
                    },
                    {
                        id: "parcel-2",
                        pickupDate: dayAfterTomorrow,
                        pickupEarliestTime: slot2Start,
                        pickupLatestTime: slot2End,
                    },
                ],
            };

            const result = await updateHouseholdParcels(testHouseholdId, parcelsData);

            expect(result.success).toBe(true);

            // The unchanged location A parcel is already in the desired state.
            // Only the location B -> A change should be updated in place.
            expect(insertedParcels).toHaveLength(0);
            const finalUpdates = updatedParcels.filter(
                update => update.pickup_date_time_earliest.getUTCFullYear() !== 2100,
            );
            expect(finalUpdates).toHaveLength(1);
            expect(finalUpdates[0].pickup_location_id).toBe(locationA);
        } finally {
            vi.useRealTimers();
        }
    });
});
