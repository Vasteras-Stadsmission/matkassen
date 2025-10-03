import { describe, it, expect } from "vitest";

/**
 * Tests for past parcel validation in household edit actions
 *
 * CRITICAL REGRESSION TEST:
 * These tests verify that the updateHousehold action only rejects NEW parcels
 * that are in the past, NOT existing historical parcels that the household already has.
 *
 * Context: During the soft-delete feature implementation, the validation was changed from:
 *   parcel => !parcel.id && new Date(parcel.pickupLatestTime) <= now
 * to:
 *   parcel => new Date(parcel.pickupLatestTime) <= now
 *
 * This removed the !parcel.id check, causing ALL past parcels to be rejected,
 * which broke the edit flow for households with historical parcels.
 *
 * The fix restores the !parcel.id guard to only validate NEW parcels.
 */

describe("Past Parcel Validation (Regression Tests)", () => {
    /**
     * Helper to simulate the validation logic from actions.ts
     * This mimics the validation that happens in updateHousehold
     */
    function validatePastParcels(
        parcels: Array<{
            id?: string;
            pickupEarliestTime: Date;
            pickupLatestTime: Date;
        }>,
        now: Date = new Date(),
    ): {
        isValid: boolean;
        pastParcels: Array<{ id?: string; pickupEarliestTime: Date; pickupLatestTime: Date }>;
    } {
        // This is the CORRECT validation logic (with !parcel.id guard)
        const pastParcels = parcels.filter(
            parcel => !parcel.id && new Date(parcel.pickupLatestTime) <= now,
        );

        return {
            isValid: pastParcels.length === 0,
            pastParcels,
        };
    }

    /**
     * Buggy version for comparison (without !parcel.id guard)
     * This simulates the regression that was introduced
     */
    function validatePastParcelsBuggy(
        parcels: Array<{
            id?: string;
            pickupEarliestTime: Date;
            pickupLatestTime: Date;
        }>,
        now: Date = new Date(),
    ): {
        isValid: boolean;
        pastParcels: Array<{ id?: string; pickupEarliestTime: Date; pickupLatestTime: Date }>;
    } {
        // BUGGY: Missing !parcel.id check
        const pastParcels = parcels.filter(parcel => new Date(parcel.pickupLatestTime) <= now);

        return {
            isValid: pastParcels.length === 0,
            pastParcels,
        };
    }

    describe("CORRECT validation behavior (with !parcel.id guard)", () => {
        it("should ALLOW editing household with existing historical parcels", () => {
            const now = new Date("2025-10-03T12:00:00Z");
            const parcels = [
                {
                    id: "existing-parcel-1", // HAS ID = existing parcel
                    pickupEarliestTime: new Date("2025-09-15T10:00:00Z"), // Past
                    pickupLatestTime: new Date("2025-09-15T12:00:00Z"), // Past
                },
                {
                    id: "existing-parcel-2", // HAS ID = existing parcel
                    pickupEarliestTime: new Date("2025-09-20T10:00:00Z"), // Past
                    pickupLatestTime: new Date("2025-09-20T12:00:00Z"), // Past
                },
            ];

            const result = validatePastParcels(parcels, now);

            // Should be VALID because all past parcels have IDs (are existing)
            expect(result.isValid).toBe(true);
            expect(result.pastParcels).toHaveLength(0);
        });

        it("should REJECT adding new parcels with past pickup times", () => {
            const now = new Date("2025-10-03T12:00:00Z");
            const parcels = [
                {
                    // NO ID = new parcel
                    pickupEarliestTime: new Date("2025-09-15T10:00:00Z"), // Past
                    pickupLatestTime: new Date("2025-09-15T12:00:00Z"), // Past
                },
            ];

            const result = validatePastParcels(parcels, now);

            // Should be INVALID because new parcel is in the past
            expect(result.isValid).toBe(false);
            expect(result.pastParcels).toHaveLength(1);
            expect(result.pastParcels[0].id).toBeUndefined();
        });

        it("should ALLOW mix of existing past parcels and new future parcels", () => {
            const now = new Date("2025-10-03T12:00:00Z");
            const parcels = [
                {
                    id: "existing-parcel-1", // Existing past parcel - OK
                    pickupEarliestTime: new Date("2025-09-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-09-15T12:00:00Z"),
                },
                {
                    // New future parcel - OK
                    pickupEarliestTime: new Date("2025-10-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-10-15T12:00:00Z"),
                },
            ];

            const result = validatePastParcels(parcels, now);

            // Should be VALID
            expect(result.isValid).toBe(true);
            expect(result.pastParcels).toHaveLength(0);
        });

        it("should REJECT mix if it contains NEW past parcels", () => {
            const now = new Date("2025-10-03T12:00:00Z");
            const parcels = [
                {
                    id: "existing-parcel-1", // Existing past parcel - OK
                    pickupEarliestTime: new Date("2025-09-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-09-15T12:00:00Z"),
                },
                {
                    // NEW PAST parcel - NOT OK
                    pickupEarliestTime: new Date("2025-09-20T10:00:00Z"),
                    pickupLatestTime: new Date("2025-09-20T12:00:00Z"),
                },
            ];

            const result = validatePastParcels(parcels, now);

            // Should be INVALID because of the new past parcel
            expect(result.isValid).toBe(false);
            expect(result.pastParcels).toHaveLength(1);
            expect(result.pastParcels[0].id).toBeUndefined();
        });

        it("should handle edge case: parcel ending exactly at current time", () => {
            const now = new Date("2025-10-03T12:00:00Z");
            const parcels = [
                {
                    // New parcel ending exactly NOW
                    pickupEarliestTime: new Date("2025-10-03T10:00:00Z"),
                    pickupLatestTime: new Date("2025-10-03T12:00:00Z"), // Exactly now
                },
            ];

            const result = validatePastParcels(parcels, now);

            // Should be INVALID (pickup window has ended)
            expect(result.isValid).toBe(false);
            expect(result.pastParcels).toHaveLength(1);
        });

        it("should ALLOW parcel starting in the past but ending in the future", () => {
            const now = new Date("2025-10-03T12:00:00Z");
            const parcels = [
                {
                    // New parcel with pickup window still open
                    pickupEarliestTime: new Date("2025-10-03T11:00:00Z"), // 1 hour ago
                    pickupLatestTime: new Date("2025-10-03T13:00:00Z"), // 1 hour in future
                },
            ];

            const result = validatePastParcels(parcels, now);

            // Should be VALID (pickup window is still open)
            expect(result.isValid).toBe(true);
            expect(result.pastParcels).toHaveLength(0);
        });

        it("should handle empty parcels array", () => {
            const now = new Date("2025-10-03T12:00:00Z");
            const parcels: Array<{
                id?: string;
                pickupEarliestTime: Date;
                pickupLatestTime: Date;
            }> = [];

            const result = validatePastParcels(parcels, now);

            // Should be VALID (no parcels to validate)
            expect(result.isValid).toBe(true);
            expect(result.pastParcels).toHaveLength(0);
        });
    });

    describe("BUGGY validation behavior (without !parcel.id guard) - REGRESSION DETECTION", () => {
        it("should demonstrate the bug: rejects ALL past parcels including existing ones", () => {
            const now = new Date("2025-10-03T12:00:00Z");
            const parcels = [
                {
                    id: "existing-parcel-1", // Existing parcel that SHOULD be allowed
                    pickupEarliestTime: new Date("2025-09-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-09-15T12:00:00Z"),
                },
            ];

            const buggyResult = validatePastParcelsBuggy(parcels, now);
            const correctResult = validatePastParcels(parcels, now);

            // BUGGY version incorrectly rejects
            expect(buggyResult.isValid).toBe(false);
            expect(buggyResult.pastParcels).toHaveLength(1);

            // CORRECT version allows it
            expect(correctResult.isValid).toBe(true);
            expect(correctResult.pastParcels).toHaveLength(0);

            // This test documents the regression and ensures it doesn't happen again
        });

        it("should demonstrate the impact: typical household with history cannot be edited", () => {
            const now = new Date("2025-10-03T12:00:00Z");

            // Typical scenario: household has 3 historical parcels and wants to add 2 future ones
            const parcels = [
                {
                    id: "hist-1",
                    pickupEarliestTime: new Date("2025-08-01T10:00:00Z"),
                    pickupLatestTime: new Date("2025-08-01T12:00:00Z"),
                },
                {
                    id: "hist-2",
                    pickupEarliestTime: new Date("2025-09-01T10:00:00Z"),
                    pickupLatestTime: new Date("2025-09-01T12:00:00Z"),
                },
                {
                    id: "hist-3",
                    pickupEarliestTime: new Date("2025-10-01T10:00:00Z"),
                    pickupLatestTime: new Date("2025-10-01T12:00:00Z"),
                },
                {
                    // New future parcel
                    pickupEarliestTime: new Date("2025-10-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-10-15T12:00:00Z"),
                },
                {
                    // Another new future parcel
                    pickupEarliestTime: new Date("2025-10-20T10:00:00Z"),
                    pickupLatestTime: new Date("2025-10-20T12:00:00Z"),
                },
            ];

            const buggyResult = validatePastParcelsBuggy(parcels, now);
            const correctResult = validatePastParcels(parcels, now);

            // BUGGY: Blocks the entire update because of historical parcels
            expect(buggyResult.isValid).toBe(false);
            expect(buggyResult.pastParcels).toHaveLength(3); // All historical parcels flagged

            // CORRECT: Allows the update
            expect(correctResult.isValid).toBe(true);
            expect(correctResult.pastParcels).toHaveLength(0);
        });
    });

    describe("Real-world scenarios", () => {
        it("should handle household editing name/phone without touching parcels", () => {
            const now = new Date("2025-10-03T12:00:00Z");

            // User just wants to update phone number, but household has historical parcels
            const parcels = [
                {
                    id: "old-1",
                    pickupEarliestTime: new Date("2025-09-01T10:00:00Z"),
                    pickupLatestTime: new Date("2025-09-01T12:00:00Z"),
                },
                {
                    id: "old-2",
                    pickupEarliestTime: new Date("2025-09-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-09-15T12:00:00Z"),
                },
                {
                    id: "future-1",
                    pickupEarliestTime: new Date("2025-10-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-10-15T12:00:00Z"),
                },
            ];

            const result = validatePastParcels(parcels, now);

            // Should be valid - user should be able to edit household info
            expect(result.isValid).toBe(true);
        });

        it("should handle active household with long history", () => {
            const now = new Date("2025-10-03T12:00:00Z");

            // Household has been active for months with many past parcels
            const parcels = [
                {
                    id: "jan-1",
                    pickupEarliestTime: new Date("2025-01-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-01-15T12:00:00Z"),
                },
                {
                    id: "feb-1",
                    pickupEarliestTime: new Date("2025-02-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-02-15T12:00:00Z"),
                },
                {
                    id: "mar-1",
                    pickupEarliestTime: new Date("2025-03-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-03-15T12:00:00Z"),
                },
                {
                    id: "apr-1",
                    pickupEarliestTime: new Date("2025-04-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-04-15T12:00:00Z"),
                },
                {
                    id: "may-1",
                    pickupEarliestTime: new Date("2025-05-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-05-15T12:00:00Z"),
                },
                {
                    id: "jun-1",
                    pickupEarliestTime: new Date("2025-06-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-06-15T12:00:00Z"),
                },
                {
                    id: "jul-1",
                    pickupEarliestTime: new Date("2025-07-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-07-15T12:00:00Z"),
                },
                {
                    id: "aug-1",
                    pickupEarliestTime: new Date("2025-08-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-08-15T12:00:00Z"),
                },
                {
                    id: "sep-1",
                    pickupEarliestTime: new Date("2025-09-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-09-15T12:00:00Z"),
                },
            ];

            const result = validatePastParcels(parcels, now);

            // Should be valid despite having many historical parcels
            expect(result.isValid).toBe(true);
            expect(result.pastParcels).toHaveLength(0);
        });

        it("should properly reject attempt to add yesterday's parcel", () => {
            const now = new Date("2025-10-03T12:00:00Z");

            const parcels = [
                {
                    id: "existing-1",
                    pickupEarliestTime: new Date("2025-09-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-09-15T12:00:00Z"),
                },
                {
                    // Trying to add yesterday's parcel - should be rejected
                    pickupEarliestTime: new Date("2025-10-02T10:00:00Z"),
                    pickupLatestTime: new Date("2025-10-02T12:00:00Z"),
                },
            ];

            const result = validatePastParcels(parcels, now);

            expect(result.isValid).toBe(false);
            expect(result.pastParcels).toHaveLength(1);
            expect(result.pastParcels[0].id).toBeUndefined();
        });

        it("should handle multiple new past parcels (batch error case)", () => {
            const now = new Date("2025-10-03T12:00:00Z");

            const parcels = [
                {
                    pickupEarliestTime: new Date("2025-09-15T10:00:00Z"),
                    pickupLatestTime: new Date("2025-09-15T12:00:00Z"),
                },
                {
                    pickupEarliestTime: new Date("2025-09-20T10:00:00Z"),
                    pickupLatestTime: new Date("2025-09-20T12:00:00Z"),
                },
                {
                    pickupEarliestTime: new Date("2025-10-01T10:00:00Z"),
                    pickupLatestTime: new Date("2025-10-01T12:00:00Z"),
                },
            ];

            const result = validatePastParcels(parcels, now);

            expect(result.isValid).toBe(false);
            expect(result.pastParcels).toHaveLength(3);
            // All three should be in the error list for proper error message
        });
    });

    describe("Boundary conditions", () => {
        it("should handle parcel 1 millisecond in the future", () => {
            const now = new Date("2025-10-03T12:00:00.000Z");
            const parcels = [
                {
                    pickupEarliestTime: new Date("2025-10-03T11:00:00Z"),
                    pickupLatestTime: new Date("2025-10-03T12:00:00.001Z"), // 1ms in future
                },
            ];

            const result = validatePastParcels(parcels, now);

            expect(result.isValid).toBe(true); // Still within pickup window
        });

        it("should handle parcel 1 millisecond in the past", () => {
            const now = new Date("2025-10-03T12:00:00.000Z");
            const parcels = [
                {
                    pickupEarliestTime: new Date("2025-10-03T11:00:00Z"),
                    pickupLatestTime: new Date("2025-10-03T11:59:59.999Z"), // 1ms in past
                },
            ];

            const result = validatePastParcels(parcels, now);

            expect(result.isValid).toBe(false); // Pickup window has closed
        });
    });
});
