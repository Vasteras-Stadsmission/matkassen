import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { notifications } from "@mantine/notifications";
import { SchedulesTab } from "../../../../app/[locale]/handout-locations/components/SchedulesTab";
import { createSchedule, deleteSchedule } from "../../../../app/[locale]/handout-locations/actions";
import { PickupLocationWithAllData } from "../../../../app/[locale]/handout-locations/types";
import { TestWrapper } from "../../../test-utils";

// Mock the actions
vi.mock("../../../../app/[locale]/handout-locations/actions", () => ({
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

// Mock the SchedulesList component for simpler testing
vi.mock("../../../../app/[locale]/handout-locations/components/schedules/SchedulesList", () => ({
    SchedulesList: ({ onCreateSchedule, onUpdateSchedule, onDeleteSchedule, schedules }: any) => (
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
            <button data-testid="delete-schedule" onClick={() => onDeleteSchedule("schedule-1")}>
                Delete Schedule
            </button>
        </div>
    ),
}));

const mockLocation: PickupLocationWithAllData = {
    id: "location-1",
    name: "Test Location",
    street_address: "123 Test St",
    postal_code: "12345",
    schedules: [
        {
            id: "schedule-1",
            name: "Existing Schedule",
            start_date: "2025-01-01",
            end_date: "2025-12-31",
            pickup_location_id: "location-1",
            days: [],
        },
    ],
    parcels_max_per_day: null,
    contact_name: null,
    contact_email: null,
    contact_phone_number: null,
    default_slot_duration_minutes: 15,
};

describe("SchedulesTab", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders schedules and handles state updates correctly", async () => {
        const onUpdated = vi.fn();

        render(<SchedulesTab location={mockLocation} onUpdated={onUpdated} />, {
            wrapper: TestWrapper,
        });

        // Check initial state
        expect(screen.getByTestId("schedules-list")).toBeDefined();
        expect(screen.getByTestId("schedule-count").textContent).toBe("1");
        expect(screen.queryByText("scheduleCreateError")).toBeNull(); // No error initially
        expect(screen.queryByText("sm")).toBeNull(); // No loader initially
    });

    it("handles successful schedule creation without flushSync", async () => {
        const onUpdated = vi.fn();
        const newSchedule = {
            id: "schedule-2",
            name: "Test Schedule",
            start_date: "2025-01-01",
            end_date: "2025-12-31",
            pickup_location_id: "location-1",
            days: [],
        };

        (createSchedule as any).mockResolvedValue(newSchedule);

        render(<SchedulesTab location={mockLocation} onUpdated={onUpdated} />, {
            wrapper: TestWrapper,
        });

        // Initial count should be 1
        expect(screen.getByTestId("schedule-count").textContent).toBe("1");

        // Trigger create action
        fireEvent.click(screen.getByTestId("create-schedule"));

        // Check that loading state appears
        await waitFor(() => {
            expect(screen.getByText("sm")).toBeDefined(); // Loader size
        });

        // Wait for the operation to complete
        await waitFor(() => {
            expect(screen.getByTestId("schedule-count").textContent).toBe("2");
        });

        // Verify the action was called correctly
        expect(createSchedule).toHaveBeenCalledWith("location-1", {
            name: "Test Schedule",
            start_date: "2025-01-01",
            end_date: "2025-12-31",
            days: [],
        });

        // Verify callback was called
        expect(onUpdated).toHaveBeenCalled();

        // Verify loading state is cleared
        expect(screen.queryByText("sm")).toBeNull();
    });

    it("handles schedule creation error without flushSync", async () => {
        const onUpdated = vi.fn();
        const error = new Error("Creation failed");

        (createSchedule as any).mockRejectedValue(error);

        render(<SchedulesTab location={mockLocation} onUpdated={onUpdated} />, {
            wrapper: TestWrapper,
        });

        // Trigger create action
        fireEvent.click(screen.getByTestId("create-schedule"));

        // Wait for error to appear
        await waitFor(() => {
            expect(screen.getByText("scheduleCreateError")).toBeDefined();
        });

        // Verify notifications.show was called
        expect(notifications.show).toHaveBeenCalledWith({
            title: "errorSaving",
            message: "scheduleCreateError",
            color: "red",
        });

        // Verify schedule count hasn't changed
        expect(screen.getByTestId("schedule-count").textContent).toBe("1");

        // Verify loading state is cleared
        expect(screen.queryByText("sm")).toBeNull();
    });

    it("handles successful schedule deletion without flushSync", async () => {
        const onUpdated = vi.fn();

        (deleteSchedule as any).mockResolvedValue(undefined);

        render(<SchedulesTab location={mockLocation} onUpdated={onUpdated} />, {
            wrapper: TestWrapper,
        });

        // Initial count should be 1
        expect(screen.getByTestId("schedule-count").textContent).toBe("1");

        // Trigger delete action
        fireEvent.click(screen.getByTestId("delete-schedule"));

        // Wait for the operation to complete
        await waitFor(() => {
            expect(screen.getByTestId("schedule-count").textContent).toBe("0");
        });

        // Verify the action was called correctly
        expect(deleteSchedule).toHaveBeenCalledWith("schedule-1");

        // Verify callback was called
        expect(onUpdated).toHaveBeenCalled();

        // Verify success notification was shown
        expect(notifications.show).toHaveBeenCalledWith({
            title: "locationDeleted",
            message: "scheduleDeleteError",
            color: "green",
        });
    });

    it("updates schedules when location prop changes without flushSync", async () => {
        const onUpdated = vi.fn();
        const { rerender } = render(
            <SchedulesTab location={mockLocation} onUpdated={onUpdated} />,
            { wrapper: TestWrapper },
        );

        // Initial count should be 1
        expect(screen.getByTestId("schedule-count").textContent).toBe("1");

        // Update location with different schedules
        const updatedLocation = {
            ...mockLocation,
            schedules: [
                ...mockLocation.schedules,
                {
                    id: "schedule-2",
                    name: "New Schedule",
                    start_date: "2025-06-01",
                    end_date: "2025-06-30",
                    pickup_location_id: "location-1",
                    days: [],
                },
            ],
        };

        rerender(<SchedulesTab location={updatedLocation} onUpdated={onUpdated} />);

        // Count should update to 2 without flushSync
        await waitFor(() => {
            expect(screen.getByTestId("schedule-count").textContent).toBe("2");
        });
    });

    it("clears error state when starting new operations without flushSync", async () => {
        const onUpdated = vi.fn();

        // First, cause an error
        (createSchedule as any).mockRejectedValue(new Error("First error"));

        render(<SchedulesTab location={mockLocation} onUpdated={onUpdated} />, {
            wrapper: TestWrapper,
        });

        // Trigger create action to cause error
        fireEvent.click(screen.getByTestId("create-schedule"));

        // Wait for error to appear
        await waitFor(() => {
            expect(screen.getByText("scheduleCreateError")).toBeDefined();
        });

        // Now mock a successful operation
        (createSchedule as any).mockResolvedValue({
            id: "schedule-2",
            name: "Test Schedule",
            start_date: "2025-01-01",
            end_date: "2025-12-31",
            pickup_location_id: "location-1",
            days: [],
        });

        // Trigger another create action
        fireEvent.click(screen.getByTestId("create-schedule"));

        // Error should be cleared immediately when operation starts
        await waitFor(() => {
            expect(screen.queryByText("scheduleCreateError")).toBeNull();
        });
    });
});
