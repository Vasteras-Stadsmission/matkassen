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
    /** Maximum parcels per slot. null = no limit */
    maxParcelsPerSlot: number | null;
    isOverCapacity?: boolean;
    dayIndex?: number;
}

// Create the TimeSlotCell implementation for testing
const TimeSlotCell = ({
    date,
    time,
    parcels,
    maxParcelsPerSlot,
    isOverCapacity = false,
    dayIndex = 0,
}: TimeSlotCellProps) => {
    // Check if the time slot is in the past using our mocked utility
    const isPast = mockIsPastTimeSlot;

    // Setup droppable container with day index included
    const { setNodeRef, isOver } = mockUseDroppable({
        id: `day-${dayIndex}-${date.toISOString().split("T")[0]}-${time}`,
        disabled: isPast, // Disable dropping on past time slots
    });

    // Determine background color based on capacity, hover state, and past status
    const getBgColor = () => {
        if (isPast) return "gray.2"; // Grey out past time slots
        if (isOver) return "blue.0";
        if (isOverCapacity) return "red.0";
        // null = no limit, so never show approaching-capacity warning
        if (maxParcelsPerSlot !== null && parcels.length >= maxParcelsPerSlot * 0.75) return "yellow.0";
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
                    <MockPickupCard key={parcel.id} foodParcel={parcel} isCompact={true} />
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
            <TimeSlotCell
                date={new Date(mockDateStr)}
                time={mockTime}
                parcels={[]}
                maxParcelsPerSlot={4}
            />,
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
            <TimeSlotCell
                date={new Date(mockDateStr)}
                time={mockTime}
                parcels={mockParcels}
                maxParcelsPerSlot={4}
            />,
        );

        expect(queryByTestId(container, "pickup-card-1")).toBeTruthy();
        expect(queryByTestId(container, "pickup-card-2")).toBeTruthy();
        expect(getByText(container, "Household 1")).toBeTruthy();
        expect(getByText(container, "Household 2")).toBeTruthy();
    });

    it("changes background color based on capacity", () => {
        const mockParcels = Array(3)
            .fill(0)
            .map((_, i) => createMockParcel(`${i}`, new Date(mockDateStr), mockTime));

        // Test at 75% capacity (3/4)
        const { container: container1 } = renderWithProviders(
            <TimeSlotCell
                date={new Date(mockDateStr)}
                time={mockTime}
                parcels={mockParcels}
                maxParcelsPerSlot={4}
            />,
        );

        const paper1 = queryByTestId(container1, "paper");
        expect(paper1).toBeTruthy();
        expect(paper1?.getAttribute("data-bg")).toBe("yellow.0");

        // Test over capacity
        const { container: container2 } = renderWithProviders(
            <TimeSlotCell
                date={new Date(mockDateStr)}
                time={mockTime}
                parcels={mockParcels}
                maxParcelsPerSlot={2}
                isOverCapacity={true}
            />,
        );

        const paper2 = queryByTestId(container2, "paper");
        expect(paper2).toBeTruthy();
        expect(paper2?.getAttribute("data-bg")).toBe("red.0");
    });

    it("changes background color when hovering during drag", () => {
        // Set mock isOver value to true to simulate hover state
        setMockIsOver(true);

        const { container } = renderWithProviders(
            <TimeSlotCell
                date={new Date(mockDateStr)}
                time={mockTime}
                parcels={[]}
                maxParcelsPerSlot={4}
            />,
        );

        const paper = queryByTestId(container, "paper");
        expect(paper).toBeTruthy();
        expect(paper?.getAttribute("data-bg")).toBe("blue.0");
    });

    it("applies past time slot styling", () => {
        // Set mock isPastTimeSlot value to true
        mockIsPastTimeSlot = true;

        const { container } = renderWithProviders(
            <TimeSlotCell
                date={new Date(mockDateStr)}
                time={mockTime}
                parcels={[]}
                maxParcelsPerSlot={4}
            />,
        );

        const paper = queryByTestId(container, "paper");
        expect(paper).toBeTruthy();
        expect(paper?.getAttribute("data-bg")).toBe("gray.2");

        // We still need to verify these style properties
        const style = paper?.style;
        expect(style?.opacity).toBe("0.7");
        expect(style?.cursor).toBe("not-allowed");
    });

    it("does not show capacity warning when maxParcelsPerSlot is null (no limit)", () => {
        // Create many parcels that would normally exceed any limit
        const mockParcels = Array(10)
            .fill(0)
            .map((_, i) => createMockParcel(`${i}`, new Date(mockDateStr), mockTime));

        const { container } = renderWithProviders(
            <TimeSlotCell
                date={new Date(mockDateStr)}
                time={mockTime}
                parcels={mockParcels}
                maxParcelsPerSlot={null} // null = no limit
            />,
        );

        const paper = queryByTestId(container, "paper");
        expect(paper).toBeTruthy();
        // Should be white (no warning) even with 10 parcels, because null means no limit
        expect(paper?.getAttribute("data-bg")).toBe("white");
    });

    it("shows over capacity warning with explicit limit even with many parcels", () => {
        // Contrast test: with a limit set, 10 parcels should show over capacity
        const mockParcels = Array(10)
            .fill(0)
            .map((_, i) => createMockParcel(`${i}`, new Date(mockDateStr), mockTime));

        const { container } = renderWithProviders(
            <TimeSlotCell
                date={new Date(mockDateStr)}
                time={mockTime}
                parcels={mockParcels}
                maxParcelsPerSlot={4} // explicit limit of 4
                isOverCapacity={true} // would be set by parent when over capacity
            />,
        );

        const paper = queryByTestId(container, "paper");
        expect(paper).toBeTruthy();
        // Should be red because isOverCapacity is true
        expect(paper?.getAttribute("data-bg")).toBe("red.0");
    });
});
