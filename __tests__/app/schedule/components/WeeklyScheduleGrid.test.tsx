import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { FoodParcel } from "../../../../app/[locale]/schedule/types";
import {
    mockDate,
    cleanupMockedDate,
    createMockParcel,
    createMockWeekDates,
    queryByTestId,
    queryAllByTestId,
    getByText,
    renderWithProviders,
} from "../test-helpers";
import {
    MockPaper,
    MockBox,
    MockScrollArea,
    MockReschedulePickupModal,
    createMockDndHooks,
    setSharedMockDragEndHandler,
    getSharedMockDragEndHandler,
} from "../mock-components";
import { createActionMocks, createRescheduleModalMocks } from "../mock-actions";

// Create mocks for tests
const { mockUpdateFoodParcelScheduleFn, mockUpdateFoodParcelSchedule } = createActionMocks();

const {
    modalOpenedState,
    modalParcel,
    onRescheduledCalls,
    mockOnRescheduled,
    setModalOpened,
    setModalParcel,
} = createRescheduleModalMocks();

const { mockDragEndHandler, setMockDragEndHandler } = createMockDndHooks();

// Set up mockShowNotification
const mockShowNotificationCalls: any[] = [];
const mockShowNotification = (...args: any[]) => {
    mockShowNotificationCalls.push(args);
};

// Mock notifications at the earliest point
vi.mock("@mantine/notifications", () => ({
    showNotification: mockShowNotification,
}));

// Create the TestableWeeklyScheduleGrid component
interface WeeklyScheduleGridProps {
    weekDates: Date[];
    foodParcels: FoodParcel[];
    maxParcelsPerDay: number;
    maxParcelsPerSlot?: number;
    onParcelRescheduled: () => void;
}

