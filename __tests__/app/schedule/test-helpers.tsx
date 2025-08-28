import { Window } from "happy-dom";
import { vi } from "vitest";
import React, { ReactNode } from "react";
import { render, RenderOptions, RenderResult } from "@testing-library/react";
import { FoodParcel } from "../../../app/[locale]/schedule/types";

// Set up happy-dom for all tests
const setupHappyDOM = () => {
    const window = new Window();
    global.document = window.document as unknown as Document;
    global.window = window as unknown as any;
    global.navigator = window.navigator as unknown as Navigator;
};

// Set up the DOM environment once
setupHappyDOM();

// Mock date for testing
export const mockDate = (targetDate: string | Date): DateConstructor => {
    const RealDate = global.Date;
    const mockDateObj = typeof targetDate === "string" ? new Date(targetDate) : targetDate;

    // Create a custom Date constructor
    const CustomDate = class extends RealDate {
        constructor(...args: any[]) {
            if (args.length === 0) {
                // When called with no arguments, return the mocked date
                super(
                    mockDateObj.getFullYear(),
                    mockDateObj.getMonth(),
                    mockDateObj.getDate(),
                    mockDateObj.getHours(),
                    mockDateObj.getMinutes(),
                    mockDateObj.getSeconds(),
                    mockDateObj.getMilliseconds(),
                );
            } else if (args.length === 1) {
                super(args[0]);
            } else if (args.length === 2) {
                super(args[0], args[1]);
            } else if (args.length === 3) {
                super(args[0], args[1], args[2]);
            } else if (args.length === 4) {
                super(args[0], args[1], args[2], args[3]);
            } else if (args.length === 5) {
                super(args[0], args[1], args[2], args[3], args[4]);
            } else if (args.length === 6) {
                super(args[0], args[1], args[2], args[3], args[4], args[5]);
            } else if (args.length === 7) {
                super(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
            }

            // When called with specific dates we're testing, return fixed dates
            if (args.length === 1 && typeof args[0] === "string") {
                return new RealDate(args[0]);
            }
            // When called with year, month, day format
            if (args.length >= 3) {
                const [year, month, day, ...rest] = args;
                return new RealDate(
                    new RealDate(
                        year,
                        month,
                        day,
                        ...(rest as [number, number, number]),
                    ).toISOString(),
                );
            }
            // For any other case, pass through to the real Date
        }

        // Make sure static methods also work
        static now() {
            return mockDateObj.getTime();
        }
    } as unknown as DateConstructor;

    return CustomDate;
};

// Clean up mocked date
export const cleanupMockedDate = (originalDate: DateConstructor) => {
    global.Date = originalDate;
};

// Create mock food parcel for testing
export const createMockParcel = (
    id: string,
    date: Date,
    time: string,
    householdName: string = `Household ${id}`,
): FoodParcel => {
    const pickupDate = new Date(date);
    const [hours, minutes] = time.split(":").map(Number);

    const pickupEarliestTime = new Date(date);
    pickupEarliestTime.setHours(hours, minutes, 0, 0);

    const pickupLatestTime = new Date(pickupEarliestTime);
    pickupLatestTime.setMinutes(pickupLatestTime.getMinutes() + 30);

    return {
        id,
        householdId: `household-${id}`,
        householdName,
        pickupDate,
        pickupEarliestTime,
        pickupLatestTime,
        isPickedUp: false,
    };
};

// Create mock week dates for testing
export const createMockWeekDates = (startDate: string = "2025-04-14"): Date[] => {
    const firstDate = new Date(startDate); // Should be a Monday
    return Array(7)
        .fill(0)
        .map((_, index) => {
            const date = new Date(firstDate);
            date.setDate(date.getDate() + index);
            return date;
        });
};

// DOM querying helpers
export const queryByTestId = (container: HTMLElement, testId: string): HTMLElement | null => {
    return container.querySelector(`[data-testid="${testId}"]`);
};

export const queryAllByTestId = (container: HTMLElement, testIdPattern: RegExp): HTMLElement[] => {
    const elements = Array.from(container.querySelectorAll("[data-testid]"));
    return elements.filter(el =>
        testIdPattern.test(el.getAttribute("data-testid") || ""),
    ) as HTMLElement[];
};

export const getByText = (container: HTMLElement, text: string): HTMLElement => {
    const elements = Array.from(container.querySelectorAll("*"));
    // Make text matching more flexible with includes instead of exact match
    const element = elements.find(el => {
        const content = el.textContent || "";
        return content.includes(text);
    });
    if (!element) {
        throw new Error(`Text '${text}' not found in the container`);
    }
    return element as HTMLElement;
};

// Common mock notifications setup
export const createNotificationMocks = () => {
    const mockShowNotificationCalls: any[] = [];
    const mockShowNotification = (...args: any[]) => {
        mockShowNotificationCalls.push(args);
    };

    // Mock notifications module
    vi.mock("@mantine/notifications", () => ({
        showNotification: mockShowNotification,
    }));

    return {
        mockShowNotificationCalls,
        mockShowNotification,
    };
};

// Custom render function for schedule components
interface TestWrapperProps {
    children: ReactNode;
}

export const renderWithProviders = (
    ui: React.ReactElement,
    options?: Omit<RenderOptions, "wrapper">,
): RenderResult => {
    // Add provider wrappers here if needed
    const Wrapper = ({ children }: TestWrapperProps) => {
        return <>{children}</>;
    };

    return render(ui, { wrapper: Wrapper, ...options });
};
