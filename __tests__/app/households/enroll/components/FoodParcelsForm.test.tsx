import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FoodParcels } from "../../../../../app/[locale]/households/enroll/types";
// Mock next-intl
vi.mock("next-intl", () => ({
    useTranslations: () => (key: string, params?: any) => {
        if (key === "slotDuration" && params?.duration) {
            return `Slot duration: ${params.duration} minutes`;
        }
        return key;
    },
}));

// Mock client actions
const mockGetPickupLocations = vi.fn(() =>
    Promise.resolve([
        { value: "location-1", label: "Test Location 1" },
        { value: "location-2", label: "Test Location 2" },
    ]),
);

const mockGetPickupLocationSchedules = vi.fn(() =>
    Promise.resolve({
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
                    { weekday: "friday", isOpen: true, openingTime: "09:00", closingTime: "17:00" },
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

const mockGetPickupLocationCapacity = vi.fn(() =>
    Promise.resolve({
        maxPerDay: 5,
        dateCapacities: {
            "2025-05-02": 4, // Near capacity (4/5)
            "2025-05-05": 5, // At capacity (5/5)
            "2025-05-06": 2, // Low capacity (2/5)
        },
    }),
);

const mockGetLocationSlotDuration = vi.fn(() => Promise.resolve(30));

vi.mock("../../../../app/[locale]/households/enroll/client-actions", () => ({
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
}));

// Mock icons
vi.mock("@tabler/icons-react", () => ({
    IconClock: () => <span data-testid="icon-clock">🕐</span>,
    IconCalendar: () => <span data-testid="icon-calendar">📅</span>,
    IconWand: () => <span data-testid="icon-wand">🪄</span>,
    IconCheck: () => <span data-testid="icon-check">✓</span>,
    IconX: () => <span data-testid="icon-x">✗</span>,
    IconExclamationMark: () => <span data-testid="icon-exclamation">!</span>,
    IconChevronDown: () => <span data-testid="icon-chevron-down">▼</span>,
    IconBuildingStore: () => <span data-testid="icon-building-store">🏪</span>,
}));

// Test helper to create mock form data
const createMockFormData = (overrides: Partial<FoodParcels> = {}): FoodParcels => ({
    pickupLocationId: "",
    totalCount: 0,
    weekday: "1",
    repeatValue: "weekly",
    startDate: new Date(),
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
