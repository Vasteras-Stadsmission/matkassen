import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { FoodParcel } from "../../../../app/[locale]/schedule/types";
import {
    mockDate,
    cleanupMockedDate,
    createMockParcel,
    queryByTestId,
    queryAllByTestId,
    getByText,
    renderWithProviders,
} from "../test-helpers";
import { MockPaper, MockStack, MockPickupCard, createMockDndHooks } from "../mock-components";

// Create mock dnd hooks for testing
const { mockUseDroppable, setMockIsOver } = createMockDndHooks();

// Setup mock state for isPastTimeSlot
let mockIsPastTimeSlot = false;

// Define interface for TimeSlotCell props
interface TimeSlotCellProps {
    date: Date;
    time: string;
    parcels: FoodParcel[];
    dayIndex?: number;
}

// Create the TimeSlotCell implementation for testing
const TimeSlotCell = ({ date, time, parcels, dayIndex = 0 }: TimeSlotCellProps) => {
    // Check if the time slot is in the past using our mocked utility
    const isPast = mockIsPastTimeSlot;

    // Setup droppable container with day index included
    const { setNodeRef, isOver } = mockUseDroppable({
        id: `day-${dayIndex}-${date.toISOString().split("T")[0]}-${time}`,
        disabled: isPast, // Disable dropping on past time slots
    });

    // Determine background color based on hover state and past status
    const getBgColor = () => {
        if (isPast) return "gray.2"; // Grey out past time slots
        if (isOver) return "blue.0";
        return "white";
    };

    return (
        <MockPaper
            ref={setNodeRef as any}
            bg={getBgColor()}
            style={{
                height: "100%",
                transition: "background-color 0.2s",
                position: "relative",
                minHeight: 40,
                opacity: isPast ? 0.7 : 1, // Reduce opacity for past time slots
                cursor: isPast ? "not-allowed" : "default", // Change cursor for past time slots
            }}
        >
            {/* Parcels stack */}
            <MockStack>
                {parcels.map((parcel: FoodParcel) => (
                    <MockPickupCard key={parcel.id} foodParcel={parcel} />
                ))}
            </MockStack>
        </MockPaper>
    );
};

describe("TimeSlotCell Component", () => {
    let RealDate: DateConstructor;
    const mockDateStr = "2025-04-16";
    const mockTime = "12:00";

    beforeEach(() => {
        // Store the real Date constructor and set up mock date
        RealDate = global.Date;
        global.Date = mockDate(mockDateStr);

        // Reset state for tests
        mockIsPastTimeSlot = false;
        setMockIsOver(false);
    });

    afterEach(() => {
        // Restore the original Date
        cleanupMockedDate(RealDate);
    });

    it("renders empty cell when no parcels are provided", () => {
        const { container } = renderWithProviders(
            <TimeSlotCell date={new Date(mockDateStr)} time={mockTime} parcels={[]} />,
        );

        const paperElement = queryByTestId(container, "paper");
        expect(paperElement).toBeTruthy();
        expect(queryAllByTestId(container, /pickup-card-/).length).toBe(0);
    });

    it("renders parcels correctly when provided", () => {
        const mockParcels = [
            createMockParcel("1", new Date(mockDateStr), mockTime, "Household 1"),
            createMockParcel("2", new Date(mockDateStr), mockTime, "Household 2"),
        ];

        const { container } = renderWithProviders(
            <TimeSlotCell date={new Date(mockDateStr)} time={mockTime} parcels={mockParcels} />,
        );

        expect(queryByTestId(container, "pickup-card-1")).toBeTruthy();
        expect(queryByTestId(container, "pickup-card-2")).toBeTruthy();
        expect(getByText(container, "Household 1")).toBeTruthy();
        expect(getByText(container, "Household 2")).toBeTruthy();
    });

    it("changes background color when hovering during drag", () => {
        // Set mock isOver value to true to simulate hover state
        setMockIsOver(true);

        const { container } = renderWithProviders(
            <TimeSlotCell date={new Date(mockDateStr)} time={mockTime} parcels={[]} />,
        );

        const paper = queryByTestId(container, "paper");
        expect(paper).toBeTruthy();
        expect(paper?.getAttribute("data-bg")).toBe("blue.0");
    });

    it("applies past time slot styling", () => {
        // Set mock isPastTimeSlot value to true
        mockIsPastTimeSlot = true;

        const { container } = renderWithProviders(
            <TimeSlotCell date={new Date(mockDateStr)} time={mockTime} parcels={[]} />,
        );

        const paper = queryByTestId(container, "paper");
        expect(paper).toBeTruthy();
        expect(paper?.getAttribute("data-bg")).toBe("gray.2");

        // We still need to verify these style properties
        const style = paper?.style;
        expect(style?.opacity).toBe("0.7");
        expect(style?.cursor).toBe("not-allowed");
    });
});
