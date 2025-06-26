import { vi } from "vitest";
import { FoodParcel } from "../../../app/[locale]/schedule/actions";

// Create mocks for the updateFoodParcelSchedule action
export const createActionMocks = () => {
    const mockUpdateFoodParcelScheduleFn = {
        calls: [] as any[],
        mockReset() {
            this.calls = [];
        },
        mockResolvedValue: function (value: any) {
            this.result = value;
        },
        result: { success: true, error: undefined },
    };

    const mockUpdateFoodParcelSchedule = (...args: any[]) => {
        mockUpdateFoodParcelScheduleFn.calls.push(args);
        return Promise.resolve(mockUpdateFoodParcelScheduleFn.result);
    };

    // Mock the getLocationSlotDuration function
    const mockGetLocationSlotDuration = async (locationId: string) => {
        // Default to 15 minutes for tests
        return 15;
    };

    // Mock the getPickupLocationSchedules function
    const mockGetPickupLocationSchedules = async (locationId: string) => {
        // Return mock schedule data
        return {
            schedules: [
                {
                    id: "schedule-1",
                    name: "Test Schedule",
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
                            isOpen: true,
                            openingTime: "10:00",
                            closingTime: "16:00",
                        },
                        { weekday: "sunday", isOpen: false, openingTime: null, closingTime: null },
                    ],
                },
            ],
        };
    };

    // Mock the schedule actions module
    vi.mock("../../../app/schedule/actions", () => ({
        updateFoodParcelSchedule: mockUpdateFoodParcelSchedule,
        getLocationSlotDuration: mockGetLocationSlotDuration,
        getPickupLocationSchedules: mockGetPickupLocationSchedules,
    }));

    // Also mock the locale-specific version for tests that might use it
    vi.mock("../../../app/[locale]/schedule/actions", () => ({
        updateFoodParcelSchedule: mockUpdateFoodParcelSchedule,
        getLocationSlotDuration: mockGetLocationSlotDuration,
        getPickupLocationSchedules: mockGetPickupLocationSchedules,
        FoodParcel: {},
    }));

    return {
        mockUpdateFoodParcelScheduleFn,
        mockUpdateFoodParcelSchedule,
        mockGetLocationSlotDuration,
        mockGetPickupLocationSchedules,
    };
};

// Test utilities for ReschedulePickupModal
export const createRescheduleModalMocks = () => {
    // Use an object to store state so it can be mutated
    const state = {
        modalOpenedState: false,
        modalParcel: null as FoodParcel | null,
        onRescheduledCalls: [] as any[],
    };

    const mockOnRescheduled = (...args: any[]) => {
        state.onRescheduledCalls.push(args);
    };

    return {
        // Use getters to access the current state
        get modalOpenedState() {
            return state.modalOpenedState;
        },
        get modalParcel() {
            return state.modalParcel;
        },
        get onRescheduledCalls() {
            return state.onRescheduledCalls;
        },

        mockOnRescheduled,
        setModalOpened: (value: boolean) => {
            state.modalOpenedState = value;
        },
        setModalParcel: (parcel: FoodParcel | null) => {
            state.modalParcel = parcel;
        },
    };
};
