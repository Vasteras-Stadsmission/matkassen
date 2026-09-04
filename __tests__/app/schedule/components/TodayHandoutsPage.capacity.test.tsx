import { render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatDateToYMD } from "@/app/utils/date-utils";
import { TodayHandoutsPage } from "@/app/[locale]/schedule/[locationSlug]/today/components/TodayHandoutsPage";

const {
    getTodaysParcelsWithPhone,
    getPickupLocations,
    getTodaysSummaryStats,
    getEffectiveDailyLimitsForDateRange,
    translate,
} = vi.hoisted(() => ({
    getTodaysParcelsWithPhone: vi.fn(),
    getPickupLocations: vi.fn(),
    getTodaysSummaryStats: vi.fn(),
    getEffectiveDailyLimitsForDateRange: vi.fn(),
    translate: (key: string, params?: Record<string, unknown>) => {
        if (key === "todayHandouts.overCapacity.title") {
            return "Food parcel limit exceeded today";
        }
        if (key === "todayHandouts.overCapacity.summary") {
            return `${params?.booked}/${params?.limit} booked`;
        }
        return key;
    },
}));

vi.mock("@/app/[locale]/schedule/actions", () => ({
    getTodaysParcelsWithPhone,
    getPickupLocations,
    getTodaysSummaryStats,
    getEffectiveDailyLimitsForDateRange,
    getParcelById: vi.fn(),
}));

vi.mock("@/app/i18n/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/schedule/central-kitchen/today",
}));

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
    useSession: () => ({ data: { user: { role: "admin" } }, status: "authenticated" }),
}));

vi.mock("next-intl", () => ({
    useTranslations: () => translate,
}));

vi.mock("@/app/[locale]/schedule/[locationSlug]/today/components/TodaySummaryCard", () => ({
    TodaySummaryCard: () => <div>Summary</div>,
}));

vi.mock("@/components/ParcelAdminDialog", () => ({ ParcelAdminDialog: () => null }));
vi.mock("@/app/[locale]/schedule/components/NoUpcomingScheduleAlert", () => ({
    NoUpcomingScheduleAlert: () => null,
}));

const location = {
    id: "location-1",
    name: "Central Kitchen",
    street_address: "Main Street",
    maxParcelsPerDay: 1,
    outsideHoursCount: 0,
    hasUpcomingSchedule: true,
};

const parcel = (id: string, minutes: number) => {
    const pickupDate = new Date();
    pickupDate.setHours(9, minutes, 0, 0);
    return {
        id,
        householdId: `household-${id}`,
        householdName: `Household ${id}`,
        pickupDate,
        pickupEarliestTime: pickupDate,
        pickupLatestTime: new Date(pickupDate.getTime() + 15 * 60 * 1000),
        isPickedUp: false,
        noShowAt: null,
        locationId: location.id,
    };
};

describe("TodayHandoutsPage daily capacity", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getPickupLocations.mockResolvedValue([location]);
        getTodaysSummaryStats.mockResolvedValue({
            householdCount: 2,
            memberCount: 2,
            dietaryRestrictions: [],
            pets: [],
            additionalNeeds: [],
        });
    });

    it("shows booked/max when today's bookings exceed the effective limit", async () => {
        getTodaysParcelsWithPhone.mockResolvedValue([parcel("1", 0), parcel("2", 15)]);
        getEffectiveDailyLimitsForDateRange.mockResolvedValue({
            [formatDateToYMD(new Date())]: 1,
        });

        render(
            <MantineProvider>
                <TodayHandoutsPage locationSlug="central-kitchen" />
            </MantineProvider>,
        );

        const warning = await screen.findByTestId("today-over-capacity");
        expect(warning.textContent).toContain("Food parcel limit exceeded today");
        expect(warning.textContent).toContain("2/1 booked");
    });

    it("does not warn when today's bookings are exactly at the limit", async () => {
        getTodaysParcelsWithPhone.mockResolvedValue([parcel("1", 0), parcel("2", 15)]);
        getEffectiveDailyLimitsForDateRange.mockResolvedValue({
            [formatDateToYMD(new Date())]: 2,
        });

        render(
            <MantineProvider>
                <TodayHandoutsPage locationSlug="central-kitchen" />
            </MantineProvider>,
        );

        await waitFor(() => expect(screen.getByText("Summary")).toBeTruthy());
        expect(screen.queryByTestId("today-over-capacity")).toBeNull();
    });
});
