import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    isFutureParcel,
    isActiveParcel,
    isParcelOutsideOpeningHours,
    filterOutsideHoursParcels,
    countOutsideHoursParcels,
    filterActiveParcels,
    isParcelAffectedByScheduleChange,
    countParcelsAffectedByScheduleChange,
    type ParcelTimeInfo,
    type LocationScheduleInfo,
} from "@/app/utils/schedule/outside-hours-filter";

// Mock the location-availability module
vi.mock("@/app/utils/schedule/location-availability", () => ({
    isTimeAvailable: vi.fn(),
}));

// Mock the date-utils module
vi.mock("@/app/utils/date-utils", () => ({
    toStockholmTime: vi.fn((date: Date) => date), // Simple passthrough for testing
}));

import { isTimeAvailable } from "@/app/utils/schedule/location-availability";

const mockIsTimeAvailable = vi.mocked(isTimeAvailable);

describe("outside-hours-filter", () => {
    const fixedCurrentTime = new Date("2025-08-19T10:00:00Z");

    const mockLocationSchedule: LocationScheduleInfo = {
        schedules: [
            {
                id: "schedule-1",
                name: "Regular Hours",
                startDate: "2025-08-01",
                endDate: "2025-08-31",
                days: [
                    {
                        weekday: "monday",
                        isOpen: true,
                        openingTime: "09:00",
                        closingTime: "17:00",
                    },
                    {
                        weekday: "tuesday",
                        isOpen: true,
                        openingTime: "09:00",
                        closingTime: "17:00",
                    },
                    {
                        weekday: "wednesday",
                        isOpen: false,
                        openingTime: null,
                        closingTime: null,
                    },
                ],
            },
        ],
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("isFutureParcel", () => {
        it("should return true for parcels with future earliest pickup time", () => {
            const futureParcel: ParcelTimeInfo = {
                id: "1",
                pickupEarliestTime: new Date("2025-08-19T15:00:00Z"),
                pickupLatestTime: new Date("2025-08-19T16:00:00Z"),
                isPickedUp: false,
            };

            expect(isFutureParcel(futureParcel, fixedCurrentTime)).toBe(true);
        });

        it("should return false for parcels with past earliest pickup time", () => {
            const pastParcel: ParcelTimeInfo = {
                id: "1",
                pickupEarliestTime: new Date("2025-08-19T08:00:00Z"),
                pickupLatestTime: new Date("2025-08-19T09:00:00Z"),
                isPickedUp: false,
            };

            expect(isFutureParcel(pastParcel, fixedCurrentTime)).toBe(false);
        });

        it("should return false for parcels with earliest pickup time exactly at current time", () => {
            const currentParcel: ParcelTimeInfo = {
                id: "1",
                pickupEarliestTime: new Date("2025-08-19T10:00:00Z"),
                pickupLatestTime: new Date("2025-08-19T11:00:00Z"),
                isPickedUp: false,
            };

            expect(isFutureParcel(currentParcel, fixedCurrentTime)).toBe(false);
        });
    });

    describe("isActiveParcel", () => {
        it("should return true for unpicked future parcels", () => {
            const activeParcel: ParcelTimeInfo = {
                id: "1",
                pickupEarliestTime: new Date("2025-08-19T15:00:00Z"),
                pickupLatestTime: new Date("2025-08-19T16:00:00Z"),
                isPickedUp: false,
            };

            expect(isActiveParcel(activeParcel, fixedCurrentTime)).toBe(true);
        });

        it("should return false for picked up parcels", () => {
            const pickedUpParcel: ParcelTimeInfo = {
                id: "1",
                pickupEarliestTime: new Date("2025-08-19T15:00:00Z"),
                pickupLatestTime: new Date("2025-08-19T16:00:00Z"),
                isPickedUp: true,
            };

            expect(isActiveParcel(pickedUpParcel, fixedCurrentTime)).toBe(false);
        });

        it("should return false for past parcels", () => {
            const pastParcel: ParcelTimeInfo = {
                id: "1",
                pickupEarliestTime: new Date("2025-08-19T08:00:00Z"),
                pickupLatestTime: new Date("2025-08-19T09:00:00Z"),
                isPickedUp: false,
            };

            expect(isActiveParcel(pastParcel, fixedCurrentTime)).toBe(false);
        });
    });

    describe("isParcelOutsideOpeningHours", () => {
        it("should return true when parcel is outside opening hours", () => {
            const outsideParcel: ParcelTimeInfo = {
                id: "1",
                pickupEarliestTime: new Date("2025-08-19T18:00:00Z"),
                pickupLatestTime: new Date("2025-08-19T19:00:00Z"),
                isPickedUp: false,
            };

            mockIsTimeAvailable
                .mockReturnValueOnce({ isAvailable: false, reason: "Outside hours" })
                .mockReturnValueOnce({ isAvailable: false, reason: "Outside hours" });

            expect(isParcelOutsideOpeningHours(outsideParcel, mockLocationSchedule)).toBe(true);
        });

        it("should return false when parcel is within opening hours", () => {
            const insideParcel: ParcelTimeInfo = {
                id: "1",
                pickupEarliestTime: new Date("2025-08-19T10:00:00Z"),
                pickupLatestTime: new Date("2025-08-19T11:00:00Z"),
                isPickedUp: false,
            };

            mockIsTimeAvailable
                .mockReturnValueOnce({ isAvailable: true })
                .mockReturnValueOnce({ isAvailable: true });

            expect(isParcelOutsideOpeningHours(insideParcel, mockLocationSchedule)).toBe(false);
        });

        it("should return true when start time is available but end time is not", () => {
            const partiallyOutsideParcel: ParcelTimeInfo = {
                id: "1",
                pickupEarliestTime: new Date("2025-08-19T16:30:00Z"),
                pickupLatestTime: new Date("2025-08-19T17:30:00Z"),
                isPickedUp: false,
            };

            mockIsTimeAvailable
                .mockReturnValueOnce({ isAvailable: true })
                .mockReturnValueOnce({ isAvailable: false, reason: "After closing" });

            expect(isParcelOutsideOpeningHours(partiallyOutsideParcel, mockLocationSchedule)).toBe(
                true,
            );
        });

        it("should return true when availability check throws an error", () => {
            const errorParcel: ParcelTimeInfo = {
                id: "1",
                pickupEarliestTime: new Date("2025-08-19T10:00:00Z"),
                pickupLatestTime: new Date("2025-08-19T11:00:00Z"),
                isPickedUp: false,
            };

            mockIsTimeAvailable.mockImplementation(() => {
                throw new Error("Schedule error");
            });

            expect(isParcelOutsideOpeningHours(errorParcel, mockLocationSchedule)).toBe(true);
        });
    });

    describe("filterOutsideHoursParcels", () => {
        const parcels: ParcelTimeInfo[] = [
            {
                id: "1",
                pickupEarliestTime: new Date("2025-08-19T15:00:00Z"), // Future
                pickupLatestTime: new Date("2025-08-19T16:00:00Z"),
                isPickedUp: false,
            },
            {
                id: "2",
                pickupEarliestTime: new Date("2025-08-19T08:00:00Z"), // Past
                pickupLatestTime: new Date("2025-08-19T09:00:00Z"),
                isPickedUp: false,
            },
            {
                id: "3",
                pickupEarliestTime: new Date("2025-08-19T12:00:00Z"), // Future, picked up
                pickupLatestTime: new Date("2025-08-19T13:00:00Z"),
                isPickedUp: true,
            },
            {
                id: "4",
                pickupEarliestTime: new Date("2025-08-19T18:00:00Z"), // Future, outside hours
                pickupLatestTime: new Date("2025-08-19T19:00:00Z"),
                isPickedUp: false,
            },
        ];

        it("should only return active parcels that are outside opening hours", () => {
            // Mock for parcel 1 (future, active) - within hours
            mockIsTimeAvailable
                .mockReturnValueOnce({ isAvailable: true })
                .mockReturnValueOnce({ isAvailable: true });

            // Mock for parcel 4 (future, active) - outside hours
            mockIsTimeAvailable
                .mockReturnValueOnce({ isAvailable: false })
                .mockReturnValueOnce({ isAvailable: false });

            const result = filterOutsideHoursParcels(
                parcels,
                mockLocationSchedule,
                fixedCurrentTime,
            );

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("4");
        });

        it("should return empty array when no parcels are outside hours", () => {
            // Mock all active parcels as within hours
            mockIsTimeAvailable.mockReturnValue({ isAvailable: true });

            const result = filterOutsideHoursParcels(
                parcels,
                mockLocationSchedule,
                fixedCurrentTime,
            );

            expect(result).toHaveLength(0);
        });
    });

    describe("countOutsideHoursParcels", () => {
        it("should return the count of outside hours parcels", () => {
            const parcels: ParcelTimeInfo[] = [
                {
                    id: "1",
                    pickupEarliestTime: new Date("2025-08-19T15:00:00Z"),
                    pickupLatestTime: new Date("2025-08-19T16:00:00Z"),
                    isPickedUp: false,
                },
                {
                    id: "2",
                    pickupEarliestTime: new Date("2025-08-19T18:00:00Z"),
                    pickupLatestTime: new Date("2025-08-19T19:00:00Z"),
                    isPickedUp: false,
                },
            ];

            // First parcel within hours
            mockIsTimeAvailable
                .mockReturnValueOnce({ isAvailable: true })
                .mockReturnValueOnce({ isAvailable: true });

            // Second parcel outside hours
            mockIsTimeAvailable
                .mockReturnValueOnce({ isAvailable: false })
                .mockReturnValueOnce({ isAvailable: false });

            const count = countOutsideHoursParcels(parcels, mockLocationSchedule, fixedCurrentTime);

            expect(count).toBe(1);
        });
    });

    describe("filterActiveParcels", () => {
        it("should only return parcels that are not picked up and in the future", () => {
            const parcels: ParcelTimeInfo[] = [
                {
                    id: "1",
                    pickupEarliestTime: new Date("2025-08-19T15:00:00Z"), // Future, not picked up
                    pickupLatestTime: new Date("2025-08-19T16:00:00Z"),
                    isPickedUp: false,
                },
                {
                    id: "2",
                    pickupEarliestTime: new Date("2025-08-19T08:00:00Z"), // Past
                    pickupLatestTime: new Date("2025-08-19T09:00:00Z"),
                    isPickedUp: false,
                },
                {
                    id: "3",
                    pickupEarliestTime: new Date("2025-08-19T12:00:00Z"), // Future, picked up
                    pickupLatestTime: new Date("2025-08-19T13:00:00Z"),
                    isPickedUp: true,
                },
            ];

            const result = filterActiveParcels(parcels, fixedCurrentTime);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("1");
        });
    });

    describe.skip("isParcelAffectedByScheduleChange", () => {
        it("should return true when parcel becomes outside hours with new schedule", () => {
            const parcel: ParcelTimeInfo = {
                id: "1",
                pickupEarliestTime: new Date("2025-08-19T09:30:00Z"), // Within current, outside proposed
                pickupLatestTime: new Date("2025-08-19T10:30:00Z"),
                isPickedUp: false,
            };

            const currentSchedule: LocationScheduleInfo = {
                schedules: [
                    {
                        id: "current",
                        name: "Current Schedule",
                        startDate: "2025-08-01",
                        endDate: "2025-08-31",
                        days: [
                            {
                                weekday: "monday",
                                isOpen: true,
                                openingTime: "09:00",
                                closingTime: "17:00",
                            },
                        ],
                    },
                ],
            };

            const proposedSchedule: LocationScheduleInfo = {
                schedules: [
                    {
                        id: "proposed",
                        name: "Proposed Schedule",
                        startDate: "2025-08-01",
                        endDate: "2025-08-31",
                        days: [
                            {
                                weekday: "monday",
                                isOpen: true,
                                openingTime: "10:00",
                                closingTime: "16:00",
                            },
                        ],
                    },
                ],
            };

            // Setup mock calls in the order they will be made:
            // For checking current schedule (parcel within hours)
            mockIsTimeAvailable
                .mockReturnValueOnce({ isAvailable: true }) // Current start - available
                .mockReturnValueOnce({ isAvailable: true }) // Current end - available
                // For checking proposed schedule (parcel outside hours)
                .mockReturnValueOnce({ isAvailable: false }) // Proposed start - not available
                .mockReturnValueOnce({ isAvailable: false }); // Proposed end - not available

            expect(
                isParcelAffectedByScheduleChange(
                    parcel,
                    currentSchedule,
                    proposedSchedule,
                    fixedCurrentTime,
                ),
            ).toBe(true);
        });

        it("should return false when parcel remains within hours", () => {
            const parcel: ParcelTimeInfo = {
                id: "1",
                pickupEarliestTime: new Date("2025-08-19T11:00:00Z"), // Within both schedules
                pickupLatestTime: new Date("2025-08-19T12:00:00Z"),
                isPickedUp: false,
            };

            const currentSchedule: LocationScheduleInfo = {
                schedules: [
                    {
                        id: "current",
                        name: "Current Schedule",
                        startDate: "2025-08-01",
                        endDate: "2025-08-31",
                        days: [
                            {
                                weekday: "monday",
                                isOpen: true,
                                openingTime: "09:00",
                                closingTime: "17:00",
                            },
                        ],
                    },
                ],
            };

            const proposedSchedule: LocationScheduleInfo = {
                schedules: [
                    {
                        id: "proposed",
                        name: "Proposed Schedule",
                        startDate: "2025-08-01",
                        endDate: "2025-08-31",
                        days: [
                            {
                                weekday: "monday",
                                isOpen: true,
                                openingTime: "10:00",
                                closingTime: "16:00",
                            },
                        ],
                    },
                ],
            };

            // Setup mock calls - parcel remains within hours in both schedules
            mockIsTimeAvailable
                .mockReturnValueOnce({ isAvailable: true }) // Current start - available
                .mockReturnValueOnce({ isAvailable: true }) // Current end - available
                .mockReturnValueOnce({ isAvailable: true }) // Proposed start - available
                .mockReturnValueOnce({ isAvailable: true }); // Proposed end - available

            expect(
                isParcelAffectedByScheduleChange(
                    parcel,
                    currentSchedule,
                    proposedSchedule,
                    fixedCurrentTime,
                ),
            ).toBe(false);
        });

        it("should return false for inactive parcels", () => {
            const pastParcel: ParcelTimeInfo = {
                id: "1",
                pickupEarliestTime: new Date("2025-08-19T08:00:00Z"), // Past
                pickupLatestTime: new Date("2025-08-19T09:00:00Z"),
                isPickedUp: false,
            };

            const currentSchedule: LocationScheduleInfo = {
                schedules: [
                    {
                        id: "current",
                        name: "Current Schedule",
                        startDate: "2025-08-01",
                        endDate: "2025-08-31",
                        days: [
                            {
                                weekday: "monday",
                                isOpen: true,
                                openingTime: "09:00",
                                closingTime: "17:00",
                            },
                        ],
                    },
                ],
            };

            const proposedSchedule: LocationScheduleInfo = {
                schedules: [
                    {
                        id: "proposed",
                        name: "Proposed Schedule",
                        startDate: "2025-08-01",
                        endDate: "2025-08-31",
                        days: [
                            {
                                weekday: "monday",
                                isOpen: true,
                                openingTime: "10:00",
                                closingTime: "16:00",
                            },
                        ],
                    },
                ],
            };

            expect(
                isParcelAffectedByScheduleChange(
                    pastParcel,
                    currentSchedule,
                    proposedSchedule,
                    fixedCurrentTime,
                ),
            ).toBe(false);

            // Should not call isTimeAvailable for inactive parcels
            expect(mockIsTimeAvailable).not.toHaveBeenCalled();
        });
    });

    describe("countParcelsAffectedByScheduleChange", () => {
        it("should return the count of affected parcels", () => {
            const parcels: ParcelTimeInfo[] = [
                {
                    id: "1",
                    pickupEarliestTime: new Date("2025-08-19T09:30:00Z"), // Will be affected
                    pickupLatestTime: new Date("2025-08-19T10:30:00Z"),
                    isPickedUp: false,
                },
                {
                    id: "2",
                    pickupEarliestTime: new Date("2025-08-19T11:00:00Z"), // Won't be affected
                    pickupLatestTime: new Date("2025-08-19T12:00:00Z"),
                    isPickedUp: false,
                },
            ];

            const currentSchedule: LocationScheduleInfo = {
                schedules: [
                    {
                        id: "current",
                        name: "Current",
                        startDate: "2025-08-01",
                        endDate: "2025-08-31",
                        days: [
                            {
                                weekday: "monday",
                                isOpen: true,
                                openingTime: "09:00",
                                closingTime: "17:00",
                            },
                        ],
                    },
                ],
            };

            const proposedSchedule: LocationScheduleInfo = {
                schedules: [
                    {
                        id: "proposed",
                        name: "Proposed",
                        startDate: "2025-08-01",
                        endDate: "2025-08-31",
                        days: [
                            {
                                weekday: "monday",
                                isOpen: true,
                                openingTime: "10:00",
                                closingTime: "16:00",
                            },
                        ],
                    },
                ],
            };

            // Parcel 1: currently within, would be outside (4 calls)
            mockIsTimeAvailable
                .mockReturnValueOnce({ isAvailable: true }) // Current start
                .mockReturnValueOnce({ isAvailable: true }) // Current end
                .mockReturnValueOnce({ isAvailable: false }) // Proposed start
                .mockReturnValueOnce({ isAvailable: false }) // Proposed end

                // Parcel 2: currently within, still within (4 calls)
                .mockReturnValueOnce({ isAvailable: true }) // Current start
                .mockReturnValueOnce({ isAvailable: true }) // Current end
                .mockReturnValueOnce({ isAvailable: true }) // Proposed start
                .mockReturnValueOnce({ isAvailable: true }); // Proposed end

            const count = countParcelsAffectedByScheduleChange(
                parcels,
                currentSchedule,
                proposedSchedule,
                fixedCurrentTime,
            );

            expect(count).toBe(1);
        });
    });
});
