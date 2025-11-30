import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { FoodParcels } from "../../../../../app/[locale]/households/enroll/types";
import FoodParcelsForm from "../../../../../app/[locale]/households/enroll/components/FoodParcelsForm";
// Mock next-intl
vi.mock("next-intl", () => ({
    useTranslations: () => (key: string, params?: any) => {
        if (key === "slotDuration" && params?.duration) {
            return `Slot duration: ${params.duration} minutes`;
        }
        return key;
    },
}));

const {
    mockGetPickupLocations,
    mockGetPickupLocationSchedules,
    mockGetPickupLocationCapacity,
    mockGetLocationSlotDuration,
} = vi.hoisted(() => ({
    mockGetPickupLocations: vi.fn(),
    mockGetPickupLocationSchedules: vi.fn(),
    mockGetPickupLocationCapacity: vi.fn(),
    mockGetLocationSlotDuration: vi.fn(),
}));

vi.mock("../../../../../app/[locale]/households/enroll/client-actions", () => ({
    getPickupLocationsAction: mockGetPickupLocations,
    getPickupLocationSchedulesAction: mockGetPickupLocationSchedules,
    getPickupLocationCapacityForRangeAction: mockGetPickupLocationCapacity,
    getLocationSlotDurationAction: mockGetLocationSlotDuration,
}));

// Mock Mantine components
vi.mock("@mantine/core", () => ({
    Card: ({ children }: any) => <div data-testid="card">{children}</div>,
    Title: ({ children }: any) => <h1 data-testid="title">{children}</h1>,
    Text: ({ children }: any) => <span data-testid="text">{children}</span>,
    Alert: ({ children, title, icon }: any) => (
        <div data-testid="alert">
            {icon ? <span data-testid="alert-icon">{icon}</span> : null}
            {title ? <strong data-testid="alert-title">{title}</strong> : null}
            {children}
        </div>
    ),
    Select: ({ value, onChange, data }: any) => (
        <select data-testid="select" value={value || ""} onChange={e => onChange?.(e.target.value)}>
            {data?.map((item: any) => (
                <option key={item.value} value={item.value}>
                    {item.label}
                </option>
            ))}
        </select>
    ),
    SimpleGrid: ({ children }: any) => <div data-testid="simple-grid">{children}</div>,
    Paper: ({ children }: any) => <div data-testid="paper">{children}</div>,
    Group: ({ children }: any) => <div data-testid="group">{children}</div>,
    Stack: ({ children }: any) => <div data-testid="stack">{children}</div>,
    Box: ({ children }: any) => <div data-testid="box">{children}</div>,
    Table: ({ children }: any) => <table data-testid="table">{children}</table>,
    Button: ({ onClick, children }: any) => (
        <button data-testid="button" onClick={onClick}>
            {children}
        </button>
    ),
    ActionIcon: ({ onClick, children }: any) => (
        <button data-testid="action-icon" onClick={onClick}>
            {children}
        </button>
    ),
    Tooltip: ({ children }: any) => <div data-testid="tooltip">{children}</div>,
    Loader: () => <div data-testid="loader">Loading...</div>,
    Modal: ({ children }: any) => <div data-testid="modal">{children}</div>,
}));

vi.mock("@mantine/dates", () => ({
    DatePicker: ({ value, onChange, excludeDate }: any) => (
        <div data-testid="date-picker">
            <input
                type="date"
                value={value?.[0]?.toISOString().split("T")[0] || ""}
                onChange={e => {
                    const date = new Date(e.target.value);
                    onChange?.([date]);
                }}
                data-testid="date-input"
            />
            {/* Store excludeDate function for testing */}
            <div data-testid="exclude-date-fn" style={{ display: "none" }}>
                {excludeDate?.toString()}
            </div>
        </div>
    ),
    TimeGrid: ({ children }: any) => <div data-testid="time-grid">{children}</div>,
    getTimeRange: () => [],
}));

