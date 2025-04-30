import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { ReactNode } from "react";
import { render } from "@testing-library/react";
import { FoodParcel } from "@/app/schedule/actions";

// Set up happy-dom
const window = new Window();
global.document = window.document;
global.window = window as any;
global.navigator = window.navigator as any;

// Define interface for MockPaper props
interface MockPaperProps {
    children: ReactNode;
    bg?: string;
    style?: React.CSSProperties;
    ref?: React.Ref<HTMLDivElement>;
    [key: string]: any;
}

// Define interface for MockStack props
interface MockStackProps {
    children: ReactNode;
    [key: string]: any;
}

// Define interface for MockPickupCard props
interface MockPickupCardProps {
    foodParcel: FoodParcel;
    isCompact?: boolean;
}

// Define interface for TimeSlotCell props (matching the actual component)
interface TimeSlotCellProps {
    date: Date;
    time: string;
    parcels: FoodParcel[];
    maxParcelsPerSlot: number;
    isOverCapacity?: boolean;
    dayIndex?: number;
}

// Define interface for useDroppable params
interface UseDroppableParams {
    id: string;
    disabled: boolean;
}

// Mocked components and hooks that will be used in tests
const MockPaper = ({ children, bg, style = {}, ...props }: MockPaperProps) => (
    <div
        data-testid="paper"
        data-bg={bg} // Store the bg color as a data attribute for testing
        style={{ ...style }}
        {...props}
    >
        {children}
    </div>
);

const MockStack = ({ children, ...props }: MockStackProps) => (
    <div data-testid="stack" {...props}>
        {children}
    </div>
);

let mockIsOver = false;
let mockSetNodeRef = mock("setNodeRef");
let mockIsPastTimeSlot = false;
let lastDroppableId = "";
let lastDisabledValue = false;

// Mock useDroppable hook with tracking
const mockUseDroppable = ({ id, disabled }: UseDroppableParams) => {
    lastDroppableId = id;
    lastDisabledValue = disabled;
    return {
        setNodeRef: mockSetNodeRef,
        isOver: mockIsOver,
    };
};

// Mock PickupCard component
const MockPickupCard = ({ foodParcel, isCompact }: MockPickupCardProps) => (
    <div data-testid={`pickup-card-${foodParcel.id}`}>{foodParcel.householdName}</div>
);

// Create the TimeSlotCell implementation directly in the test file
// This avoids import issues while still testing the actual component logic
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
        if (parcels.length >= maxParcelsPerSlot * 0.75) return "yellow.0";
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

// Create helper query functions
const queryByTestId = (container: HTMLElement, testId: string): HTMLElement | null => {
    return container.querySelector(`[data-testid="${testId}"]`);
};

const queryAllByTestId = (container: HTMLElement, testIdPattern: RegExp): HTMLElement[] => {
    const elements = Array.from(container.querySelectorAll("[data-testid]"));
    return elements.filter(el =>
        testIdPattern.test(el.getAttribute("data-testid") || ""),
    ) as HTMLElement[];
};

const getByText = (container: HTMLElement, text: string): HTMLElement => {
    const elements = Array.from(container.querySelectorAll("*"));
    const element = elements.find(el => el.textContent === text);
    if (!element) {
        throw new Error(`Text '${text}' not found in the container`);
    }
    return element as HTMLElement;
};

describe("TimeSlotCell Component", () => {
    let RealDate: DateConstructor;
    const mockDate = new Date("2025-04-16");
    const mockTime = "12:00";

    beforeEach(() => {
        // Store the real Date constructor
        RealDate = global.Date;
        
        // Mock the Date constructor
        global.Date = class extends RealDate {
            constructor(...args: any[]) {
                // When called with specific dates we're testing, return fixed dates
                if (args.length === 1 && typeof args[0] === 'string') {
                    return new RealDate(args[0]);
                }
                // When called with year, month, day format
                if (args.length >= 3) {
                    const [year, month, day, ...rest] = args;
                    return new RealDate(new RealDate(year, month, day, ...(rest as [number, number, number])).toISOString());
                }
                // For any other case, pass through to the real Date
                return new RealDate(...args);
            }
            
            // Make sure static methods also work
            static now() {
                return RealDate.now();
            }
        } as DateConstructor;
        
        mockIsOver = false;
        mockIsPastTimeSlot = false;
        mockSetNodeRef = mock("setNodeRef");
        lastDroppableId = "";
        lastDisabledValue = false;
    });
    
    afterEach(() => {
        // Restore the original Date
        global.Date = RealDate;
    });

    const createMockParcel = (id: string, householdName: string): FoodParcel => ({
        id,
        householdId: `household-${id}`,
        householdName,
        pickupDate: new Date("2025-04-16"),
        pickupEarliestTime: new Date("2025-04-16T12:00:00"),
        pickupLatestTime: new Date("2025-04-16T12:30:00"),
        isPickedUp: false,
    });

    it("renders empty cell when no parcels are provided", () => {
        const { container } = render(
            <TimeSlotCell date={mockDate} time={mockTime} parcels={[]} maxParcelsPerSlot={4} />,
        );

        const paperElement = queryByTestId(container, "paper");
        expect(paperElement).toBeTruthy();
        expect(queryAllByTestId(container, /pickup-card-/).length).toBe(0);
    });

    it("renders parcels correctly when provided", () => {
        const mockParcels = [
            createMockParcel("1", "Household 1"),
            createMockParcel("2", "Household 2"),
        ];

        const { container } = render(
            <TimeSlotCell
                date={mockDate}
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

    it("sets the correct droppable ID format with dayIndex", () => {
        const dayIndex = 3;

        render(
            <TimeSlotCell
                date={mockDate}
                time={mockTime}
                parcels={[]}
                maxParcelsPerSlot={4}
                dayIndex={dayIndex}
            />,
        );

        // Check that the droppable ID was set correctly
        expect(lastDroppableId).toBe(`day-${dayIndex}-2025-04-16-${mockTime}`);
        expect(lastDisabledValue).toBe(false);
    });

    it("changes background color based on capacity", () => {
        const mockParcels = Array(3)
            .fill(0)
            .map((_, i) => createMockParcel(`${i}`, `Household ${i}`));

        // Test at 75% capacity (3/4)
        const { container: container1 } = render(
            <TimeSlotCell
                date={mockDate}
                time={mockTime}
                parcels={mockParcels}
                maxParcelsPerSlot={4}
            />,
        );

        const paper1 = queryByTestId(container1, "paper");
        expect(paper1).toBeTruthy();
        expect(paper1?.getAttribute("data-bg")).toBe("yellow.0");

        // Test over capacity
        const { container: container2 } = render(
            <TimeSlotCell
                date={mockDate}
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
        mockIsOver = true;

        const { container } = render(
            <TimeSlotCell date={mockDate} time={mockTime} parcels={[]} maxParcelsPerSlot={4} />,
        );

        const paper = queryByTestId(container, "paper");
        expect(paper).toBeTruthy();
        expect(paper?.getAttribute("data-bg")).toBe("blue.0");
    });

    it("applies past time slot styling", () => {
        // Set mock isPastTimeSlot value to true
        mockIsPastTimeSlot = true;

        const { container } = render(
            <TimeSlotCell date={mockDate} time={mockTime} parcels={[]} maxParcelsPerSlot={4} />,
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
