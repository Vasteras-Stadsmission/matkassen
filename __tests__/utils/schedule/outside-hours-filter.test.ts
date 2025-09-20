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

// Don't mock date-utils for DST tests - we want real timezone behavior
// Mock the date-utils module only for legacy tests
const mockToStockholmTime = vi.fn((date: Date) => date);
vi.mock("@/app/utils/date-utils", async () => {
    const actual = await vi.importActual("@/app/utils/date-utils");
    return {
        ...actual,
        toStockholmTime: mockToStockholmTime, // Allow override for specific tests
    };
});

import { isTimeAvailable } from "@/app/utils/schedule/location-availability";

const mockIsTimeAvailable = vi.mocked(isTimeAvailable);

describe("outside-hours-filter", () => {
    const fixedCurrentTime = new Date("2025-08-18T08:00:00Z");

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
                pickupEarliestTime: new Date("2025-08-18T06:00:00Z"),
                pickupLatestTime: new Date("2025-08-18T07:00:00Z"),
                isPickedUp: false,
            };

            expect(isFutureParcel(pastParcel, fixedCurrentTime)).toBe(false);
        });

        it("should return false for parcels with earliest pickup time exactly at current time", () => {
            const currentParcel: ParcelTimeInfo = {
                id: "1",
                pickupEarliestTime: new Date("2025-08-18T08:00:00Z"),
                pickupLatestTime: new Date("2025-08-18T09:00:00Z"),
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
                pickupEarliestTime: new Date("2025-08-18T06:00:00Z"),
                pickupLatestTime: new Date("2025-08-18T07:00:00Z"),
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
                pickupEarliestTime: new Date("2025-08-18T15:00:00Z"), // Future
                pickupLatestTime: new Date("2025-08-18T16:00:00Z"),
                isPickedUp: false,
            },
            {
                id: "2",
                pickupEarliestTime: new Date("2025-08-18T06:00:00Z"), // Past
                pickupLatestTime: new Date("2025-08-18T07:00:00Z"),
                isPickedUp: false,
            },
            {
                id: "3",
                pickupEarliestTime: new Date("2025-08-18T12:00:00Z"), // Future, picked up
                pickupLatestTime: new Date("2025-08-18T13:00:00Z"),
                isPickedUp: true,
            },
            {
                id: "4",
                pickupEarliestTime: new Date("2025-08-18T18:00:00Z"), // Future, outside hours
                pickupLatestTime: new Date("2025-08-18T19:00:00Z"),
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
                    pickupEarliestTime: new Date("2025-08-18T15:00:00Z"), // Future, not picked up
                    pickupLatestTime: new Date("2025-08-18T16:00:00Z"),
                    isPickedUp: false,
                },
                {
                    id: "2",
                    pickupEarliestTime: new Date("2025-08-18T06:00:00Z"), // Past
                    pickupLatestTime: new Date("2025-08-18T07:00:00Z"),
                    isPickedUp: false,
                },
                {
                    id: "3",
                    pickupEarliestTime: new Date("2025-08-18T12:00:00Z"), // Future, picked up
                    pickupLatestTime: new Date("2025-08-18T13:00:00Z"),
                    isPickedUp: true,
                },
            ];

            const result = filterActiveParcels(parcels, fixedCurrentTime);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe("1");
        });
    });

    describe("isParcelAffectedByScheduleChange", () => {
        it("should return true when parcel becomes outside hours with new schedule", () => {
            const parcel: ParcelTimeInfo = {
                id: "1",
                pickupEarliestTime: new Date("2025-08-18T09:30:00Z"), // Within current, outside proposed
                pickupLatestTime: new Date("2025-08-18T10:30:00Z"),
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
                pickupEarliestTime: new Date("2025-08-18T11:00:00Z"), // Within both schedules
                pickupLatestTime: new Date("2025-08-18T12:00:00Z"),
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
                pickupEarliestTime: new Date("2025-08-18T06:00:00Z"), // Past
                pickupLatestTime: new Date("2025-08-18T07:00:00Z"),
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
                    pickupEarliestTime: new Date("2025-08-18T09:30:00Z"), // Will be affected
                    pickupLatestTime: new Date("2025-08-18T10:30:00Z"),
                    isPickedUp: false,
                },
                {
                    id: "2",
                    pickupEarliestTime: new Date("2025-08-18T11:00:00Z"), // Won't be affected
                    pickupLatestTime: new Date("2025-08-18T12:00:00Z"),
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

    describe("DST Edge Cases", () => {
        beforeEach(() => {
            // Reset mocks and use real date-utils for DST tests
            vi.clearAllMocks();
            mockToStockholmTime.mockImplementation((date: Date) => date);
        });

        describe("Spring DST Transition (March 30, 2025)", () => {
            it("should handle parcel times during spring DST transition", () => {
                // During spring DST (02:00 -> 03:00), times in the "missing hour" need careful handling
                const dstTransitionSchedule: LocationScheduleInfo = {
                    schedules: [
                        {
                            id: "dst-schedule",
                            name: "DST Schedule",
                            startDate: "2025-03-29",
                            endDate: "2025-03-31",
                            days: [
                                {
                                    weekday: "sunday",
                                    isOpen: true,
                                    openingTime: "01:00", // Before DST jump
                                    closingTime: "04:00", // After DST jump
                                },
                            ],
                        },
                    ],
                };

                // Parcel during the "missing hour" (02:00-03:00 doesn't exist on this day)
                const parcelDuringMissingHour: ParcelTimeInfo = {
                    id: "dst-parcel-1",
                    pickupEarliestTime: new Date("2025-03-30T01:30:00.000Z"), // This gets jumped to 03:30 Stockholm
                    pickupLatestTime: new Date("2025-03-30T02:30:00.000Z"),
                    isPickedUp: false,
                };

                // Parcel before DST transition
                const parcelBeforeDST: ParcelTimeInfo = {
                    id: "dst-parcel-2",
                    pickupEarliestTime: new Date("2025-03-30T00:30:00.000Z"), // 01:30 Stockholm (before jump)
                    pickupLatestTime: new Date("2025-03-30T01:00:00.000Z"),
                    isPickedUp: false,
                };

                // Parcel after DST transition
                const parcelAfterDST: ParcelTimeInfo = {
                    id: "dst-parcel-3",
                    pickupEarliestTime: new Date("2025-03-30T01:30:00.000Z"), // 03:30 Stockholm (after jump)
                    pickupLatestTime: new Date("2025-03-30T02:00:00.000Z"), // 04:00 Stockholm
                    isPickedUp: false,
                };

                // Mock isTimeAvailable to return true for all (location is open)
                mockIsTimeAvailable.mockReturnValue({ isAvailable: true });

                const currentTime = new Date("2025-03-29T22:00:00.000Z"); // Before any of the parcels

                // Test that all parcels are future parcels
                expect(isFutureParcel(parcelDuringMissingHour, currentTime)).toBe(true);
                expect(isFutureParcel(parcelBeforeDST, currentTime)).toBe(true);
                expect(isFutureParcel(parcelAfterDST, currentTime)).toBe(true);

                // Test that none are considered outside hours (schedule accommodates DST)
                expect(
                    isParcelOutsideOpeningHours(parcelDuringMissingHour, dstTransitionSchedule),
                ).toBe(false);
                expect(isParcelOutsideOpeningHours(parcelBeforeDST, dstTransitionSchedule)).toBe(
                    false,
                );
                expect(isParcelOutsideOpeningHours(parcelAfterDST, dstTransitionSchedule)).toBe(
                    false,
                );
            });

            it("should handle week boundaries during spring DST", () => {
                // Test transition from Saturday to Sunday (DST day)
                const saturdayBeforeDST: ParcelTimeInfo = {
                    id: "saturday-parcel",
                    pickupEarliestTime: new Date("2025-03-29T21:30:00.000Z"), // Saturday 23:30 Stockholm
                    pickupLatestTime: new Date("2025-03-29T22:00:00.000Z"),
                    isPickedUp: false,
                };

                const sundayDuringDST: ParcelTimeInfo = {
                    id: "sunday-parcel",
                    pickupEarliestTime: new Date("2025-03-30T00:30:00.000Z"), // Sunday 01:30 Stockholm (before DST)
                    pickupLatestTime: new Date("2025-03-30T01:00:00.000Z"),
                    isPickedUp: false,
                };

                const currentTime = new Date("2025-03-29T18:00:00.000Z"); // Saturday evening

                expect(isFutureParcel(saturdayBeforeDST, currentTime)).toBe(true);
                expect(isFutureParcel(sundayDuringDST, currentTime)).toBe(true);

                // Sunday parcel should be later than Saturday parcel despite DST
                expect(sundayDuringDST.pickupEarliestTime.getTime()).toBeGreaterThan(
                    saturdayBeforeDST.pickupEarliestTime.getTime(),
                );
            });
        });

        describe("Fall DST Transition (October 26, 2025)", () => {
            it("should handle parcel times during fall DST transition", () => {
                // During fall DST (03:00 -> 02:00), the hour 02:00-03:00 occurs twice
                const dstTransitionSchedule: LocationScheduleInfo = {
                    schedules: [
                        {
                            id: "fall-dst-schedule",
                            name: "Fall DST Schedule",
                            startDate: "2025-10-25",
                            endDate: "2025-10-27",
                            days: [
                                {
                                    weekday: "sunday",
                                    isOpen: true,
                                    openingTime: "01:00",
                                    closingTime: "04:00",
                                },
                            ],
                        },
                    ],
                };

                // Parcels during the "duplicate hour" period
                const parcelFirstOccurrence: ParcelTimeInfo = {
                    id: "fall-parcel-1",
                    pickupEarliestTime: new Date("2025-10-26T00:30:00.000Z"), // 02:30 Stockholm (first occurrence, UTC+2)
                    pickupLatestTime: new Date("2025-10-26T01:00:00.000Z"),
                    isPickedUp: false,
                };

                const parcelSecondOccurrence: ParcelTimeInfo = {
                    id: "fall-parcel-2",
                    pickupEarliestTime: new Date("2025-10-26T01:30:00.000Z"), // 02:30 Stockholm (second occurrence, UTC+1)
                    pickupLatestTime: new Date("2025-10-26T02:00:00.000Z"),
                    isPickedUp: false,
                };

                // Mock isTimeAvailable to return true
                mockIsTimeAvailable.mockReturnValue({ isAvailable: true });

                const currentTime = new Date("2025-10-25T22:00:00.000Z"); // Before both parcels

                // Both parcels should be future parcels
                expect(isFutureParcel(parcelFirstOccurrence, currentTime)).toBe(true);
                expect(isFutureParcel(parcelSecondOccurrence, currentTime)).toBe(true);

                // Second occurrence should be later in UTC time
                expect(parcelSecondOccurrence.pickupEarliestTime.getTime()).toBeGreaterThan(
                    parcelFirstOccurrence.pickupEarliestTime.getTime(),
                );

                // Neither should be outside hours
                expect(
                    isParcelOutsideOpeningHours(parcelFirstOccurrence, dstTransitionSchedule),
                ).toBe(false);
                expect(
                    isParcelOutsideOpeningHours(parcelSecondOccurrence, dstTransitionSchedule),
                ).toBe(false);
            });

            it("should handle week boundaries during fall DST", () => {
                // Test transition from Saturday to Sunday (DST day)
                const saturdayBeforeDST: ParcelTimeInfo = {
                    id: "saturday-fall-parcel",
                    pickupEarliestTime: new Date("2025-10-25T21:30:00.000Z"), // Saturday 23:30 Stockholm
                    pickupLatestTime: new Date("2025-10-25T22:00:00.000Z"),
                    isPickedUp: false,
                };

                const sundayDuringDST: ParcelTimeInfo = {
                    id: "sunday-fall-parcel",
                    pickupEarliestTime: new Date("2025-10-26T00:30:00.000Z"), // Sunday 01:30 Stockholm
                    pickupLatestTime: new Date("2025-10-26T01:00:00.000Z"),
                    isPickedUp: false,
                };

                const currentTime = new Date("2025-10-25T18:00:00.000Z"); // Saturday evening

                expect(isFutureParcel(saturdayBeforeDST, currentTime)).toBe(true);
                expect(isFutureParcel(sundayDuringDST, currentTime)).toBe(true);

                // Sunday parcel should be later than Saturday parcel
                expect(sundayDuringDST.pickupEarliestTime.getTime()).toBeGreaterThan(
                    saturdayBeforeDST.pickupEarliestTime.getTime(),
                );
            });
        });

        describe("Sunday to Monday week transitions during DST", () => {
            it("should handle Sunday night to Monday morning transition during spring DST", () => {
                const sundayNightParcel: ParcelTimeInfo = {
                    id: "sunday-night-spring",
                    pickupEarliestTime: new Date("2025-03-30T21:30:00.000Z"), // Sunday 23:30 Stockholm
                    pickupLatestTime: new Date("2025-03-30T22:00:00.000Z"),
                    isPickedUp: false,
                };

                const mondayMorningParcel: ParcelTimeInfo = {
                    id: "monday-morning-spring",
                    pickupEarliestTime: new Date("2025-03-31T06:00:00.000Z"), // Monday 08:00 Stockholm
                    pickupLatestTime: new Date("2025-03-31T07:00:00.000Z"),
                    isPickedUp: false,
                };

                const currentTime = new Date("2025-03-30T18:00:00.000Z"); // Sunday evening

                expect(isFutureParcel(sundayNightParcel, currentTime)).toBe(true);
                expect(isFutureParcel(mondayMorningParcel, currentTime)).toBe(true);

                // Monday should be after Sunday despite DST
                expect(mondayMorningParcel.pickupEarliestTime.getTime()).toBeGreaterThan(
                    sundayNightParcel.pickupEarliestTime.getTime(),
                );
            });

            it("should handle Sunday night to Monday morning transition during fall DST", () => {
                const sundayNightParcel: ParcelTimeInfo = {
                    id: "sunday-night-fall",
                    pickupEarliestTime: new Date("2025-10-26T21:30:00.000Z"), // Sunday 23:30 Stockholm
                    pickupLatestTime: new Date("2025-10-26T22:00:00.000Z"),
                    isPickedUp: false,
                };

                const mondayMorningParcel: ParcelTimeInfo = {
                    id: "monday-morning-fall",
                    pickupEarliestTime: new Date("2025-10-27T07:00:00.000Z"), // Monday 08:00 Stockholm
                    pickupLatestTime: new Date("2025-10-27T08:00:00.000Z"),
                    isPickedUp: false,
                };

                const currentTime = new Date("2025-10-26T18:00:00.000Z"); // Sunday evening

                expect(isFutureParcel(sundayNightParcel, currentTime)).toBe(true);
                expect(isFutureParcel(mondayMorningParcel, currentTime)).toBe(true);

                // Monday should be after Sunday
                expect(mondayMorningParcel.pickupEarliestTime.getTime()).toBeGreaterThan(
                    sundayNightParcel.pickupEarliestTime.getTime(),
                );
            });
        });

        describe("DST transition impact on schedule changes", () => {
            it("should correctly assess schedule change impact during DST transitions", () => {
                const currentSchedule: LocationScheduleInfo = {
                    schedules: [
                        {
                            id: "current",
                            name: "Current Schedule",
                            startDate: "2025-03-29",
                            endDate: "2025-03-31",
                            days: [
                                {
                                    weekday: "sunday",
                                    isOpen: true,
                                    openingTime: "10:00",
                                    closingTime: "18:00",
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
                            startDate: "2025-03-29",
                            endDate: "2025-03-31",
                            days: [
                                {
                                    weekday: "sunday",
                                    isOpen: true,
                                    openingTime: "12:00", // Later opening
                                    closingTime: "16:00", // Earlier closing
                                },
                            ],
                        },
                    ],
                };

                const affectedParcel: ParcelTimeInfo = {
                    id: "affected-dst-parcel",
                    pickupEarliestTime: new Date("2025-03-30T09:00:00.000Z"), // 11:00 Stockholm - would be outside new hours
                    pickupLatestTime: new Date("2025-03-30T10:00:00.000Z"),
                    isPickedUp: false,
                };

                // Mock the availability checks
                mockIsTimeAvailable
                    .mockReturnValueOnce({ isAvailable: true }) // Current schedule - available
                    .mockReturnValueOnce({ isAvailable: true })
                    .mockReturnValueOnce({ isAvailable: false }) // Proposed schedule - not available
                    .mockReturnValueOnce({ isAvailable: false });

                const currentTime = new Date("2025-03-29T06:00:00.000Z");

                expect(
                    isParcelAffectedByScheduleChange(
                        affectedParcel,
                        currentSchedule,
                        proposedSchedule,
                        currentTime,
                    ),
                ).toBe(true);
            });
        });
    });
});
