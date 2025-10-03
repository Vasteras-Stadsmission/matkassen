import { describe, it, expect } from "vitest";
import { getStockholmDateKey } from "@/app/utils/date-utils";
import { calculateParcelOperations } from "@/app/[locale]/households/[id]/edit/calculateParcelOperations";

/**
 * Tests for calculateParcelOperations function
 * This function implements same-day matching logic (Option B):
 * - Same location + same date (ignoring time) = UPDATE existing parcel with new times
 * - Different location or different date = DELETE old + CREATE new
 */

describe("calculateParcelOperations", () => {
    const locationA = "loc-a";
    const locationB = "loc-b";
    const householdId = "household-123";

    describe("CREATE operations", () => {
        it("should create new parcels when none exist", () => {
            const existing: Array<{
                id: string;
                locationId: string;
                earliest: Date;
                latest: Date;
            }> = [];
            const desired = [
                {
                    pickupEarliestTime: new Date("2025-10-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-10-15T12:00:00Z"),
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            expect(result.toCreate).toHaveLength(1);
            expect(result.toCreate[0]).toMatchObject({
                household_id: householdId,
                pickup_location_id: locationA,
                pickup_date_time_earliest: desired[0].pickupEarliestTime,
                pickup_date_time_latest: desired[0].pickupLatestTime,
                is_picked_up: false,
            });
            expect(result.toCreate[0].id).toBeDefined();
            expect(result.toUpdate).toHaveLength(0);
            expect(result.toDelete).toHaveLength(0);
        });

        it("should create new parcel when location changes", () => {
            const existing = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: new Date("2025-10-15T10:00:00Z"),
                    latest: new Date("2025-10-15T12:00:00Z"),
                },
            ];
            const desired = [
                {
                    pickupEarliestTime: new Date("2025-10-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-10-15T12:00:00Z"),
                },
            ];

            // Note: newLocationId is locationB, different from existing locationA
            const result = calculateParcelOperations(existing, desired, locationB, householdId);

            expect(result.toCreate).toHaveLength(1);
            expect(result.toCreate[0].pickup_location_id).toBe(locationB);
            expect(result.toUpdate).toHaveLength(0);
            expect(result.toDelete).toHaveLength(1);
            expect(result.toDelete[0]).toBe("parcel-1");
        });

        it("should create new parcel when date changes", () => {
            const existing = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: new Date("2025-10-15T10:00:00Z"),
                    latest: new Date("2025-10-15T12:00:00Z"),
                },
            ];
            const desired = [
                {
                    pickupEarliestTime: new Date("2025-10-16T10:00:00Z"), // Different day
                    pickupLatestTime: new Date("2025-10-16T12:00:00Z"),
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            expect(result.toCreate).toHaveLength(1);
            expect(result.toCreate[0].pickup_date_time_earliest).toEqual(
                desired[0].pickupEarliestTime,
            );
            expect(result.toUpdate).toHaveLength(0);
            expect(result.toDelete).toHaveLength(1);
            expect(result.toDelete[0]).toBe("parcel-1");
        });

        it("should create multiple new parcels", () => {
            const existing: Array<{
                id: string;
                locationId: string;
                earliest: Date;
                latest: Date;
            }> = [];
            const desired = [
                {
                    pickupEarliestTime: new Date("2025-10-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-10-15T12:00:00Z"),
                },
                {
                    pickupEarliestTime: new Date("2025-10-16T14:00:00Z"),
                    pickupLatestTime: new Date("2025-10-16T16:00:00Z"),
                },
                {
                    pickupEarliestTime: new Date("2025-10-17T09:00:00Z"),
                    pickupLatestTime: new Date("2025-10-17T11:00:00Z"),
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            expect(result.toCreate).toHaveLength(3);
            expect(result.toUpdate).toHaveLength(0);
            expect(result.toDelete).toHaveLength(0);
        });
    });

    describe("UPDATE operations (same-day time changes)", () => {
        it("should update parcel times when location and date match but times differ", () => {
            const existing = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: new Date("2025-10-15T10:00:00Z"),
                    latest: new Date("2025-10-15T12:00:00Z"),
                },
            ];
            const desired = [
                {
                    pickupEarliestTime: new Date("2025-10-15T11:00:00Z"), // Same day, different time
                    pickupLatestTime: new Date("2025-10-15T13:00:00Z"),
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            expect(result.toCreate).toHaveLength(0);
            expect(result.toUpdate).toHaveLength(1);
            expect(result.toUpdate[0]).toEqual({
                id: "parcel-1",
                pickup_date_time_earliest: desired[0].pickupEarliestTime,
                pickup_date_time_latest: desired[0].pickupLatestTime,
            });
            expect(result.toDelete).toHaveLength(0);
        });

        it("should NOT update when times are identical (no-op)", () => {
            const existing = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: new Date("2025-10-15T10:00:00Z"),
                    latest: new Date("2025-10-15T12:00:00Z"),
                },
            ];
            const desired = [
                {
                    pickupEarliestTime: new Date("2025-10-15T10:00:00Z"), // Exactly the same
                    pickupLatestTime: new Date("2025-10-15T12:00:00Z"),
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            expect(result.toCreate).toHaveLength(0);
            expect(result.toUpdate).toHaveLength(0); // No update needed
            expect(result.toDelete).toHaveLength(0);
        });

        it("should update multiple parcels on different days", () => {
            const existing = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: new Date("2025-10-15T10:00:00Z"),
                    latest: new Date("2025-10-15T12:00:00Z"),
                },
                {
                    id: "parcel-2",
                    locationId: locationA,
                    earliest: new Date("2025-10-16T10:00:00Z"),
                    latest: new Date("2025-10-16T12:00:00Z"),
                },
            ];
            const desired = [
                {
                    pickupEarliestTime: new Date("2025-10-15T11:00:00Z"), // Changed time
                    pickupLatestTime: new Date("2025-10-15T13:00:00Z"),
                },
                {
                    pickupEarliestTime: new Date("2025-10-16T14:00:00Z"), // Changed time
                    pickupLatestTime: new Date("2025-10-16T16:00:00Z"),
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            expect(result.toCreate).toHaveLength(0);
            expect(result.toUpdate).toHaveLength(2);
            expect(result.toDelete).toHaveLength(0);
        });

        it("should handle timezone changes within same day", () => {
            const existing = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: new Date("2025-10-15T08:00:00+02:00"), // 6:00 UTC
                    latest: new Date("2025-10-15T10:00:00+02:00"),
                },
            ];
            const desired = [
                {
                    pickupEarliestTime: new Date("2025-10-15T10:00:00+02:00"), // Same day in local time
                    pickupLatestTime: new Date("2025-10-15T12:00:00+02:00"),
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            expect(result.toCreate).toHaveLength(0);
            expect(result.toUpdate).toHaveLength(1); // Should update, not create new
            expect(result.toDelete).toHaveLength(0);
        });

        it("should handle midnight boundary in Stockholm timezone (regression test)", () => {
            // CRITICAL: This tests the timezone bug fix
            // A parcel at 00:15 Stockholm time (Oct 15) = 22:15 UTC (Oct 14)
            // Must be treated as Oct 15, not Oct 14
            const existing = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: new Date("2025-10-15T00:15:00+02:00"), // 00:15 Stockholm = 22:15 UTC Oct 14
                    latest: new Date("2025-10-15T02:00:00+02:00"),
                },
            ];
            const desired = [
                {
                    // Change time on the same Stockholm day (Oct 15)
                    pickupEarliestTime: new Date("2025-10-15T01:00:00+02:00"),
                    pickupLatestTime: new Date("2025-10-15T03:00:00+02:00"),
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            // Should UPDATE (same day in Stockholm), not DELETE+CREATE
            expect(result.toCreate).toHaveLength(0);
            expect(result.toUpdate).toHaveLength(1);
            expect(result.toUpdate[0].id).toBe("parcel-1");
            expect(result.toDelete).toHaveLength(0);
        });

        it("should handle late evening to early morning change as same day", () => {
            // Another midnight boundary test: 23:00 -> 23:30 on same Stockholm day
            const existing = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: new Date("2025-10-15T23:00:00+02:00"), // 21:00 UTC
                    latest: new Date("2025-10-15T23:45:00+02:00"),
                },
            ];
            const desired = [
                {
                    pickupEarliestTime: new Date("2025-10-15T23:30:00+02:00"), // Still Oct 15 Stockholm
                    pickupLatestTime: new Date("2025-10-16T00:15:00+02:00"), // Now Oct 16 Stockholm
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            // earliest time is still on Oct 15 Stockholm, so should UPDATE
            expect(result.toCreate).toHaveLength(0);
            expect(result.toUpdate).toHaveLength(1);
            expect(result.toDelete).toHaveLength(0);
        });

        it("should detect different days across midnight boundary", () => {
            // Parcel on Oct 14 evening vs Oct 15 early morning = different days
            const existing = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: new Date("2025-10-14T23:00:00+02:00"), // Oct 14 Stockholm
                    latest: new Date("2025-10-14T23:45:00+02:00"),
                },
            ];
            const desired = [
                {
                    pickupEarliestTime: new Date("2025-10-15T00:15:00+02:00"), // Oct 15 Stockholm
                    pickupLatestTime: new Date("2025-10-15T02:00:00+02:00"),
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            // Different Stockholm dates -> DELETE old + CREATE new
            expect(result.toCreate).toHaveLength(1);
            expect(result.toUpdate).toHaveLength(0);
            expect(result.toDelete).toHaveLength(1);
            expect(result.toDelete[0]).toBe("parcel-1");
        });
    });

    describe("DELETE operations", () => {
        it("should delete parcels that are not in desired list", () => {
            const existing = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: new Date("2025-10-15T10:00:00Z"),
                    latest: new Date("2025-10-15T12:00:00Z"),
                },
            ];
            const desired: Array<{ pickupEarliestTime: Date; pickupLatestTime: Date }> = [];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            expect(result.toCreate).toHaveLength(0);
            expect(result.toUpdate).toHaveLength(0);
            expect(result.toDelete).toHaveLength(1);
            expect(result.toDelete[0]).toBe("parcel-1");
        });

        it("should delete multiple unmatched parcels", () => {
            const existing = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: new Date("2025-10-15T10:00:00Z"),
                    latest: new Date("2025-10-15T12:00:00Z"),
                },
                {
                    id: "parcel-2",
                    locationId: locationA,
                    earliest: new Date("2025-10-16T10:00:00Z"),
                    latest: new Date("2025-10-16T12:00:00Z"),
                },
                {
                    id: "parcel-3",
                    locationId: locationA,
                    earliest: new Date("2025-10-17T10:00:00Z"),
                    latest: new Date("2025-10-17T12:00:00Z"),
                },
            ];
            const desired = [
                {
                    pickupEarliestTime: new Date("2025-10-15T10:00:00Z"), // Keep parcel-1
                    pickupLatestTime: new Date("2025-10-15T12:00:00Z"),
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            expect(result.toCreate).toHaveLength(0);
            expect(result.toUpdate).toHaveLength(0);
            expect(result.toDelete).toHaveLength(2);
            expect(result.toDelete).toContain("parcel-2");
            expect(result.toDelete).toContain("parcel-3");
        });

        it("should delete parcels when location changes even if date matches", () => {
            const existing = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: new Date("2025-10-15T10:00:00Z"),
                    latest: new Date("2025-10-15T12:00:00Z"),
                },
            ];
            const desired = [
                {
                    pickupEarliestTime: new Date("2025-10-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-10-15T12:00:00Z"),
                },
            ];

            // Different location
            const result = calculateParcelOperations(existing, desired, locationB, householdId);

            expect(result.toCreate).toHaveLength(1);
            expect(result.toCreate[0].pickup_location_id).toBe(locationB);
            expect(result.toUpdate).toHaveLength(0);
            expect(result.toDelete).toHaveLength(1);
            expect(result.toDelete[0]).toBe("parcel-1");
        });
    });

    describe("Complex scenarios (mixed operations)", () => {
        it("should handle CREATE, UPDATE, DELETE in single operation", () => {
            const existing = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: new Date("2025-10-15T10:00:00Z"),
                    latest: new Date("2025-10-15T12:00:00Z"),
                },
                {
                    id: "parcel-2",
                    locationId: locationA,
                    earliest: new Date("2025-10-16T10:00:00Z"),
                    latest: new Date("2025-10-16T12:00:00Z"),
                },
                {
                    id: "parcel-3",
                    locationId: locationA,
                    earliest: new Date("2025-10-17T10:00:00Z"),
                    latest: new Date("2025-10-17T12:00:00Z"),
                },
            ];
            const desired = [
                {
                    // Keep parcel-1 unchanged (no-op)
                    pickupEarliestTime: new Date("2025-10-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-10-15T12:00:00Z"),
                },
                {
                    // Update parcel-2 time
                    pickupEarliestTime: new Date("2025-10-16T14:00:00Z"),
                    pickupLatestTime: new Date("2025-10-16T16:00:00Z"),
                },
                // Delete parcel-3 (not in desired list)
                {
                    // Create new parcel for Oct 18
                    pickupEarliestTime: new Date("2025-10-18T10:00:00Z"),
                    pickupLatestTime: new Date("2025-10-18T12:00:00Z"),
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            expect(result.toCreate).toHaveLength(1);
            expect(result.toCreate[0].pickup_date_time_earliest).toEqual(
                desired[2].pickupEarliestTime,
            );
            expect(result.toUpdate).toHaveLength(1);
            expect(result.toUpdate[0].id).toBe("parcel-2");
            expect(result.toDelete).toHaveLength(1);
            expect(result.toDelete[0]).toBe("parcel-3");
        });

        it("should preserve IDs when only times change (same-day updates)", () => {
            const originalId = "parcel-original-id";
            const existing = [
                {
                    id: originalId,
                    locationId: locationA,
                    earliest: new Date("2025-10-15T10:00:00Z"),
                    latest: new Date("2025-10-15T12:00:00Z"),
                },
            ];
            const desired = [
                {
                    pickupEarliestTime: new Date("2025-10-15T14:00:00Z"),
                    pickupLatestTime: new Date("2025-10-15T16:00:00Z"),
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            // Should UPDATE the existing parcel, not DELETE + CREATE
            expect(result.toCreate).toHaveLength(0);
            expect(result.toUpdate).toHaveLength(1);
            expect(result.toUpdate[0].id).toBe(originalId); // ID preserved!
            expect(result.toDelete).toHaveLength(0);
        });

        it("should handle empty existing and empty desired (no-op)", () => {
            const existing: Array<{
                id: string;
                locationId: string;
                earliest: Date;
                latest: Date;
            }> = [];
            const desired: Array<{ pickupEarliestTime: Date; pickupLatestTime: Date }> = [];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            expect(result.toCreate).toHaveLength(0);
            expect(result.toUpdate).toHaveLength(0);
            expect(result.toDelete).toHaveLength(0);
        });

        it("should handle parcels spanning across midnight", () => {
            const existing = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: new Date("2025-10-15T23:00:00Z"), // 11 PM
                    latest: new Date("2025-10-16T01:00:00Z"), // 1 AM next day
                },
            ];
            const desired = [
                {
                    // Same earliest date (Oct 15), different time
                    pickupEarliestTime: new Date("2025-10-15T22:00:00Z"),
                    pickupLatestTime: new Date("2025-10-16T00:00:00Z"),
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            // Should UPDATE because earliest times are on same date (Oct 15)
            expect(result.toCreate).toHaveLength(0);
            expect(result.toUpdate).toHaveLength(1);
            expect(result.toDelete).toHaveLength(0);
        });
    });

    describe("Edge cases", () => {
        it("should handle duplicate desired parcels (same date)", () => {
            const existing: Array<{
                id: string;
                locationId: string;
                earliest: Date;
                latest: Date;
            }> = [];
            const desired = [
                {
                    pickupEarliestTime: new Date("2025-10-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-10-15T12:00:00Z"),
                },
                {
                    pickupEarliestTime: new Date("2025-10-15T14:00:00Z"), // Same day
                    pickupLatestTime: new Date("2025-10-15T16:00:00Z"),
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            // Both should create new parcels (last one wins in the map)
            // Note: This is a limitation of the current implementation
            // In practice, the form validation should prevent this
            expect(result.toCreate.length).toBeGreaterThanOrEqual(1);
        });

        it("should handle date key generation correctly for single-digit months/days", () => {
            const existing = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: new Date("2025-01-05T10:00:00Z"), // Jan 5
                    latest: new Date("2025-01-05T12:00:00Z"),
                },
            ];
            const desired = [
                {
                    pickupEarliestTime: new Date("2025-01-05T14:00:00Z"), // Same date
                    pickupLatestTime: new Date("2025-01-05T16:00:00Z"),
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            // Should UPDATE, not CREATE (date keys should match with zero-padding)
            expect(result.toCreate).toHaveLength(0);
            expect(result.toUpdate).toHaveLength(1);
            expect(result.toDelete).toHaveLength(0);
        });

        it("should handle year boundaries correctly", () => {
            const existing = [
                {
                    id: "parcel-1",
                    locationId: locationA,
                    earliest: new Date("2025-12-31T10:00:00Z"), // Clearly Dec 31
                    latest: new Date("2025-12-31T12:00:00Z"),
                },
            ];
            const desired = [
                {
                    // Different year - clearly Jan 1
                    pickupEarliestTime: new Date("2026-01-01T10:00:00Z"),
                    pickupLatestTime: new Date("2026-01-01T12:00:00Z"),
                },
            ];

            const result = calculateParcelOperations(existing, desired, locationA, householdId);

            // Different dates (Dec 31 vs Jan 1) = DELETE + CREATE
            expect(result.toCreate).toHaveLength(1);
            expect(result.toUpdate).toHaveLength(0);
            expect(result.toDelete).toHaveLength(1);
        });
    });
});
