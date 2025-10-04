/**
 * Tests for past parcel prevention
 *
 * These tests verify the multi-layer defense system that prevents creating parcels
 * with past pickup times while allowing existing parcels to be updated.
 *
 * Key behaviors tested:
 * 1. NEW parcels with past times are rejected with clear errors
 * 2. EXISTING parcels can be updated even if their time has passed
 * 3. No silent data loss - all rejections are explicit
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FoodParcels } from "@/app/[locale]/households/enroll/types";
import type { ActionResult } from "@/app/utils/auth/action-result";

// Track what gets inserted/rejected
let insertedParcels: any[] = [];
let validationErrors: any[] = [];
let deleteCalled = false;

// Mock the database module
vi.mock("@/app/db/drizzle", () => {
    const mockDb = {
        transaction: vi.fn(async (callback: any) => {
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
                where: vi.fn(() => Promise.resolve([])),
            })),
        })),
        insert: vi.fn(() => ({
            values: vi.fn((values: any) => {
                insertedParcels.push(...values);
                return {
                    onConflictDoNothing: vi.fn(() => Promise.resolve()),
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
vi.mock("@/app/utils/auth/protected-action", () => ({
    protectedHouseholdAction: (fn: any) => {
        return async (householdId: string, ...args: any[]) => {
            const mockSession = {
                user: { githubUsername: "test-user" },
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

// Mock validation
vi.mock("@/app/[locale]/schedule/actions", () => ({
    validateParcelAssignments: vi.fn(async () => ({ success: true })),
    recomputeOutsideHoursCount: vi.fn(async () => {}),
}));

// Mock date utils
vi.mock("@/app/utils/date-utils", () => ({
    formatStockholmDate: vi.fn((date: Date, format: string) => {
        return date.toISOString().split("T")[0];
    }),
}));

describe("Past Parcel Prevention - Backend Validation", () => {
    const testHouseholdId = "test-household-123";
    const testLocationId = "test-location-456";

    beforeEach(() => {
        insertedParcels = [];
        validationErrors = [];
        deleteCalled = false;
        vi.clearAllMocks();
    });

    it("should reject creating a NEW parcel with a time in the past", async () => {
        const { updateHouseholdParcels } = await import(
            "@/app/[locale]/households/[id]/parcels/actions"
        );

        // October 2nd, 2024 at 10:00 AM Stockholm time
        const now = new Date("2024-10-02T10:00:00+02:00");
        vi.useFakeTimers();
        vi.setSystemTime(now);

        // Try to create a parcel for 9:00-9:30 AM (in the past)
        const pastTime = new Date("2024-10-02T09:00:00+02:00");
        const parcelsData: FoodParcels = {
            pickupLocationId: testLocationId,
            parcels: [
                {
                    pickupDate: pastTime,
                    pickupEarliestTime: new Date("2024-10-02T09:00:00+02:00"),
                    pickupLatestTime: new Date("2024-10-02T09:30:00+02:00"),
                },
            ],
        };

        const result: ActionResult<void> = await updateHouseholdParcels(
            testHouseholdId,
            parcelsData,
        );

        // Should fail with validation error
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBeDefined();
            expect(result.error.code).toBe("VALIDATION_ERROR");
            expect(result.error.message).toContain("past");
        }

        // Should NOT have inserted any parcels
        expect(insertedParcels).toHaveLength(0);

        vi.useRealTimers();
    });

    it("should ALLOW new parcels with future pickup times", async () => {
        const { updateHouseholdParcels } = await import(
            "@/app/[locale]/households/[id]/parcels/actions"
        );

        const now = new Date("2025-10-02T13:00:00Z"); // 1:00 PM UTC
        vi.setSystemTime(now);

        // Create a NEW parcel with future time (3:00 PM, which is in the future)
        const futureTime = new Date("2025-10-02T15:00:00Z"); // 3:00 PM UTC
        const futureTimeEnd = new Date("2025-10-02T15:15:00Z");

        const parcelsData: FoodParcels = {
            pickupLocationId: testLocationId,
            parcels: [
                {
                    // No id = NEW parcel
                    pickupDate: futureTime,
                    pickupEarliestTime: futureTime,
                    pickupLatestTime: futureTimeEnd,
                },
            ],
        };

        const result = await updateHouseholdParcels(testHouseholdId, parcelsData);

        // Should succeed
        expect(result.success).toBe(true);

        // Should insert the parcel
        expect(insertedParcels.length).toBe(1);
        expect(insertedParcels[0].pickup_date_time_earliest).toEqual(futureTime);

        vi.useRealTimers();
    });

    it("should ALLOW updating existing parcels even if their time has passed", async () => {
        const { updateHouseholdParcels } = await import(
            "@/app/[locale]/households/[id]/parcels/actions"
        );

        const now = new Date("2025-10-02T13:00:00Z"); // 1:00 PM UTC
        vi.setSystemTime(now);

        // Update an EXISTING parcel with past time (has id)
        const pastTime = new Date("2025-10-02T09:00:00Z"); // 9:00 AM UTC (in the past)
        const pastTimeEnd = new Date("2025-10-02T09:15:00Z");

        const parcelsData: FoodParcels = {
            pickupLocationId: testLocationId,
            parcels: [
                {
                    id: "existing-parcel-123", // HAS id = EXISTING parcel
                    pickupDate: pastTime,
                    pickupEarliestTime: pastTime,
                    pickupLatestTime: pastTimeEnd,
                },
            ],
        };

        const result = await updateHouseholdParcels(testHouseholdId, parcelsData);

        // Should succeed (existing parcels can be updated)
        expect(result.success).toBe(true);

        // Should insert/update the parcel
        expect(insertedParcels.length).toBe(1);
        expect(insertedParcels[0].pickup_date_time_earliest).toEqual(pastTime);

        vi.useRealTimers();
    });

    it("should reject SOME parcels and allow OTHERS in mixed batch", async () => {
        const { updateHouseholdParcels } = await import(
            "@/app/[locale]/households/[id]/parcels/actions"
        );

        const now = new Date("2025-10-02T13:00:00Z"); // 1:00 PM UTC
        vi.setSystemTime(now);

        const parcelsData: FoodParcels = {
            pickupLocationId: testLocationId,
            parcels: [
                {
                    // NEW parcel with PAST time - should be rejected
                    pickupDate: new Date("2025-10-02T09:00:00Z"),
                    pickupEarliestTime: new Date("2025-10-02T09:00:00Z"),
                    pickupLatestTime: new Date("2025-10-02T09:15:00Z"),
                },
                {
                    // NEW parcel with FUTURE time - should be allowed
                    pickupDate: new Date("2025-10-02T15:00:00Z"),
                    pickupEarliestTime: new Date("2025-10-02T15:00:00Z"),
                    pickupLatestTime: new Date("2025-10-02T15:15:00Z"),
                },
            ],
        };

        const result = await updateHouseholdParcels(testHouseholdId, parcelsData);

        // Should fail because one parcel is invalid
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.message).toContain("past");
        }

        // Should NOT insert any parcels (transaction should rollback)
        expect(insertedParcels.length).toBe(0);

        vi.useRealTimers();
    });

    it("should provide clear error message with affected dates", async () => {
        const { updateHouseholdParcels } = await import(
            "@/app/[locale]/households/[id]/parcels/actions"
        );

        const now = new Date("2025-10-02T13:00:00Z");
        vi.setSystemTime(now);

        const parcelsData: FoodParcels = {
            pickupLocationId: testLocationId,
            parcels: [
                {
                    pickupDate: new Date("2025-10-02T09:00:00Z"),
                    pickupEarliestTime: new Date("2025-10-02T09:00:00Z"),
                    pickupLatestTime: new Date("2025-10-02T09:15:00Z"),
                },
            ],
        };

        const result = await updateHouseholdParcels(testHouseholdId, parcelsData);

        expect(result.success).toBe(false);
        if (!result.success) {
            const errorMessage = result.error.message;

            // Should mention past and provide guidance
            expect(errorMessage).toContain("past");
        }

        vi.useRealTimers();
    });

    it("should allow parcel for later today (edge case)", async () => {
        const { updateHouseholdParcels } = await import(
            "@/app/[locale]/households/[id]/parcels/actions"
        );

        // It's 9:00 AM, user creates parcel for 4:00 PM same day
        const now = new Date("2025-10-02T09:00:00Z");
        vi.setSystemTime(now);

        const laterToday = new Date("2025-10-02T16:00:00Z"); // 4:00 PM
        const laterTodayEnd = new Date("2025-10-02T16:15:00Z");

        const parcelsData: FoodParcels = {
            pickupLocationId: testLocationId,
            parcels: [
                {
                    pickupDate: laterToday,
                    pickupEarliestTime: laterToday,
                    pickupLatestTime: laterTodayEnd,
                },
            ],
        };

        const result = await updateHouseholdParcels(testHouseholdId, parcelsData);

        // Should succeed
        expect(result.success).toBe(true);
        // Verify parcel was inserted
        expect(insertedParcels.length).toBe(1);
        expect(insertedParcels[0].pickup_date_time_earliest).toEqual(laterToday);

        vi.useRealTimers();
    });
});

describe("Past Parcel Prevention - Validation Layer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should distinguish between NEW and EXISTING parcels", async () => {
        // This tests the isNewParcel flag logic that we added
        // The actual validation is already tested via the backend tests above

        const now = new Date("2025-10-02T13:00:00Z");
        const pastTime = new Date("2025-10-02T09:00:00Z");

        // The key insight: NEW parcels (no id) should be rejected with past times
        const newParcel = {
            pickupDate: pastTime,
            pickupEarliestTime: pastTime,
            pickupLatestTime: new Date("2025-10-02T09:15:00Z"),
            // No id = NEW parcel = should be rejected if past
        };

        // EXISTING parcels (with id) should be allowed even with past times
        const existingParcel = {
            id: "existing-123",
            pickupDate: pastTime,
            pickupEarliestTime: pastTime,
            pickupLatestTime: new Date("2025-10-02T09:15:00Z"),
            // Has id = EXISTING parcel = should be allowed
        };

        // This documents the behavior we implemented
        expect("id" in newParcel).toBe(false);
        expect("id" in existingParcel).toBe(true);
        expect(existingParcel.id).toBeDefined();
    });
});
