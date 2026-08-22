import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";
import { formatDateToYMD } from "@/app/utils/date-utils";
import WeeklyScheduleGrid from "@/app/[locale]/schedule/components/WeeklyScheduleGrid";

const { getPickupLocationSchedulesAction, translate } = vi.hoisted(() => ({
    getPickupLocationSchedulesAction: vi.fn(),
    translate: (key: string, params?: Record<string, unknown>) => {
        if (key === "capacity.overCapacityAria") {
            return `Food parcel limit exceeded: ${params?.booked} booked, max ${params?.limit}, ${params?.excess} more than max`;
        }
        return key;
    },
}));

vi.mock("@/app/[locale]/schedule/client-actions", () => ({
    getPickupLocationSchedulesAction,
    getLocationSlotDurationAction: vi.fn().mockResolvedValue(15),
    updateFoodParcelScheduleAction: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => translate }));
vi.mock("@mantine/notifications", () => ({ showNotification: vi.fn() }));
vi.mock("@/app/[locale]/schedule/components/TimeSlotCell", () => ({
    default: () => <div data-testid="time-slot" />,
}));
vi.mock("@/app/[locale]/schedule/components/PickupCard", () => ({
    default: () => <div data-testid="pickup-card" />,
}));
vi.mock("@/app/[locale]/schedule/components/ReschedulePickupModal", () => ({
    default: () => null,
}));
vi.mock("@/app/[locale]/schedule/components/BulkRescheduleModal", () => ({
    default: () => null,
}));

const futureDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    date.setHours(9, 0, 0, 0);
    return date;
};

const parcel = (id: string, pickupDate: Date) => ({
    id,
    householdId: `household-${id}`,
    householdName: `Household ${id}`,
    pickupDate,
    pickupEarliestTime: pickupDate,
    pickupLatestTime: new Date(pickupDate.getTime() + 15 * 60 * 1000),
    isPickedUp: false,
    noShowAt: null,
    locationId: "location-1",
});

describe("WeeklyScheduleGrid daily capacity", () => {
    it("labels a day when bookings exceed the effective daily limit", async () => {
        const date = futureDate();
        const laterParcelDate = new Date(date.getTime() + 15 * 60 * 1000);
        getPickupLocationSchedulesAction.mockResolvedValue({
            schedules: [
                {
                    id: "schedule-1",
                    name: "Always open",
                    startDate: "2020-01-01",
                    endDate: "2099-12-31",
                    days: [
                        "monday",
                        "tuesday",
                        "wednesday",
                        "thursday",
                        "friday",
                        "saturday",
                        "sunday",
                    ].map(weekday => ({
                        weekday,
                        isOpen: true,
                        openingTime: "09:00",
                        closingTime: "10:00",
                    })),
                },
            ],
        });

        render(
            <MantineProvider>
                <WeeklyScheduleGrid
                    weekDates={[date]}
                    foodParcels={[parcel("1", date), parcel("2", laterParcelDate)]}
                    outsideHoursParcels={[]}
                    dailyLimitsByDate={{ [formatDateToYMD(date)]: 1 }}
                    maxParcelsPerSlot={2}
                    onParcelRescheduled={vi.fn()}
                    locationId="location-1"
                />
            </MantineProvider>,
        );

        expect(
            await screen.findByLabelText(
                "Food parcel limit exceeded: 2 booked, max 1, 1 more than max",
                { selector: "[data-testid='capacity-indicator']" },
            ),
        ).toBeTruthy();
    });
});
