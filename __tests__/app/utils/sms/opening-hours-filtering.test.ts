/**
 * Tests for SMS service opening hours filtering
 * Focus: Ensure getParcelsNeedingReminder() properly filters out parcels outside opening hours
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the dependencies
vi.mock("@/app/db/drizzle", () => ({
    db: {
        select: vi.fn(),
    },
}));

vi.mock("@/app/[locale]/schedule/actions", () => ({
    getPickupLocationSchedules: vi.fn(),
}));

vi.mock("@/app/utils/schedule/outside-hours-filter", () => ({
    isParcelOutsideOpeningHours: vi.fn(),
}));

// Mock Time provider
vi.mock("@/app/utils/time-provider", () => ({
    Time: {
        now: vi.fn(() => ({
            addMinutes: vi.fn(minutes => ({
                toUTC: vi.fn(() => new Date("2025-09-15T10:00:00Z")),
            })),
            toUTC: vi.fn(() => new Date("2025-09-15T10:00:00Z")),
        })),
    },
}));

import { getParcelsNeedingReminder } from "@/app/utils/sms/sms-service";
import { getPickupLocationSchedules } from "@/app/[locale]/schedule/actions";
import { isParcelOutsideOpeningHours } from "@/app/utils/schedule/outside-hours-filter";
import { db } from "@/app/db/drizzle";

const mockGetPickupLocationSchedules = vi.mocked(getPickupLocationSchedules);
const mockIsParcelOutsideOpeningHours = vi.mocked(isParcelOutsideOpeningHours);
const mockDb = vi.mocked(db);

describe("SMS Opening Hours Filtering", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Console spy to suppress logs during testing
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mockDatabaseParcels = [
        {
            parcelId: "parcel-1",
            householdId: "household-1",
            householdName: "John Doe",
            phone: "+46701234567",
            locale: "sv",
            pickupDate: new Date("2025-09-17T14:00:00Z"),
            pickupLatestDate: new Date("2025-09-17T15:00:00Z"),
            locationId: "location-1",
            locationName: "Västerås Stadsmission",
            locationAddress: "Test Street 123",
        },
        {
            parcelId: "parcel-2",
            householdId: "household-2",
            householdName: "Jane Smith",
            phone: "+46701234568",
            locale: "en",
            pickupDate: new Date("2025-09-17T22:00:00Z"), // Outside hours
            pickupLatestDate: new Date("2025-09-17T23:00:00Z"),
            locationId: "location-1",
            locationName: "Västerås Stadsmission",
            locationAddress: "Test Street 123",
        },
        {
            parcelId: "parcel-3",
            householdId: "household-3",
            householdName: "Bob Wilson",
            phone: "+46701234569",
            locale: "sv",
            pickupDate: new Date("2025-09-17T10:00:00Z"),
            pickupLatestDate: new Date("2025-09-17T11:00:00Z"),
            locationId: "location-2",
            locationName: "Klara Kyrka",
            locationAddress: "Church Street 456",
        },
    ];

    const mockLocationSchedule = {
        schedules: [
            {
                id: "schedule-1",
                name: "Regular Schedule",
                startDate: "2025-09-01",
                endDate: "2025-12-31",
                days: [
                    {
                        weekday: "tuesday",
                        isOpen: true,
                        openingTime: "09:00",
                        closingTime: "17:00",
                    },
                ],
            },
        ],
    };

    function setupDatabaseMock() {
        const mockSelect = vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
                innerJoin: vi.fn().mockReturnValue({
                    innerJoin: vi.fn().mockReturnValue({
                        leftJoin: vi.fn().mockReturnValue({
                            where: vi.fn().mockResolvedValue(mockDatabaseParcels),
                        }),
                    }),
                }),
            }),
        });

        mockDb.select.mockReturnValue(mockSelect());
    }

    describe("getParcelsNeedingReminder", () => {
        it("should filter out parcels that are outside opening hours", async () => {
            setupDatabaseMock();

            // Mock schedule retrieval
            mockGetPickupLocationSchedules.mockResolvedValue(mockLocationSchedule);

            // Mock opening hours validation
            mockIsParcelOutsideOpeningHours
                .mockReturnValueOnce(false) // parcel-1: within hours
                .mockReturnValueOnce(true) // parcel-2: outside hours
                .mockReturnValueOnce(false); // parcel-3: within hours

            const result = await getParcelsNeedingReminder();

            expect(result).toHaveLength(2);
            expect(result.map(p => p.parcelId)).toEqual(["parcel-1", "parcel-3"]);

            // Verify opening hours checks were called correctly
            expect(mockIsParcelOutsideOpeningHours).toHaveBeenCalledTimes(3);
            expect(mockIsParcelOutsideOpeningHours).toHaveBeenCalledWith(
                {
                    id: "parcel-1",
                    pickupEarliestTime: mockDatabaseParcels[0].pickupDate,
                    pickupLatestTime: mockDatabaseParcels[0].pickupLatestDate,
                    isPickedUp: false,
                },
                mockLocationSchedule,
            );
        });

        it("should include parcel when location schedule is not available (fail-safe)", async () => {
            setupDatabaseMock();

            // Mock schedule retrieval to return empty schedules
            mockGetPickupLocationSchedules.mockResolvedValue({ schedules: [] });

            const result = await getParcelsNeedingReminder();

            // All parcels should be included when schedule is unavailable
            expect(result).toHaveLength(3);
            expect(mockIsParcelOutsideOpeningHours).not.toHaveBeenCalled();
        });

        it("should include parcel when opening hours validation throws error (fail-safe)", async () => {
            setupDatabaseMock();

            mockGetPickupLocationSchedules.mockResolvedValue(mockLocationSchedule);
            mockIsParcelOutsideOpeningHours
                .mockReturnValueOnce(false) // parcel-1: within hours
                .mockImplementationOnce(() => {
                    throw new Error("Validation error");
                }) // parcel-2: error occurs
                .mockReturnValueOnce(false); // parcel-3: within hours

            const result = await getParcelsNeedingReminder();

            // All parcels should be included despite the error
            expect(result).toHaveLength(3);

            // Verify warning was logged
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining("Could not validate opening hours for parcel parcel-2"),
                expect.any(Error),
            );
        });

        it("should log filtering statistics when parcels are filtered", async () => {
            setupDatabaseMock();

            mockGetPickupLocationSchedules.mockResolvedValue(mockLocationSchedule);
            mockIsParcelOutsideOpeningHours
                .mockReturnValueOnce(false) // parcel-1: within hours
                .mockReturnValueOnce(true) // parcel-2: outside hours
                .mockReturnValueOnce(true); // parcel-3: outside hours

            await getParcelsNeedingReminder();

            // Verify individual parcel filtering logs
            expect(console.log).toHaveBeenCalledWith(
                "🚫 SMS skipped for parcel parcel-2: scheduled outside opening hours",
            );
            expect(console.log).toHaveBeenCalledWith(
                "🚫 SMS skipped for parcel parcel-3: scheduled outside opening hours",
            );

            // Verify summary statistics log
            expect(console.log).toHaveBeenCalledWith(
                "📊 SMS filtering: 1 parcels eligible, 2 filtered out (outside opening hours)",
            );
        });

        it("should not log statistics when no parcels are filtered", async () => {
            setupDatabaseMock();

            mockGetPickupLocationSchedules.mockResolvedValue(mockLocationSchedule);
            mockIsParcelOutsideOpeningHours.mockReturnValue(false); // All within hours

            await getParcelsNeedingReminder();

            // No filtering statistics should be logged
            expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining("SMS filtering:"));
        });

        it("should handle empty database results gracefully", async () => {
            // Mock empty database result
            const mockSelect = vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue({
                    innerJoin: vi.fn().mockReturnValue({
                        innerJoin: vi.fn().mockReturnValue({
                            leftJoin: vi.fn().mockReturnValue({
                                where: vi.fn().mockResolvedValue([]),
                            }),
                        }),
                    }),
                }),
            });

            mockDb.select.mockReturnValue(mockSelect());

            const result = await getParcelsNeedingReminder();

            expect(result).toHaveLength(0);
            expect(mockGetPickupLocationSchedules).not.toHaveBeenCalled();
            expect(mockIsParcelOutsideOpeningHours).not.toHaveBeenCalled();
        });
    });
});