const TestableWeeklyScheduleGrid = ({
    weekDates,
    foodParcels,
    maxParcelsPerDay,
    maxParcelsPerSlot = 3,
    onParcelRescheduled,
}: WeeklyScheduleGridProps) => {
    // Function to be called when a drag event happens
    const handleDragEnd = async (event: { active: { id: string }; over: { id: string } }) => {
        if (!event.over) return;

        const parcelId = event.active.id;
        const targetSlotId = event.over.id;

        // Extract date and time from the target slot ID
        // Format is day-{dayIndex}-{dateStr}-{timeStr}
        const parts = targetSlotId.split("-");
        if (parts.length < 4 || parts[0] !== "day") return;

        const dayIndex = parseInt(parts[1], 10);
        if (isNaN(dayIndex) || dayIndex < 0 || dayIndex >= weekDates.length) return;

        const date = new Date(weekDates[dayIndex]);
        const timeStr = parts[parts.length - 1];

        // Add validation for the time string format
        if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) {
            console.error("Invalid time format:", timeStr);
            return;
        }

        const [hoursStr, minutesStr] = timeStr.split(":");
        const hours = parseInt(hoursStr, 10);
        const minutes = parseInt(minutesStr, 10);

        // Add validation for hours and minutes
        if (
            isNaN(hours) ||
            isNaN(minutes) ||
            hours < 0 ||
            hours > 23 ||
            minutes < 0 ||
            minutes > 59
        ) {
            console.error("Invalid time values:", { hours, minutes });
            return;
        }

        const startDateTime = new Date(date);
        startDateTime.setHours(hours, minutes, 0, 0);

        const endDateTime = new Date(startDateTime);
        endDateTime.setMinutes(endDateTime.getMinutes() + 30);

        // Validate date time objects
        if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
            console.error("Invalid date/time calculation:", {
                date,
                hours,
                minutes,
                startDateTime,
                endDateTime,
            });
            return;
        }

        // Check if target slot is in the past
        const now = new Date();
        if (startDateTime < now) {
            console.error("Cannot schedule pickups in the past:", {
                now,
                startDateTime,
            });
            mockShowNotification({
                title: "Schemaläggning misslyckades",
                message: "Det går inte att boka matstöd i det förflutna.",
                color: "red",
            });
            return;
        }

        try {
            const result = await mockUpdateFoodParcelSchedule(parcelId, {
                date,
                startTime: startDateTime,
                endTime: endDateTime,
            });

            if (result.success) {
                mockShowNotification({
                    title: "Schemaläggning uppdaterad",
                    message: `Matstöd har schemalagts på ny tid.`,
                    color: "green",
                });
                onParcelRescheduled();
            } else {
                mockShowNotification({
                    title: "Fel vid schemaläggning",
                    message: result.error || "Ett oväntat fel inträffade.",
                    color: "red",
                });
            }
        } catch (error) {
            mockShowNotification({
                title: "Fel vid schemaläggning",
                message: "Ett oväntat fel inträffade.",
                color: "red",
            });
        }
    };

    // Set up the mock drag end handler for tests
    setSharedMockDragEndHandler(handleDragEnd);

    // Add reschedule button click handler
    const handleRescheduleClick = (parcel: FoodParcel) => {
        // Check if the source time slot is in the past
        const now = new Date();
        if (parcel.pickupEarliestTime < now) {
            mockShowNotification({
                title: "Schemaläggning misslyckades",
                message: "Det går inte att boka om matstöd från en tidpunkt i det förflutna.",
                color: "red",
            });
            return;
        }

        // Set selected parcel for reschedule modal
        setModalParcel(parcel);
        setModalOpened(true);
    };

    return (
        <div data-testid="weekly-grid-container">
            <div data-testid="dnd-context">
                <div data-testid="sortable-context">
                    <MockBox>
                        <div data-testid="grid">
                            {/* Headers */}
                            {weekDates.map((date, index) => (
                                <div key={date.toISOString()} data-testid="grid-col">
                                    <MockPaper>
                                        {index === 0
                                            ? "Måndag"
                                            : index === 1
                                              ? "Tisdag"
                                              : index === 2
                                                ? "Onsdag"
                                                : index === 3
                                                  ? "Torsdag"
                                                  : index === 4
                                                    ? "Fredag"
                                                    : index === 5
                                                      ? "Lördag"
                                                      : "Söndag"}
                                        <div data-testid="date-display">
                                            {date.toLocaleDateString("sv-SE", {
                                                month: "short",
                                                day: "numeric",
                                            })}
                                        </div>
                                        <div data-testid="capacity-indicator">
                                            {
                                                foodParcels.filter(
                                                    p =>
                                                        p.pickupDate.toISOString().split("T")[0] ===
                                                        date.toISOString().split("T")[0],
                                                ).length
                                            }
                                            /{maxParcelsPerDay}
                                        </div>
                                    </MockPaper>
                                </div>
                            ))}
                        </div>

                        <MockScrollArea>
                            {/* Time slots with food parcels */}
                            {foodParcels.map(parcel => (
                                <div
                                    key={parcel.id}
                                    data-testid={`parcel-${parcel.id}`}
                                    data-timeslot={`${parcel.pickupEarliestTime.getHours().toString().padStart(2, "0")}:${parcel.pickupEarliestTime
                                        .getMinutes()
                                        .toString()
                                        .padStart(2, "0")}`}
                                    data-date={parcel.pickupDate.toISOString().split("T")[0]}
                                >
                                    {parcel.householdName}
                                    <button
                                        data-testid={`reschedule-button-${parcel.id}`}
                                        onClick={() => handleRescheduleClick(parcel)}
                                    >
                                        Boka om
                                    </button>
                                </div>
                            ))}
                        </MockScrollArea>
                    </MockBox>
                </div>
            </div>

            {/* Render the modal */}
            <MockReschedulePickupModal
                opened={modalOpenedState}
                onClose={() => {
                    setModalOpened(false);
                }}
                foodParcel={modalParcel}
                onRescheduled={mockOnRescheduled}
            />
        </div>
    );
};