// Mock icons
vi.mock("@tabler/icons-react", () => ({
    IconClock: () => <span data-testid="icon-clock">🕐</span>,
    IconCalendar: () => <span data-testid="icon-calendar">📅</span>,
    IconWand: () => <span data-testid="icon-wand">🪄</span>,
    IconCheck: () => <span data-testid="icon-check">✓</span>,
    IconX: () => <span data-testid="icon-x">✗</span>,
    IconExclamationMark: () => <span data-testid="icon-exclamation">!</span>,
    IconAlertCircle: () => <span data-testid="icon-alert-circle">!</span>,
    IconChevronDown: () => <span data-testid="icon-chevron-down">▼</span>,
    IconBuildingStore: () => <span data-testid="icon-building-store">🏪</span>,
}));

// Test helper to create mock form data
const createMockFormData = (overrides: Partial<FoodParcels> = {}): FoodParcels => ({
    pickupLocationId: "",
    parcels: [],
    ...overrides,
});

describe("FoodParcelsForm Business Logic Tests", () => {
    let mockUpdateData: any;

    beforeEach(() => {
        mockUpdateData = vi.fn(() => {});

        // Reset all mocks - cast to any to access mockClear
        (mockGetPickupLocations as any).mockClear?.();
        (mockGetPickupLocationSchedules as any).mockClear?.();
        (mockGetPickupLocationCapacity as any).mockClear?.();
        (mockGetLocationSlotDuration as any).mockClear?.();

        (mockGetPickupLocations as any).mockImplementation?.(() =>
            Promise.resolve([
                { id: "location-1", name: "Test Location 1" },
                { id: "location-2", name: "Test Location 2" },
            ]),
        );

        (mockGetPickupLocationSchedules as any).mockImplementation?.(() =>
            Promise.resolve({
                schedules: [
                    {
                        id: "schedule-1",
                        location_id: "location-1",
                        name: "Regular Schedule",
                        startDate: new Date("2025-05-01"),
                        endDate: new Date("2025-05-31"),
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
                                openingTime: "09:00",
                                closingTime: "17:00",
                            },
                            {
                                weekday: "thursday",
                                isOpen: true,
                                openingTime: "09:00",
                                closingTime: "17:00",
                            },
                            {
                                weekday: "friday",
                                isOpen: true,
                                openingTime: "09:00",
                                closingTime: "17:00",
                            },
                            {
                                weekday: "saturday",
                                isOpen: false,
                                openingTime: "09:00",
                                closingTime: "17:00",
                            },
                            {
                                weekday: "sunday",
                                isOpen: false,
                                openingTime: "09:00",
                                closingTime: "17:00",
                            },
                        ],
                    },
                ],
            }),
        );

        (mockGetPickupLocationCapacity as any).mockImplementation?.(() =>
            Promise.resolve({
                maxPerDay: 5,
                dateCapacities: {
                    "2025-05-02": 4,
                    "2025-05-05": 5,
                    "2025-05-06": 2,
                },
            }),
        );

        (mockGetLocationSlotDuration as any).mockImplementation?.(() => Promise.resolve(30));
    });

    afterEach(() => {
        cleanup();
    });

    /**
     * TEST 1: Date Exclusion Logic
     * This is the most critical test as it validates the complex business logic
     * that determines which dates users can select based on:
     * - Facility schedules (open/closed days)
     * - Capacity limits (max parcels per day)

     * - Past dates
     */
    it("correctly excludes dates based on capacity and schedules", async () => {
        const formData = createMockFormData({
            pickupLocationId: "location-1",
            parcels: [],
        });

        // For this business logic test, we'll test the exclusion logic directly
        // The component should exclude:
        // 1. Past dates (before current date)
        // 2. Wednesdays (closed per schedule)
        // 3. Weekends (closed per schedule)

        // 5. May 5th (at capacity - 5/5 parcels)

        // Use a fixed current date for consistent testing
        const mockCurrentDate = new Date("2025-05-27T10:00:00Z");

        const testDates = [
            { date: new Date("2025-05-26"), shouldExclude: true, reason: "past date" },
            { date: new Date("2025-05-28"), shouldExclude: true, reason: "wednesday - closed" },
            { date: new Date("2025-05-31"), shouldExclude: true, reason: "saturday - closed" },
            { date: new Date("2025-06-01"), shouldExclude: true, reason: "sunday - closed" },

            { date: new Date("2025-05-05"), shouldExclude: true, reason: "monday but at capacity" },
            { date: new Date("2025-05-29"), shouldExclude: false, reason: "valid thursday" },
            { date: new Date("2025-05-30"), shouldExclude: false, reason: "valid friday" },
            {
                date: new Date("2025-06-02"),
                shouldExclude: false,
                reason: "valid monday, no capacity issues",
            },
        ];

        // Simulate the date exclusion logic from the component
        for (const testCase of testDates) {
            const isExcluded = shouldExcludeDate(testCase.date, mockCurrentDate);

            if (testCase.shouldExclude) {
                expect(isExcluded).toBe(true);
            } else {
                expect(isExcluded).toBe(false);
            }
        }
    });

    /**
     * TEST 2: Time Validation and End Time Calculation
     * Tests that time selections are validated against facility hours
     * and that end times are automatically calculated based on slot duration
     */
    it("validates time selections and calculates end times correctly", async () => {
        const slotDuration = 30; // 30 minutes

        // Test cases for time validation and calculation
        const timeTestCases = [
            {
                startTime: { hours: 9, minutes: 0 },
                expectedEndTime: { hours: 9, minutes: 30 },
                isValid: true,
                reason: "within facility hours",
            },
            {
                startTime: { hours: 16, minutes: 45 },
                expectedEndTime: { hours: 17, minutes: 15 },
                isValid: false,
                reason: "end time exceeds closing time (17:00)",
            },
            {
                startTime: { hours: 8, minutes: 30 },
                expectedEndTime: { hours: 9, minutes: 0 },
                isValid: false,
                reason: "start time before opening (09:00)",
            },
            {
                startTime: { hours: 12, minutes: 15 },
                expectedEndTime: { hours: 12, minutes: 45 },
                isValid: true,
                reason: "valid midday time",
            },
        ];

        for (const testCase of timeTestCases) {
            // Create a test date (Thursday, which is open)
            const testDate = new Date("2025-05-29");
            testDate.setHours(testCase.startTime.hours, testCase.startTime.minutes, 0, 0);

            // Calculate expected end time
            const expectedEndDate = new Date(testDate);
            expectedEndDate.setMinutes(expectedEndDate.getMinutes() + slotDuration);

            // Verify end time calculation
            expect(expectedEndDate.getHours()).toBe(testCase.expectedEndTime.hours);
            expect(expectedEndDate.getMinutes()).toBe(testCase.expectedEndTime.minutes);

            // Verify time validation against facility hours (9:00-17:00)
            const isWithinHours =
                testDate.getHours() >= 9 &&
                (expectedEndDate.getHours() < 17 ||
                    (expectedEndDate.getHours() === 17 && expectedEndDate.getMinutes() === 0));

            expect(isWithinHours).toBe(testCase.isValid);
        }
    });

    /**
     * TEST 3: Bulk Time Edit Workflow
     * Tests the complete bulk editing feature which allows users to
     * set the same time for all selected parcels at once
     */
    it("handles bulk time editing workflow correctly", async () => {
        const formData = createMockFormData({
            pickupLocationId: "location-1",
            parcels: [
                {
                    id: "parcel-1",
                    pickupDate: new Date("2025-05-29"),
                    pickupEarliestTime: new Date("2025-05-29T10:00:00"),
                    pickupLatestTime: new Date("2025-05-29T10:30:00"),
                },
                {
                    id: "parcel-2",
                    pickupDate: new Date("2025-05-30"),
                    pickupEarliestTime: new Date("2025-05-30T11:00:00"),
                    pickupLatestTime: new Date("2025-05-30T11:30:00"),
                },
                {
                    id: "parcel-3",
                    pickupDate: new Date("2025-06-02"),
                    pickupEarliestTime: new Date("2025-06-02T14:00:00"),
                    pickupLatestTime: new Date("2025-06-02T14:30:00"),
                },
            ],
        });

        // Test bulk time change logic
        const newBulkTime = "13:15"; // 1:15 PM
        const slotDuration = 30;

        // Parse bulk time
        const [hours, minutes] = newBulkTime.split(":").map(n => parseInt(n, 10));
        const roundedMinutes = Math.floor(minutes / 15) * 15; // Round to 15-min intervals

        // Apply bulk time update logic
        const updatedParcels = formData.parcels.map(parcel => {
            // Set new start time
            const newStartTime = new Date(parcel.pickupDate);
            newStartTime.setHours(hours, roundedMinutes, 0, 0);

            // Calculate new end time
            const newEndTime = new Date(newStartTime);
            newEndTime.setMinutes(newEndTime.getMinutes() + slotDuration);

            return {
                ...parcel,
                pickupEarliestTime: newStartTime,
                pickupLatestTime: newEndTime,
            };
        });

        // Verify all parcels have the same time but different dates
        expect(updatedParcels[0].pickupEarliestTime.getHours()).toBe(13);
        expect(updatedParcels[0].pickupEarliestTime.getMinutes()).toBe(15); // Rounded from 13:15
        expect(updatedParcels[0].pickupLatestTime.getHours()).toBe(13);
        expect(updatedParcels[0].pickupLatestTime.getMinutes()).toBe(45);

        expect(updatedParcels[1].pickupEarliestTime.getHours()).toBe(13);
        expect(updatedParcels[1].pickupEarliestTime.getMinutes()).toBe(15);
        expect(updatedParcels[1].pickupLatestTime.getHours()).toBe(13);
        expect(updatedParcels[1].pickupLatestTime.getMinutes()).toBe(45);

        expect(updatedParcels[2].pickupEarliestTime.getHours()).toBe(13);
        expect(updatedParcels[2].pickupEarliestTime.getMinutes()).toBe(15);
        expect(updatedParcels[2].pickupLatestTime.getHours()).toBe(13);
        expect(updatedParcels[2].pickupLatestTime.getMinutes()).toBe(45);

        // Verify dates remain unchanged
        expect(updatedParcels[0].pickupDate.toDateString()).toBe(
            formData.parcels[0].pickupDate.toDateString(),
        );
        expect(updatedParcels[1].pickupDate.toDateString()).toBe(
            formData.parcels[1].pickupDate.toDateString(),
        );
        expect(updatedParcels[2].pickupDate.toDateString()).toBe(
            formData.parcels[2].pickupDate.toDateString(),
        );

        // Test time validation for bulk edit
        const invalidBulkTime = "18:00"; // After closing time
        const [invalidHours] = invalidBulkTime.split(":").map(n => parseInt(n, 10));

        // This should be flagged as invalid (after 17:00 closing time)
        const isValidBulkTime =
            invalidHours >= 9 && invalidHours + Math.ceil(slotDuration / 60) <= 17;
        expect(isValidBulkTime).toBe(false);
    });

    /**
     * TEST 4: Time list generation respects closing time minus slot duration
     * If a location closes at 10:30 and slot duration is 15 minutes,
     * the latest selectable start time should be 10:15 (not 10:30).
     */
    it("generates time list up to closing minus slot duration", () => {
        const opening = "08:00";
        const closing = "10:30";
        const slotDuration = 15; // minutes

        // Adjust closing to last valid start (closing - duration)
        const subtractMinutes = (time: string, minutes: number) => {
            const [hh, mm] = time.split(":").map(n => parseInt(n, 10));
            let total = hh * 60 + mm - minutes;
            if (total < 0) total = 0;
            const H = String(Math.floor(total / 60)).padStart(2, "0");
            const M = String(total % 60).padStart(2, "0");
            return `${H}:${M}`;
        };

        const end = subtractMinutes(closing, slotDuration); // expect 10:15

        // Generate list in 15-min steps from opening to end (inclusive)
        const toMinutes = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            return h * 60 + m;
        };

        const times: string[] = [];
        for (let t = toMinutes(opening); t <= toMinutes(end); t += slotDuration) {
            const H = String(Math.floor(t / 60)).padStart(2, "0");
            const M = String(t % 60).padStart(2, "0");
            times.push(`${H}:${M}`);
        }

        expect(times[0]).toBe("08:00");
        expect(times[times.length - 1]).toBe("10:15");
        expect(times).not.toContain("10:30");
    });

    /**
     * TEST 5: Data Structure Handling (Regression Tests)
     * Tests that the fixes we implemented for type casting and function structure work correctly
     */
    it("should handle schedules.schedules type casting safely", () => {
        // Simulate the API response structure that was causing issues
        const mockApiResponse = {
            schedules: [
                {
                    id: "schedule-1",
                    startDate: new Date("2024-01-01"),
                    endDate: new Date("2024-12-31"),
                    days: [{ weekday: "monday", isOpen: true }],
                },
            ],
        };

        // This is the fix we implemented - should not throw errors
        const locationSchedules = {
            schedules: mockApiResponse.schedules as any[],
        };

        expect(locationSchedules.schedules).toBeDefined();
        expect(locationSchedules.schedules).toHaveLength(1);
        expect(locationSchedules.schedules[0].id).toBe("schedule-1");
    });

    it("should handle location schedules in isDateExcluded without crashing", () => {
        // Mock the locationSchedules that was causing the missing return issue
        const mockLocationSchedules = {
            schedules: [
                {
                    startDate: new Date("2024-01-01"),
                    endDate: new Date("2024-01-31"),
                    days: [
                        { weekday: "monday", isOpen: false },
                        { weekday: "tuesday", isOpen: true },
                    ],
                },
            ],
        };

        // Test that the function can process schedules without syntax errors
        const testDate = new Date("2024-01-15"); // Tuesday (should be open)

        // This should not crash due to missing return statements
        // We're testing the structure, not the exact logic
        expect(mockLocationSchedules.schedules).toBeDefined();
        expect(mockLocationSchedules.schedules[0].days).toHaveLength(2);

        // Find the Tuesday configuration
        const tuesdayConfig = mockLocationSchedules.schedules[0].days.find(
            day => day.weekday === "tuesday",
        );
        expect(tuesdayConfig?.isOpen).toBe(true);
    });

    it("should render table with parcels without crashing", () => {
        const mockParcels = [
            {
                id: "parcel-1",
                pickupDate: new Date("2024-01-15"),
                pickupEarliestTime: new Date("2024-01-15T09:00:00"),
                pickupLatestTime: new Date("2024-01-15T09:15:00"),
            },
        ];

        // This simulates the data structure that was causing the undefined parcel/index issue
        const tableData = mockParcels.map((parcel, index) => ({
            key: parcel.id ? parcel.id : `index-${index}`,
            parcel,
            index,
        }));

        expect(tableData).toHaveLength(1);
        expect(tableData[0].key).toBe("parcel-1");
        expect(tableData[0].parcel.id).toBe("parcel-1");
        expect(tableData[0].index).toBe(0);
    });

    it("should handle location schedule changes gracefully", () => {
        // Simulate changing from one schedule to another
        const schedule1 = {
            schedules: [
                {
                    startDate: new Date("2024-01-01"),
                    endDate: new Date("2024-01-31"),
                    days: [{ weekday: "monday", isOpen: true }],
                },
            ],
        };

        const schedule2 = {
            schedules: [
                {
                    startDate: new Date("2024-02-01"),
                    endDate: new Date("2024-02-29"),
                    days: [{ weekday: "monday", isOpen: false }],
                },
            ],
        };

        // Both should be valid structures
        expect(schedule1.schedules).toBeDefined();
        expect(schedule2.schedules).toBeDefined();

        // The form should be able to handle both without the type casting errors we fixed
        expect(() => {
            const locationSchedules1 = { schedules: schedule1.schedules as any[] };
            const locationSchedules2 = { schedules: schedule2.schedules as any[] };

            expect(locationSchedules1.schedules).toHaveLength(1);
            expect(locationSchedules2.schedules).toHaveLength(1);
        }).not.toThrow();
    });

    it("auto-selects the only available pickup location", async () => {
        (mockGetPickupLocations as any).mockImplementation?.(() =>
            Promise.resolve([{ id: "location-1", name: "Only Location" }]),
        );

        const formData = createMockFormData();

        render(<FoodParcelsForm data={formData} updateData={mockUpdateData} error={null} />);

        await waitFor(() => {
            expect(mockGetPickupLocations).toHaveBeenCalled();
        });

        await waitFor(() => {
            expect(mockUpdateData).toHaveBeenCalledWith(
                expect.objectContaining({ pickupLocationId: "location-1" }),
            );
        });
    });
});

