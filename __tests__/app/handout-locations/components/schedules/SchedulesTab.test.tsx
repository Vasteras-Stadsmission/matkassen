import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { notifications } from "@mantine/notifications";
import { SchedulesTab } from "../../../../../app/[locale]/handout-locations/components/schedules/SchedulesTab";
import {
    createSchedule,
    deleteSchedule,
} from "../../../../../app/[locale]/handout-locations/actions";
import {
    PickupLocationWithAllData,
    PickupLocationScheduleWithDays,
} from "../../../../../app/[locale]/handout-locations/types";
import { TestWrapper } from "../../../../test-utils";

// Mock the actions
vi.mock("../../../../../app/[locale]/handout-locations/actions", () => ({
    createSchedule: vi.fn(),
    updateSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
}));

// Mock the notifications
vi.mock("@mantine/notifications", () => ({
    notifications: {
        show: vi.fn(),
    },
}));

// Mock next-intl
vi.mock("next-intl", () => ({
    useTranslations: () => (key: string) => key,
}));

// Mock the deep-equal utility
vi.mock("../../../../../app/utils/deep-equal", () => ({
    objectsEqual: vi.fn((a, b) => JSON.stringify(a) === JSON.stringify(b)),
}));

// Mock the SchedulesList component
vi.mock("../../../../../app/[locale]/handout-locations/components/schedules/SchedulesList", () => ({
    SchedulesList: ({ schedules, onCreateSchedule, onUpdateSchedule, onDeleteSchedule }: any) => {
        return (
            <div data-testid="schedules-list">
                <div data-testid="schedule-count">{schedules.length}</div>
                <button
                    data-testid="create-schedule"
                    onClick={() =>
                        onCreateSchedule({
                            name: "Test Schedule",
                            start_date: "2025-01-01",
                            end_date: "2025-12-31",
                            days: [],
                        })
                    }
                >
                    Create Schedule
                </button>
                <button
                    data-testid="update-schedule"
                    onClick={() =>
                        onUpdateSchedule("schedule-1", {
                            name: "Updated Schedule",
                            start_date: "2025-01-01",
                            end_date: "2025-12-31",
                            days: [],
                        })
                    }
                >
                    Update Schedule
                </button>
                <button
                    data-testid="delete-schedule"
                    onClick={() => onDeleteSchedule("schedule-1")}
                >
                    Delete Schedule
                </button>
            </div>
        );
    },
}));

const actionSuccess = <T,>(data: T) => ({ success: true, data }) as const;
const actionFailure = (message: string) => ({
    success: false as const,
    error: { code: "TEST_ERROR", message },
});

