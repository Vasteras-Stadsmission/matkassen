/**
 * Tests for capacity checking with soft-deleted parcels
 *
 * REGRESSION TESTS for:
 * - Soft-deleted parcels should NOT count toward location capacity
 * - After cancellation, the same slot should be available for rebooking
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SQL } from "drizzle-orm";

// Track all database queries for verification
let mockLocationData: any = null;
let mockParcelData: any[] = [];
let whereConditionsCaptured: any[] = [];

// Mock the database module
vi.mock("@/app/db/drizzle", () => {
    const mockDb = {
        select: vi.fn((fields?: any) => {
            return {
                from: vi.fn((table: any) => {
                    // Check if this is a pickupLocations query (has name field)
                    const isLocationQuery = table === "mockPickupLocationsTable";

                    if (isLocationQuery) {
                        return {
                            where: vi.fn(() => ({
                                limit: vi.fn(() => {
                                    if (mockLocationData) {
                                        return Promise.resolve([mockLocationData]);
                                    }
                                    return Promise.resolve([]);
                                }),
                            })),
                        };
                    }

                    // This is a foodParcels query
                    return {
                        where: vi.fn((conditions: any) => {
                            // Capture the where conditions for verification
                            whereConditionsCaptured.push(conditions);

                            // For range queries (has limit of fields)
                            if (fields && Object.keys(fields).length === 1) {
                                return Promise.resolve(mockParcelData);
                            }

                            // For count queries (all fields)
                            return Promise.resolve(mockParcelData);
                        }),
                    };
                }),
            };
        }),
    };

    return {
        db: mockDb,
    };
});

// Mock the schema
vi.mock("@/app/db/schema", () => ({
    pickupLocations: "mockPickupLocationsTable",
    foodParcels: {
        id: "id",
        pickup_location_id: "pickup_location_id",
        pickup_date_time_earliest: "pickup_date_time_earliest",
        pickup_date_time_latest: "pickup_date_time_latest",
        household_id: "household_id",
        deleted_at: "deleted_at",
    },
}));

// Mock query helpers - we'll verify notDeleted() is called
const notDeletedMock = vi.fn(() => "NOT_DELETED_CONDITION");
vi.mock("@/app/db/query-helpers", () => ({
    notDeleted: notDeletedMock,
}));

// Mock date utilities
vi.mock("@/app/utils/date-utils", () => ({
    getDateParts: vi.fn((date: Date) => ({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
    })),
    setToStartOfDay: vi.fn((date: Date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d;
    }),
    setToEndOfDay: vi.fn((date: Date) => {
        const d = new Date(date);
        d.setHours(23, 59, 59, 999);
        return d;
    }),
    formatDateToISOString: vi.fn((date: Date) => date.toISOString().split("T")[0]),
}));

describe("Capacity checking with soft-deleted parcels", () => {
    beforeEach(() => {
        mockLocationData = null;
        mockParcelData = [];
        whereConditionsCaptured = [];
        notDeletedMock.mockClear();
        vi.clearAllMocks();
    });

    describe("checkPickupLocationCapacity", () => {
        it("should include notDeleted() filter in the query", async () => {
            // Setup: Location with max 5 parcels
            mockLocationData = {
                id: "location-1",
                name: "Test Location",
                parcels_max_per_day: 5,
            };

            // Mock 2 active parcels
            mockParcelData = [
                {
                    id: "parcel-1",
                    pickup_location_id: "location-1",
                    pickup_date_time_earliest: new Date("2025-10-15T10:00:00Z"),
                    deleted_at: null,
                },
                {
                    id: "parcel-2",
                    pickup_location_id: "location-1",
                    pickup_date_time_earliest: new Date("2025-10-15T11:00:00Z"),
                    deleted_at: null,
                },
            ];

            const { checkPickupLocationCapacity } = await import(
                "@/app/[locale]/households/enroll/actions"
            );

            const result = await checkPickupLocationCapacity("location-1", new Date("2025-10-15"));

            // Verify notDeleted() was called
            expect(notDeletedMock).toHaveBeenCalled();

            // Verify result
            expect(result.isAvailable).toBe(true);
            expect(result.currentCount).toBe(2);
            expect(result.maxCount).toBe(5);
        });

        it("should not count soft-deleted parcels in capacity", async () => {
            mockLocationData = {
                id: "location-1",
                name: "Test Location",
                parcels_max_per_day: 3,
            };

            // Setup: 3 total parcels in DB, but 1 is soft-deleted
            // The query should filter it out, so we only mock 2 results
            mockParcelData = [
                {
                    id: "parcel-1",
                    pickup_location_id: "location-1",
                    pickup_date_time_earliest: new Date("2025-10-15T10:00:00Z"),
                    deleted_at: null,
                },
                {
                    id: "parcel-2",
                    pickup_location_id: "location-1",
                    pickup_date_time_earliest: new Date("2025-10-15T11:00:00Z"),
                    deleted_at: null,
                },
                // parcel-3 is soft-deleted, filtered out by notDeleted()
            ];

            const { checkPickupLocationCapacity } = await import(
                "@/app/[locale]/households/enroll/actions"
            );

            const result = await checkPickupLocationCapacity("location-1", new Date("2025-10-15"));

            expect(result.isAvailable).toBe(true); // 2/3 slots used
            expect(result.currentCount).toBe(2); // Only counting non-deleted
            expect(result.maxCount).toBe(3);
            expect(notDeletedMock).toHaveBeenCalled();
        });

        it("should show slot available after parcel is soft-deleted (regression test)", async () => {
            mockLocationData = {
                id: "location-1",
                name: "Test Location",
                parcels_max_per_day: 2,
            };

            // Initially 2 parcels (full)
            mockParcelData = [
                { id: "parcel-1", deleted_at: null },
                { id: "parcel-2", deleted_at: null },
            ];

            const { checkPickupLocationCapacity } = await import(
                "@/app/[locale]/households/enroll/actions"
            );

            let result = await checkPickupLocationCapacity("location-1", new Date("2025-10-15"));

            expect(result.isAvailable).toBe(false); // Full
            expect(result.currentCount).toBe(2);

            // Simulate soft-delete of one parcel
            mockParcelData = [
                { id: "parcel-1", deleted_at: null },
                // parcel-2 deleted, filtered out
            ];

            result = await checkPickupLocationCapacity("location-1", new Date("2025-10-15"));

            expect(result.isAvailable).toBe(true); // Now available!
            expect(result.currentCount).toBe(1);
            expect(result.message).toContain("1 av 2");
        });

        it("should exclude specified household when checking capacity", async () => {
            mockLocationData = {
                id: "location-1",
                name: "Test Location",
                parcels_max_per_day: 2,
            };

            // 2 parcels, one from household-exclude
            mockParcelData = [{ id: "parcel-1", household_id: "household-keep" }];

            const { checkPickupLocationCapacity } = await import(
                "@/app/[locale]/households/enroll/actions"
            );

            const result = await checkPickupLocationCapacity(
                "location-1",
                new Date("2025-10-15"),
                "household-exclude", // Exclude this household
            );

            expect(result.isAvailable).toBe(true);
            expect(result.currentCount).toBe(1); // Only counting household-keep
            expect(notDeletedMock).toHaveBeenCalled();
        });
    });

    describe("getPickupLocationCapacityForRange", () => {
        it("should include notDeleted() filter in range query", async () => {
            mockLocationData = {
                id: "location-1",
                name: "Test Location",
                parcels_max_per_day: 5,
            };

            mockParcelData = [
                {
                    pickupDateEarliest: new Date("2025-10-15T10:00:00Z"),
                },
                {
                    pickupDateEarliest: new Date("2025-10-16T10:00:00Z"),
                },
            ];

            const { getPickupLocationCapacityForRange } = await import(
                "@/app/[locale]/households/enroll/actions"
            );

            await getPickupLocationCapacityForRange(
                "location-1",
                new Date("2025-10-15"),
                new Date("2025-10-20"),
            );

            // Verify notDeleted() was called
            expect(notDeletedMock).toHaveBeenCalled();
        });

        it("should not count soft-deleted parcels in date range", async () => {
            mockLocationData = {
                id: "location-1",
                name: "Test Location",
                parcels_max_per_day: 3,
            };

            // Simulate query result with soft-deleted filtered out
            mockParcelData = [
                {
                    pickupDateEarliest: new Date("2025-10-15T10:00:00Z"),
                },
                {
                    pickupDateEarliest: new Date("2025-10-15T11:00:00Z"),
                },
                {
                    pickupDateEarliest: new Date("2025-10-16T10:00:00Z"),
                },
                // 2 soft-deleted parcels filtered out by notDeleted()
            ];

            const { getPickupLocationCapacityForRange } = await import(
                "@/app/[locale]/households/enroll/actions"
            );

            const result = await getPickupLocationCapacityForRange(
                "location-1",
                new Date("2025-10-15"),
                new Date("2025-10-20"),
            );

            expect(result.hasLimit).toBe(true);
            expect(result.maxPerDay).toBe(3);

            // Check date capacities
            const dateKeys = Object.keys(result.dateCapacities);
            expect(dateKeys.length).toBe(2); // Only 2 dates

            // Verify counts are correct (not including deleted)
            const dateCapacities = result.dateCapacities as Record<string, number>;
            const oct15Count = dateCapacities["2025-10-15"];
            const oct16Count = dateCapacities["2025-10-16"];

            expect(oct15Count).toBe(2); // 2 parcels on Oct 15
            expect(oct16Count).toBe(1); // 1 parcel on Oct 16

            expect(notDeletedMock).toHaveBeenCalled();
        });

        it("should allow accurate rebooking after cancellation across multiple dates", async () => {
            mockLocationData = {
                id: "location-1",
                name: "Test Location",
                parcels_max_per_day: 2,
            };

            // Initial state: Oct 15 full (2/2), Oct 16 has 1/2
            mockParcelData = [
                { pickupDateEarliest: new Date("2025-10-15T10:00:00Z") },
                { pickupDateEarliest: new Date("2025-10-15T11:00:00Z") },
                { pickupDateEarliest: new Date("2025-10-16T10:00:00Z") },
            ];

            const { getPickupLocationCapacityForRange } = await import(
                "@/app/[locale]/households/enroll/actions"
            );

            let result = await getPickupLocationCapacityForRange(
                "location-1",
                new Date("2025-10-15"),
                new Date("2025-10-20"),
            );

            const dateCapacities1 = result.dateCapacities as Record<string, number>;
            expect(dateCapacities1["2025-10-15"]).toBe(2); // Full
            expect(dateCapacities1["2025-10-16"]).toBe(1);

            // After soft-delete on Oct 15
            mockParcelData = [
                { pickupDateEarliest: new Date("2025-10-15T10:00:00Z") },
                // One Oct 15 parcel deleted
                { pickupDateEarliest: new Date("2025-10-16T10:00:00Z") },
            ];

            result = await getPickupLocationCapacityForRange(
                "location-1",
                new Date("2025-10-15"),
                new Date("2025-10-20"),
            );

            const dateCapacities2 = result.dateCapacities as Record<string, number>;
            expect(dateCapacities2["2025-10-15"]).toBe(1); // Now has space!
            expect(dateCapacities2["2025-10-16"]).toBe(1);

            expect(notDeletedMock).toHaveBeenCalled();
        });
    });

    describe("Integration: Both filters working together", () => {
        it("should consistently filter soft-deleted parcels across both capacity functions", async () => {
            mockLocationData = {
                id: "location-1",
                name: "Test Location",
                parcels_max_per_day: 3,
            };

            // 2 active parcels on same date
            mockParcelData = [
                { id: "p1", pickupDateEarliest: new Date("2025-10-15T10:00:00Z") },
                { id: "p2", pickupDateEarliest: new Date("2025-10-15T11:00:00Z") },
            ];

            const { checkPickupLocationCapacity, getPickupLocationCapacityForRange } = await import(
                "@/app/[locale]/households/enroll/actions"
            );

            // Check single date
            const singleResult = await checkPickupLocationCapacity(
                "location-1",
                new Date("2025-10-15"),
            );

            // Check date range
            const rangeResult = await getPickupLocationCapacityForRange(
                "location-1",
                new Date("2025-10-15"),
                new Date("2025-10-15"),
            );

            // Both should report same count
            expect(singleResult.currentCount).toBe(2);
            const dateCapacities3 = rangeResult.dateCapacities as Record<string, number>;
            expect(dateCapacities3["2025-10-15"]).toBe(2);

            // Both should have called notDeleted()
            expect(notDeletedMock).toHaveBeenCalledTimes(2);
        });
    });
});