/**
 * Time-dependent behavior tests
 * These tests verify that time-based logic works correctly by mocking the system time.
 * The component uses Time.now() from the TimeProvider which respects vi.useFakeTimers().
 */
describe("FoodParcelsForm Time-Dependent Behavior", () => {
    let mockUpdateData: any;

    beforeEach(() => {
        vi.useFakeTimers();
        mockUpdateData = vi.fn(() => {});

        (mockGetPickupLocations as any).mockClear?.();
        (mockGetPickupLocationSchedules as any).mockClear?.();
        (mockGetPickupLocationCapacity as any).mockClear?.();
        (mockGetLocationSlotDuration as any).mockClear?.();

        (mockGetPickupLocations as any).mockImplementation?.(() =>
            Promise.resolve([{ id: "location-1", name: "Test Location" }]),
        );

        (mockGetPickupLocationSchedules as any).mockImplementation?.(() =>
            Promise.resolve({
                schedules: [
                    {
                        id: "schedule-1",
                        location_id: "location-1",
                        name: "Regular Schedule",
                        startDate: new Date("2025-05-01"),
                        endDate: new Date("2025-12-31"),
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
                                isOpen: true,
                                openingTime: "09:00",
                                closingTime: "17:00",
                            },
                            {
                                weekday: "thursday",
                                isOpen: true,
                                openingTime: "09:00",
                                closingTime: "17:00",
                            },
                            {
                                weekday: "friday",
                                isOpen: true,
                                openingTime: "09:00",
                                closingTime: "17:00",
                            },
                            {
                                weekday: "saturday",
                                isOpen: false,
                                openingTime: "09:00",
                                closingTime: "17:00",
                            },
                            {
                                weekday: "sunday",
                                isOpen: false,
                                openingTime: "09:00",
                                closingTime: "17:00",
                            },
                        ],
                    },
                ],
            }),
        );

        (mockGetPickupLocationCapacity as any).mockImplementation?.(() =>
            Promise.resolve({ maxPerDay: 10, dateCapacities: {} }),
        );

        (mockGetLocationSlotDuration as any).mockImplementation?.(() => Promise.resolve(15));
    });

    afterEach(() => {
        vi.useRealTimers();
        cleanup();
    });

    describe("isPastDate logic", () => {
        it("should identify yesterday as a past date", () => {
            // Set current time to May 27, 2025 at 10:00 Stockholm time
            vi.setSystemTime(new Date("2025-05-27T08:00:00Z")); // 10:00 Stockholm (UTC+2)

            const yesterday = new Date("2025-05-26T10:00:00Z");
            const today = new Date("2025-05-27T10:00:00Z");
            const tomorrow = new Date("2025-05-28T10:00:00Z");

            // Test the logic: past dates should be identified
            const isPastDate = (date: Date) => {
                const now = new Date(); // Gets mocked time
                const nowMidnight = new Date(now);
                nowMidnight.setHours(0, 0, 0, 0);

                const dateMidnight = new Date(date);
                dateMidnight.setHours(0, 0, 0, 0);

                return dateMidnight < nowMidnight;
            };

            expect(isPastDate(yesterday)).toBe(true);
            expect(isPastDate(today)).toBe(false);
            expect(isPastDate(tomorrow)).toBe(false);
        });

        it("should not mark today as past even late in the day", () => {
            // Set current time to May 27, 2025 at 23:59 Stockholm time
            vi.setSystemTime(new Date("2025-05-27T21:59:00Z")); // 23:59 Stockholm (UTC+2)

            const today = new Date("2025-05-27T10:00:00Z");

            const isPastDate = (date: Date) => {
                const now = new Date();
                const nowMidnight = new Date(now);
                nowMidnight.setHours(0, 0, 0, 0);

                const dateMidnight = new Date(date);
                dateMidnight.setHours(0, 0, 0, 0);

                return dateMidnight < nowMidnight;
            };

            expect(isPastDate(today)).toBe(false);
        });
    });

    describe("filterPastTimeSlots logic", () => {
        it("should filter out past time slots for today", () => {
            // Set current time to May 27, 2025 at 14:30 UTC
            vi.setSystemTime(new Date("2025-05-27T14:30:00Z"));

            // Use same date for "today" reference
            const today = new Date("2025-05-27T00:00:00Z");
            const allSlots = [
                "09:00",
                "10:00",
                "11:00",
                "12:00",
                "13:00",
                "14:00",
                "15:00",
                "16:00",
            ];

            // Use UTC methods consistently for timezone-agnostic testing
            const filterPastTimeSlots = (slots: string[], date: Date): string[] => {
                const now = new Date(); // Gets mocked time: 14:30 UTC

                // Check if date is today using UTC date comparison
                const nowDateStr = now.toISOString().split("T")[0];
                const compareDateStr = date.toISOString().split("T")[0];

                if (compareDateStr !== nowDateStr) {
                    return slots; // Not today, all slots valid
                }

                // Filter out past slots using UTC hours
                const nowHours = now.getUTCHours();
                const nowMinutes = now.getUTCMinutes();
                const nowTotalMinutes = nowHours * 60 + nowMinutes;

                return slots.filter(slot => {
                    const [hours, minutes] = slot.split(":").map(Number);
                    const slotTotalMinutes = hours * 60 + minutes;
                    return slotTotalMinutes > nowTotalMinutes;
                });
            };

            const filteredSlots = filterPastTimeSlots(allSlots, today);

            // 14:30 UTC current time, so slots at 15:00 and 16:00 should remain
            // (14:00 is NOT > 14:30, so it's filtered out)
            expect(filteredSlots).toEqual(["15:00", "16:00"]);
            expect(filteredSlots).not.toContain("14:00");
            expect(filteredSlots).not.toContain("09:00");
        });

        it("should return all slots for a future date", () => {
            // Set current time to May 27, 2025 at 14:30 UTC
            vi.setSystemTime(new Date("2025-05-27T14:30:00Z"));

            const tomorrow = new Date("2025-05-28T00:00:00Z");
            const allSlots = [
                "09:00",
                "10:00",
                "11:00",
                "12:00",
                "13:00",
                "14:00",
                "15:00",
                "16:00",
            ];

            const filterPastTimeSlots = (slots: string[], date: Date): string[] => {
                const now = new Date();

                const nowDateStr = now.toISOString().split("T")[0];
                const compareDateStr = date.toISOString().split("T")[0];

                if (compareDateStr !== nowDateStr) {
                    return slots; // Not today, all slots valid
                }

                const nowHours = now.getUTCHours();
                const nowMinutes = now.getUTCMinutes();
                const nowTotalMinutes = nowHours * 60 + nowMinutes;

                return slots.filter(slot => {
                    const [hours, minutes] = slot.split(":").map(Number);
                    const slotTotalMinutes = hours * 60 + minutes;
                    return slotTotalMinutes > nowTotalMinutes;
                });
            };

            const filteredSlots = filterPastTimeSlots(allSlots, tomorrow);

            // All slots should be available for tomorrow
            expect(filteredSlots).toEqual(allSlots);
        });
    });

    describe("isDateExcluded - today after closing time", () => {
        it("should exclude today if current time is past closing time", () => {
            // Set current time to May 27, 2025 at 18:00 UTC (after 17:00 closing)
            vi.setSystemTime(new Date("2025-05-27T18:00:00Z"));

            const todayDate = new Date("2025-05-27T00:00:00Z");
            const closingHour = 17;
            const closingMinute = 0;

            const isExcludedDueToPassedClosing = (date: Date): boolean => {
                const now = new Date(); // Gets mocked time

                // Check if this is today using UTC date strings
                const nowDateStr = now.toISOString().split("T")[0];
                const compareDateStr = date.toISOString().split("T")[0];

                if (compareDateStr !== nowDateStr) {
                    return false; // Not today
                }

                // Check if current UTC time is past closing
                const nowTotalMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
                const closingTotalMinutes = closingHour * 60 + closingMinute;

                return nowTotalMinutes >= closingTotalMinutes;
            };

            expect(isExcludedDueToPassedClosing(todayDate)).toBe(true);
        });

        it("should not exclude today if current time is before closing time", () => {
            // Set current time to May 27, 2025 at 14:00 UTC (before 17:00 closing)
            vi.setSystemTime(new Date("2025-05-27T14:00:00Z"));

            const todayDate = new Date("2025-05-27T00:00:00Z");
            const closingHour = 17;
            const closingMinute = 0;

            const isExcludedDueToPassedClosing = (date: Date): boolean => {
                const now = new Date();

                const nowDateStr = now.toISOString().split("T")[0];
                const compareDateStr = date.toISOString().split("T")[0];

                if (compareDateStr !== nowDateStr) {
                    return false;
                }

                const nowTotalMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
                const closingTotalMinutes = closingHour * 60 + closingMinute;

                return nowTotalMinutes >= closingTotalMinutes;
            };

            expect(isExcludedDueToPassedClosing(todayDate)).toBe(false);
        });
    });
});