describe("SchedulesTab", () => {
    const mockSchedule: PickupLocationScheduleWithDays = {
        id: "schedule-1",
        pickup_location_id: "location-1",
        name: "Test Schedule",
        start_date: "2025-01-01",
        end_date: "2025-12-31",
        days: [],
    };

    const mockLocation: PickupLocationWithAllData = {
        id: "location-1",
        name: "Test Location",
        street_address: "123 Test St",
        postal_code: "12345",
        parcels_max_per_day: 20,
        default_slot_duration_minutes: 15,
        contact_name: null,
        contact_email: null,
        contact_phone_number: null,
        outside_hours_count: 0,
        schedules: [mockSchedule],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset window.dispatchEvent spy
        vi.spyOn(window, "dispatchEvent").mockImplementation(() => true);
    });

    it("renders without crashing and shows schedules", () => {
        const { container } = render(
            <TestWrapper>
                <SchedulesTab location={mockLocation} />
            </TestWrapper>,
        );

        // Just check that something rendered
        expect(container.firstChild).toBeTruthy();
    });

    it("renders SchedulesList with correct props", () => {
        const onUpdated = vi.fn();
        const onLocationUpdated = vi.fn();

        const { container } = render(
            <TestWrapper>
                <SchedulesTab
                    location={mockLocation}
                    onUpdated={onUpdated}
                    onLocationUpdated={onLocationUpdated}
                />
            </TestWrapper>,
        );

        // Should find the mocked SchedulesList
        const schedulesList = container.querySelector('[data-testid="schedules-list"]');
        const scheduleCount = container.querySelector('[data-testid="schedule-count"]');

        expect(schedulesList).toBeTruthy();
        expect(scheduleCount?.textContent).toBe("1");
    });

    it("handles successful schedule creation", async () => {
        const onUpdated = vi.fn();
        const newSchedule = { ...mockSchedule, id: "schedule-2", name: "New Schedule" };

        (createSchedule as any).mockResolvedValue(actionSuccess(newSchedule));

        const { container } = render(
            <TestWrapper>
                <SchedulesTab location={mockLocation} onUpdated={onUpdated} />
            </TestWrapper>,
        );

        const createButton = container.querySelector(
            '[data-testid="create-schedule"]',
        ) as HTMLElement;
        expect(createButton).toBeTruthy();
        fireEvent.click(createButton);

        await waitFor(() => {
            expect(createSchedule).toHaveBeenCalledWith("location-1", {
                name: "Test Schedule",
                start_date: "2025-01-01",
                end_date: "2025-12-31",
                days: [],
            });
        });

        // Verify callback was called
        expect(onUpdated).toHaveBeenCalled();

        // Verify success notification
        expect(notifications.show).toHaveBeenCalledWith({
            title: "locationCreated",
            message: "Schedule created successfully",
            color: "green",
        });
    });

    it("handles schedule creation error", async () => {
        (createSchedule as any).mockResolvedValue(actionFailure("Creation failed"));

        const { container } = render(
            <TestWrapper>
                <SchedulesTab location={mockLocation} />
            </TestWrapper>,
        );

        const createButton = container.querySelector(
            '[data-testid="create-schedule"]',
        ) as HTMLElement;
        expect(createButton).toBeTruthy();
        fireEvent.click(createButton);

        // Wait for error to appear
        await waitFor(() => {
            expect(container.textContent).toContain("Creation failed");
        });

        // Verify no success notification was shown
        expect(notifications.show).not.toHaveBeenCalled();
    });

    it("shows loading state during operations", async () => {
        // Make createSchedule hang so we can test loading state
        let resolveCreate: (value: any) => void;
        const createPromise = new Promise(resolve => {
            resolveCreate = resolve;
        });
        (createSchedule as any).mockReturnValue(createPromise);

        const { container } = render(
            <TestWrapper>
                <SchedulesTab location={mockLocation} />
            </TestWrapper>,
        );

        const createButton = container.querySelector(
            '[data-testid="create-schedule"]',
        ) as HTMLElement;
        expect(createButton).toBeTruthy();
        fireEvent.click(createButton);

        // Should show loading overlay (look for the LoadingOverlay root class)
        await waitFor(() => {
            const loadingOverlay = container.querySelector(".mantine-LoadingOverlay-root");
            expect(loadingOverlay).toBeTruthy();
        });

        // Resolve the promise
        resolveCreate!(actionSuccess({ ...mockSchedule, id: "new-schedule" }));

        // Wait for loading to finish - just verify the operation completed
        await waitFor(() => {
            expect(notifications.show).toHaveBeenCalled();
        });
    });

    it("dispatches refresh events on delete", async () => {
        (deleteSchedule as any).mockResolvedValue(actionSuccess(undefined));

        const { container } = render(
            <TestWrapper>
                <SchedulesTab location={mockLocation} />
            </TestWrapper>,
        );

        const deleteButton = container.querySelector(
            '[data-testid="delete-schedule"]',
        ) as HTMLElement;
        expect(deleteButton).toBeTruthy();
        fireEvent.click(deleteButton);

        await waitFor(() => {
            // Check that both refresh events were dispatched
            expect(window.dispatchEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "refreshOutsideHoursCount",
                }),
            );
            expect(window.dispatchEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "refreshScheduleGrid",
                }),
            );
        });
    });
});
