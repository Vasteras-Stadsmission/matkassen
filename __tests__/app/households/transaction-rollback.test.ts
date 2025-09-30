/**
 * Transaction Safety Tests
 *
 * These tests verify that database operations properly handle errors
 * and validation failures, ensuring no partial data is committed.
 *
 * Note: These are focused tests that verify error handling logic.
 * Full integration tests with a real database would require additional
 * test infrastructure (test database, cleanup scripts, etc.)
 */

import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock the database to control behavior
vi.mock("@/app/db/drizzle", () => {
    const mockTransaction = vi.fn();
    return {
        db: {
            transaction: mockTransaction,
            select: vi.fn(),
            insert: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    };
});

describe("Transaction Safety", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("enrollHousehold should fail entirely when validation rejects parcels", async () => {
        // Import after mocks are set up
        const { db } = await import("@/app/db/drizzle");
        const { enrollHousehold } = await import("@/app/[locale]/households/enroll/actions");

        // Mock transaction to throw a validation error
        const mockTx = {
            insert: vi.fn(),
            select: vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([]), // Location doesn't exist
                    }),
                }),
            }),
        };

        (db.transaction as any).mockImplementation(async (callback: any) => {
            return await callback(mockTx);
        });

        // Arrange: Household data with parcels for non-existent location
        const testData = {
            headOfHousehold: {
                firstName: "Test",
                lastName: "User",
                phoneNumber: "0701234567",
                postalCode: "72211",
                locale: "en" as const,
            },
            members: [],
            dietaryRestrictions: [],
            additionalNeeds: [],
            pets: [],
            foodParcels: {
                pickupLocationId: "invalid-location",
                parcels: [
                    {
                        pickupEarliestTime: new Date("2099-12-31T10:00:00Z"),
                        pickupLatestTime: new Date("2099-12-31T10:15:00Z"),
                    },
                ],
            },
        };

        // Act: Attempt to enroll household
        const result = await enrollHousehold(testData);

        // Assert: Operation should fail
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();

        // Verify: Transaction was called (meaning it will rollback on error)
        expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    test("updateHouseholdParcels should return validation errors without committing", async () => {
        // Import after mocks are set up
        const { db } = await import("@/app/db/drizzle");
        const { updateHouseholdParcels } = await import(
            "@/app/[locale]/households/[id]/parcels/actions"
        );

        // Mock transaction behavior
        const mockTx = {
            delete: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(undefined),
            }),
            select: vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([]), // Location doesn't exist
                    }),
                }),
            }),
            insert: vi.fn(),
        };

        (db.transaction as any).mockImplementation(async (callback: any) => {
            return await callback(mockTx);
        });

        // Arrange: Try to update parcels with invalid location
        const parcelsData = {
            pickupLocationId: "invalid-location",
            parcels: [
                {
                    pickupDate: new Date("2099-12-31"),
                    pickupEarliestTime: new Date("2099-12-31T10:00:00Z"),
                    pickupLatestTime: new Date("2099-12-31T10:15:00Z"),
                },
            ],
        };

        // Act: Attempt to update parcels
        const result = await updateHouseholdParcels("test-household-id", parcelsData);

        // Assert: Operation should fail with validation errors
        expect(result.success).toBe(false);
        expect(result.validationErrors).toBeDefined();
        expect(result.validationErrors!.length).toBeGreaterThan(0);

        // Verify: Transaction ensures atomic operation
        expect(db.transaction).toHaveBeenCalledTimes(1);

        // Verify: Insert should NOT have been called (validation failed first)
        expect(mockTx.insert).not.toHaveBeenCalled();
    });
});
