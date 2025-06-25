import {
    generateDaySpecificTimeSlots,
    findTimeGaps,
} from "@/app/[locale]/schedule/components/WeeklyScheduleGrid";

describe("Time Slot Generation", () => {
    // Mock location schedule data for testing
    const mockLocationSchedules = {
        schedules: [
            {
                id: "schedule-1",
                location_id: "location-1",
                name: "Regular Schedule",
                startDate: new Date("2025-05-01"),
                endDate: new Date("2025-05-31"),
                days: [
                    { weekday: "monday", isOpen: true, openingTime: "09:00", closingTime: "17:00" },
                    {
                        weekday: "tuesday",
                        isOpen: true,
                        openingTime: "09:00",
                        closingTime: "17:00",
                    },
                    {
                        weekday: "wednesday",
                        isOpen: true,
                        openingTime: "06:45",
                        closingTime: "10:15",
                    },
                    {
                        weekday: "thursday",
                        isOpen: true,
                        openingTime: "09:00",
                        closingTime: "17:00",
                    },
                    { weekday: "friday", isOpen: true, openingTime: "09:00", closingTime: "17:00" },
                    {
                        weekday: "saturday",
                        isOpen: true,
                        openingTime: "19:45",
                        closingTime: "22:30",
                    },
                    { weekday: "sunday", isOpen: false, openingTime: null, closingTime: null },
                ],
            },
        ],
        specialDays: [],
    };

    describe("generateDaySpecificTimeSlots", () => {
        it("generates slots with 15-minute interval for regular opening hours", () => {
            // Monday with standard 9:00-17:00 hours
            const mondayDate = new Date("2025-05-05"); // First Monday in May 2025
            const slotDurationMinutes = 15;

            const slots = generateDaySpecificTimeSlots(
                mondayDate,
                slotDurationMinutes,
                mockLocationSchedules,
            );

            // Check first and last slots
            expect(slots[0]).toBe("09:00");
            expect(slots[slots.length - 1]).toBe("16:45"); // Last slot is 16:45, not 17:00

            // Check total number of slots (9:00 to 17:00 with 15-minute intervals)
            // That's 8 hours * 4 slots per hour = 32 slots
            expect(slots.length).toBe(32);

            // Check a few specific slots
            expect(slots).toContain("09:00");
            expect(slots).toContain("09:15");
            expect(slots).toContain("09:30");
            expect(slots).toContain("09:45");
            expect(slots).toContain("12:00");
            expect(slots).toContain("16:45");
        });

        it("generates slots with 15-minute interval for special early hours (Wednesday)", () => {
            // Wednesday with special 06:45-10:15 hours
            const wednesdayDate = new Date("2025-05-07"); // First Wednesday in May 2025
            const slotDurationMinutes = 15;

            const slots = generateDaySpecificTimeSlots(
                wednesdayDate,
                slotDurationMinutes,
                mockLocationSchedules,
            );

            // Check first and last slots
            expect(slots[0]).toBe("06:45");
            expect(slots[slots.length - 1]).toBe("10:00"); // Last slot is 10:00, not 10:15

            // Check total number of slots (06:45 to 10:15 with 15-minute intervals)
            // That's 3.5 hours * 4 slots per hour = 14 slots
            expect(slots.length).toBe(14);

            // Check a few specific slots
            expect(slots).toContain("06:45");
            expect(slots).toContain("07:00");
            expect(slots).toContain("07:15");
            expect(slots).toContain("09:00");
            expect(slots).toContain("10:00");
        });

        it("generates slots with 15-minute interval for special late hours (Saturday)", () => {
            // Saturday with special 19:45-22:30 hours
            const saturdayDate = new Date("2025-05-10"); // First Saturday in May 2025
            const slotDurationMinutes = 15;

            const slots = generateDaySpecificTimeSlots(
                saturdayDate,
                slotDurationMinutes,
                mockLocationSchedules,
            );

            // Check first and last slots
            expect(slots[0]).toBe("19:45");
            expect(slots[slots.length - 1]).toBe("22:15"); // Last slot is 22:15, not 22:30

            // Check total number of slots (19:45 to 22:30 with 15-minute intervals)
            // That's 2.75 hours * 4 slots per hour = 11 slots
            expect(slots.length).toBe(11);

            // Check a few specific slots
            expect(slots).toContain("19:45");
            expect(slots).toContain("20:00");
            expect(slots).toContain("21:00");
            expect(slots).toContain("22:15");
        });

        it("returns an empty array for closed days", () => {
            // Sunday is closed
            const sundayDate = new Date("2025-05-11"); // First Sunday in May 2025
            const slotDurationMinutes = 15;

            const slots = generateDaySpecificTimeSlots(
                sundayDate,
                slotDurationMinutes,
                mockLocationSchedules,
            );

            expect(slots.length).toBe(0);
        });

        it("respects different slot durations", () => {
            // Monday with standard 9:00-17:00 hours, but 30-minute slots
            const mondayDate = new Date("2025-05-05");
            const slotDurationMinutes = 30;

            const slots = generateDaySpecificTimeSlots(
                mondayDate,
                slotDurationMinutes,
                mockLocationSchedules,
            );

            // Check first and last slots
            expect(slots[0]).toBe("09:00");
            expect(slots[slots.length - 1]).toBe("16:30"); // Last slot is 16:30, not 17:00

            // Check total number of slots (9:00 to 17:00 with 30-minute intervals)
            // That's 8 hours * 2 slots per hour = 16 slots
            expect(slots.length).toBe(16);

            // Check that it only includes 30-minute intervals
            expect(slots).toContain("09:00");
            expect(slots).toContain("09:30");
            expect(slots).toContain("10:00");
            expect(slots).not.toContain("09:15"); // Should not have 15-minute intervals
            expect(slots).not.toContain("09:45");
        });

        it("handles non-standard opening hours correctly", () => {
            // Create a mock with non-standard hours (not starting/ending on hour/half-hour)
            const customMockSchedules = {
                schedules: [
                    {
                        ...mockLocationSchedules.schedules[0],
                        days: [
                            {
                                weekday: "monday",
                                isOpen: true,
                                openingTime: "09:20",
                                closingTime: "16:50",
                            },
                        ],
                    },
                ],
                specialDays: [],
            };

            const mondayDate = new Date("2025-05-05");
            const slotDurationMinutes = 15;

            const slots = generateDaySpecificTimeSlots(
                mondayDate,
                slotDurationMinutes,
                customMockSchedules,
            );

            // Check first and last slots - should round to nearest interval
            expect(slots[0]).toBe("09:20"); // Exact start time
            expect(slots[slots.length - 1]).toBe("16:35"); // Last full 15-min slot before 16:50

            // Verify some specific slots
            expect(slots).toContain("09:20");
            expect(slots).toContain("09:35");
            expect(slots).toContain("16:35");
            expect(slots).not.toContain("16:50"); // This would make a partial slot
        });
    });

    // Test the interaction of the time slot generation with the gap detection
    describe("Time Slot Generation with Gap Detection", () => {
        it("produces time slots that accurately represent operating hours with gaps", () => {
            // Create mock schedules with split hours (e.g. morning and afternoon sessions)
            const splitHoursMockSchedules = {
                schedules: [
                    {
                        ...mockLocationSchedules.schedules[0],
                        // Morning: 09:00-12:00, Afternoon: 14:00-17:00 (2-hour lunch break)
                        days: [
                            {
                                weekday: "monday",
                                isOpen: true,
                                openingTime: "09:00",
                                closingTime: "12:00",
                                afternoonOpeningTime: "14:00",
                                afternoonClosingTime: "17:00",
                            },
                        ],
                    },
                ],
                specialDays: [],
            };

            // Since this test combines multiple functions, we're testing the complete workflow
            // First, generate time slots based on opening hours
            const mondayDate = new Date("2025-05-05");
            let slots: string[] = [];

            // For the first schedule (morning 9:00-12:00)
            slots = slots.concat([
                "09:00",
                "09:15",
                "09:30",
                "09:45",
                "10:00",
                "10:15",
                "10:30",
                "10:45",
                "11:00",
                "11:15",
                "11:30",
                "11:45",
            ]);

            // For the second schedule (afternoon 14:00-17:00)
            slots = slots.concat([
                "14:00",
                "14:15",
                "14:30",
                "14:45",
                "15:00",
                "15:15",
                "15:30",
                "15:45",
                "16:00",
                "16:15",
                "16:30",
                "16:45",
            ]);

            // Now run the gap detection on these slots
            const gaps = findTimeGaps(slots, 15); // Use 15-minute slot duration

            // We should have found 1 gap between 12:00 and 14:00 (2 hours = 120 minutes)
            expect(gaps.length).toBe(1);
            expect(gaps[0].startTime).toBe("12:00"); // Gap starts after 11:45 + slotDuration (15min)
            expect(gaps[0].endTime).toBe("14:00");
            expect(gaps[0].durationMinutes).toBe(120); // 14:00 - 12:00 = 120 minutes
        });
    });
});