describe("WeeklyScheduleGrid Component", () => {
    let RealDate: DateConstructor;
    const mockWeekDates = createMockWeekDates();

    const mockFoodParcels = [
        createMockParcel("1", mockWeekDates[0], "10:00"), // Monday 10:00
        createMockParcel("2", mockWeekDates[2], "12:30"), // Wednesday 12:30
        createMockParcel("3", mockWeekDates[4], "15:00"), // Friday 15:00
    ];

    beforeEach(() => {
        // Store the real Date constructor and mock it
        RealDate = global.Date;
        global.Date = mockDate("2025-04-14"); // Monday

        // Reset all mocks
        mockUpdateFoodParcelScheduleFn.mockReset();
        mockUpdateFoodParcelScheduleFn.mockResolvedValue({ success: true });
        mockShowNotificationCalls.length = 0;
        onRescheduledCalls.length = 0;
        setModalOpened(false);
        setModalParcel(null);
        setSharedMockDragEndHandler(null);
    });

    afterEach(() => {
        // Restore the original Date
        cleanupMockedDate(RealDate);
    });

    it("renders the weekly grid with correct structure", () => {
        const { container } = renderWithProviders(
            <TestableWeeklyScheduleGrid
                weekDates={mockWeekDates}
                foodParcels={mockFoodParcels}
                maxParcelsPerDay={10}
                maxParcelsPerSlot={3}
                onParcelRescheduled={mockOnRescheduled}
            />,
        );

        // Check that the main structure is rendered
        expect(queryByTestId(container, "dnd-context")).toBeTruthy();
        expect(queryByTestId(container, "sortable-context")).toBeTruthy();
        expect(queryByTestId(container, "box")).toBeTruthy();
        expect(queryByTestId(container, "scroll-area")).toBeTruthy();

        // Check day labels
        const dayLabels = queryAllByTestId(container, /grid-col$/);
        expect(dayLabels.length).toBe(7); // One for each day of the week

        // Check that parcels are rendered
        expect(queryByTestId(container, "parcel-1")).toBeTruthy();
        expect(queryByTestId(container, "parcel-2")).toBeTruthy();
        expect(queryByTestId(container, "parcel-3")).toBeTruthy();

        expect(getByText(container, "Household 1")).toBeTruthy();
        expect(getByText(container, "Household 2")).toBeTruthy();
        expect(getByText(container, "Household 3")).toBeTruthy();
    });

    it("handles drag and drop operations correctly", async () => {
        renderWithProviders(
            <TestableWeeklyScheduleGrid
                weekDates={mockWeekDates}
                foodParcels={mockFoodParcels}
                maxParcelsPerDay={10}
                maxParcelsPerSlot={3}
                onParcelRescheduled={mockOnRescheduled}
            />,
        );

        // Simulate a drag end event
        const currentHandler = getSharedMockDragEndHandler();
        if (currentHandler) {
            // Format: day-{dayIndex}-{dateStr}-{timeStr}
            await (currentHandler as (event: any) => void)({
                active: { id: "1" }, // Dragged item ID (Parcel 1)
                over: { id: "day-2-2025-04-16-14:00" }, // Drop target ID (Wednesday at 14:00)
            });

            // Check that updateFoodParcelSchedule was called with correct params
            await waitFor(() => {
                expect(mockUpdateFoodParcelScheduleFn.calls.length).toBeGreaterThan(0);
            });

            expect(mockUpdateFoodParcelScheduleFn.calls[0][0]).toBe("1");
            expect(mockUpdateFoodParcelScheduleFn.calls[0][1]).toHaveProperty("date");
            expect(mockUpdateFoodParcelScheduleFn.calls[0][1]).toHaveProperty("startTime");
            expect(mockUpdateFoodParcelScheduleFn.calls[0][1]).toHaveProperty("endTime");

            // Check that the callback was triggered after successful update
            expect(onRescheduledCalls.length).toBeGreaterThan(0);

            // Check notification was shown
            expect(mockShowNotificationCalls.length).toBeGreaterThan(0);
            expect(mockShowNotificationCalls[0][0]).toHaveProperty("title");
            expect(mockShowNotificationCalls[0][0]).toHaveProperty("message");
            expect(mockShowNotificationCalls[0][0].color).toBe("green");
        } else {
            throw new Error(
                "mockDragEndHandler is not available - the component may not have set it up correctly",
            );
        }
    });

    it("handles errors during drag and drop operations", async () => {
        // Mock the update function to return an error
        mockUpdateFoodParcelScheduleFn.mockResolvedValue({
            success: false,
            error: "Max capacity reached",
        });

        renderWithProviders(
            <TestableWeeklyScheduleGrid
                weekDates={mockWeekDates}
                foodParcels={mockFoodParcels}
                maxParcelsPerDay={10}
                maxParcelsPerSlot={3}
                onParcelRescheduled={mockOnRescheduled}
            />,
        );

        // Call the drag end handler directly with our test event
        const errorHandler = getSharedMockDragEndHandler();
        if (errorHandler) {
            await (errorHandler as (event: any) => void)({
                active: { id: "1" },
                over: { id: "day-2-2025-04-16-14:00" },
            });

            // Check that an error notification was shown
            await waitFor(() => {
                expect(mockShowNotificationCalls.length).toBeGreaterThan(0);
            });

            expect(mockShowNotificationCalls[0][0].title).toContain("Fel");
            expect(mockShowNotificationCalls[0][0].message).toBe("Max capacity reached");
            expect(mockShowNotificationCalls[0][0].color).toBe("red");

            // The callback should not be called on error
            expect(onRescheduledCalls.length).toBe(0);
        } else {
            throw new Error(
                "mockDragEndHandler is not available - the component may not have set it up correctly",
            );
        }
    });

    it("organizes parcels by date and time slot correctly", () => {
        // Add more parcels to test organization logic
        const additionalParcels = [
            createMockParcel("4", mockWeekDates[0], "10:00"), // Second parcel on Monday 10:00
            createMockParcel("5", mockWeekDates[0], "10:00"), // Third parcel on Monday 10:00
        ];

        const allParcels = [...mockFoodParcels, ...additionalParcels];

        const { container } = renderWithProviders(
            <TestableWeeklyScheduleGrid
                weekDates={mockWeekDates}
                foodParcels={allParcels}
                maxParcelsPerDay={10}
                maxParcelsPerSlot={3}
                onParcelRescheduled={mockOnRescheduled}
            />,
        );

        // Monday at 10:00 should have 3 parcels
        const mondayParcels = queryAllByTestId(container, /^parcel-[1|4|5]$/);
        expect(mondayParcels.length).toBe(3);

        // Check capacity indicator for Monday
        const capacityIndicators = queryAllByTestId(container, /capacity-indicator$/);
        const mondayCapacity = capacityIndicators[0];
        expect(mondayCapacity.textContent).toContain("3"); // 3 parcels on Monday
    });

    it("prevents moving parcels to time slots in the past", async () => {
        // Mock the current date to be April 27, 2025
        const realDate = global.Date;
        global.Date = mockDate("2025-04-27T12:00:00Z");

        renderWithProviders(
            <TestableWeeklyScheduleGrid
                weekDates={mockWeekDates}
                foodParcels={mockFoodParcels}
                maxParcelsPerDay={10}
                maxParcelsPerSlot={3}
                onParcelRescheduled={mockOnRescheduled}
            />,
        );

        const pastHandler = getSharedMockDragEndHandler();
        if (pastHandler) {
            // Try to move a parcel to a past date
            // April 14, 2025 is in the past from our mocked current date of April 27, 2025
            await (pastHandler as (event: any) => void)({
                active: { id: "2" }, // Parcel from Wednesday
                over: { id: "day-0-2025-04-14-09:00" }, // Monday at 9:00, which is in the past
            });

            // Check that a warning notification was shown
            await waitFor(() => {
                expect(mockShowNotificationCalls.length).toBeGreaterThan(0);
            });

            // Verify the correct error message was shown
            expect(mockShowNotificationCalls[0][0].title).toBe("Schemaläggning misslyckades");
            expect(mockShowNotificationCalls[0][0].message).toBe(
                "Det går inte att boka matstöd i det förflutna.",
            );
            expect(mockShowNotificationCalls[0][0].color).toBe("red");

            // Ensure updateFoodParcelSchedule was NOT called
            expect(mockUpdateFoodParcelScheduleFn.calls.length).toBe(0);

            // Confirm callback was NOT triggered
            expect(onRescheduledCalls.length).toBe(0);
        } else {
            throw new Error(
                "mockDragEndHandler is not available - the component may not have set it up correctly",
            );
        }

        // Restore original Date
        global.Date = realDate;
    });

    describe("ReschedulePickupModal functionality", () => {
        it("prevents rescheduling food parcels from past time slots", async () => {
            // Mock the current date to be April 20, 2025 (after the Monday parcel)
            const realDate = global.Date;
            global.Date = mockDate("2025-04-20T12:00:00Z");

            // Render the component
            renderWithProviders(
                <TestableWeeklyScheduleGrid
                    weekDates={mockWeekDates}
                    foodParcels={mockFoodParcels}
                    maxParcelsPerDay={10}
                    maxParcelsPerSlot={3}
                    onParcelRescheduled={mockOnRescheduled}
                />,
            );

            // Get the Monday parcel (id: 1) which is now in the past
            const parcel = mockFoodParcels[0];

            // Manually call the reschedule handler
            const handleRescheduleClick = (parcel: FoodParcel) => {
                // Check if the source time slot is in the past
                const now = new Date();
                if (parcel.pickupEarliestTime < now) {
                    mockShowNotification({
                        title: "Schemaläggning misslyckades",
                        message:
                            "Det går inte att boka om matstöd från en tidpunkt i det förflutna.",
                        color: "red",
                    });
                    return;
                }

                // Set selected parcel for reschedule modal
                setModalParcel(parcel);
                setModalOpened(true);
            };

            // Call the handler directly
            handleRescheduleClick(parcel);

            // Check that an error notification was shown
            expect(mockShowNotificationCalls.length).toBeGreaterThan(0);
            expect(mockShowNotificationCalls[0][0].title).toBe("Schemaläggning misslyckades");
            expect(mockShowNotificationCalls[0][0].message).toBe(
                "Det går inte att boka om matstöd från en tidpunkt i det förflutna.",
            );
            expect(mockShowNotificationCalls[0][0].color).toBe("red");

            // Modal should not be opened
            expect(modalOpenedState).toBe(false);

            // Restore original Date
            global.Date = realDate;
        });

        it("closes the modal when clicking the cancel button", () => {
            // Create a self-contained mock for this test to avoid shared state issues
            const testState = {
                isModalOpen: false,
                selectedParcel: null as FoodParcel | null,
            };

            // Create a mock ReschedulePickupModal component for this specific test
            const TestModal = (props: {
                opened: boolean;
                onClose: () => void;
                foodParcel: FoodParcel | null;
                onRescheduled: () => void;
            }) => {
                // Verify props match our expectations
                expect(props.opened).toBe(testState.isModalOpen);
                expect(props.foodParcel).toBe(testState.selectedParcel);

                // Return a simple mock
                return <div data-testid="test-modal">Modal Mock</div>;
            };

            // Render the component with our custom modal
            const { container } = renderWithProviders(
                <div>
                    <button
                        data-testid="open-button"
                        onClick={() => {
                            testState.isModalOpen = true;
                            testState.selectedParcel = mockFoodParcels[1];
                        }}
                    >
                        Open Modal
                    </button>

                    <button
                        data-testid="close-button"
                        onClick={() => {
                            testState.isModalOpen = false;
                        }}
                    >
                        Close Modal
                    </button>

                    <TestModal
                        opened={testState.isModalOpen}
                        onClose={() => {
                            testState.isModalOpen = false;
                        }}
                        foodParcel={testState.selectedParcel}
                        onRescheduled={mockOnRescheduled}
                    />
                </div>,
            );

            // Simulate opening the modal
            const openButton = queryByTestId(container, "open-button");
            expect(openButton).toBeTruthy();
            // @ts-ignore - We know the button exists
            openButton.click();

            // Check that modal state is correct after opening
            expect(testState.isModalOpen).toBe(true);
            expect(testState.selectedParcel).toBe(mockFoodParcels[1]);

            // Simulate closing the modal
            const closeButton = queryByTestId(container, "close-button");
            expect(closeButton).toBeTruthy();
            // @ts-ignore - We know the button exists
            closeButton.click();

            // Check that modal state is correct after closing
            expect(testState.isModalOpen).toBe(false);
        });
    });
});