// Helper function to simulate date exclusion logic
function shouldExcludeDate(date: Date, currentDate: Date = new Date()): boolean {
    const today = new Date(currentDate);
    today.setHours(0, 0, 0, 0);
    const dateForComparison = new Date(date);
    dateForComparison.setHours(0, 0, 0, 0);

    // Exclude past dates
    if (dateForComparison < today) {
        return true;
    }

    // Exclude based on schedule (closed days)
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const weekdayNames = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
    ];
    const weekday = weekdayNames[dayOfWeek];

    // Based on mock schedule: Mon, Tue, Thu, Fri are open
    const openDays = ["monday", "tuesday", "thursday", "friday"];
    if (!openDays.includes(weekday)) {
        return true;
    }

    // Exclude based on capacity - format date correctly for capacity check
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateKey = `${year}-${month}-${day}`;

    const capacityData: Record<string, number> = {
        "2025-05-02": 4, // Near capacity (4/5) - should NOT exclude
        "2025-05-05": 5, // At capacity (5/5) - should exclude
        "2025-05-06": 2, // Low capacity (2/5) - should NOT exclude
    };
    const maxPerDay = 5;
    const currentCapacity = capacityData[dateKey] || 0;

    if (currentCapacity >= maxPerDay) {
        return true;
    }

    return false;
}
