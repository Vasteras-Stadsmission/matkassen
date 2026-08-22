import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LimitsTab } from "@/app/[locale]/handout-locations/components/limits/LimitsTab";
import type { PickupLocationWithAllData } from "@/app/[locale]/handout-locations/types";

const {
    mockApplyDailyParcelLimits,
    mockGetDailyLimitMonthData,
    mockResetDailyParcelLimits,
    mockUpdateLocationLimits,
} = vi.hoisted(() => ({
    mockApplyDailyParcelLimits: vi.fn(),
    mockGetDailyLimitMonthData: vi.fn(),
    mockResetDailyParcelLimits: vi.fn(),
    mockUpdateLocationLimits: vi.fn(),
}));

const translate = vi.hoisted(() => (key: string, params?: Record<string, unknown>): string => {
    const labels: Record<string, string> = {
        title: "Food parcel limits",
        description: "Configure limits",
        defaultsTitle: "Defaults",
        defaultsDescription: "Default limits",
        defaultDailyLabel: "Default parcels per day",
        defaultDailyPlaceholder: "No default",
        slotLimitLabel: "Parcels per time slot",
        slotLimitDescription: "Leave empty to use the daily limit",
        slotLimitPlaceholder: "Use daily limit",
        saveDefaults: "Save defaults",
        specificDatesTitle: "Specific dates",
        specificDatesDescription: "Override selected dates",
        reviewDates: "Review dates",
        selectedLimitLabel: "Selected limit",
        selectedLimitPlaceholder: "Enter limit",
        applySelected: "Apply to selected dates",
        resetSelected: "Reset to default",
        clearSelection: "Clear selection",
        independentDatesHelp: "Each date is independent",
        legendSelected: "Selected",
        legendOverride: "Override",
        legendClosed: "Closed",
        legendOverCapacity: "Over capacity",
        selectedOverCapacityTitle: "Selected dates over capacity",
    };
    if (key === "selectedCount") return `${params?.count} dates selected`;
    if (key === "selectedOverCapacityLine") {
        return `${params?.date}: ${params?.booked}/${params?.limit} booked`;
    }
    return labels[key] ?? key;
});

vi.mock("next-intl", () => ({
    useLocale: () => "en",
    useTranslations: () => translate,
}));

vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));

vi.mock("@/app/[locale]/handout-locations/actions", () => ({
    applyDailyParcelLimits: mockApplyDailyParcelLimits,
    getDailyLimitMonthData: mockGetDailyLimitMonthData,
    resetDailyParcelLimits: mockResetDailyParcelLimits,
    updateLocationLimits: mockUpdateLocationLimits,
}));

vi.mock("@mantine/dates", () => ({
    DatePicker: ({ date, value, onChange, onDateChange, renderDay }: any) => {
        const monthKey = String(date).slice(0, 7);
        const probeDate = `${monthKey}-05`;
        return (
            <div>
                <div data-testid="visible-month">{monthKey}</div>
                <div data-testid="rendered-day">{renderDay(probeDate)}</div>
                <button
                    type="button"
                    onClick={() => onChange([`${monthKey}-04`, `${monthKey}-11`])}
                >
                    Select two dates
                </button>
                <button type="button" onClick={() => onChange([probeDate])}>
                    Select shown date
                </button>
                <button type="button" onClick={() => onChange([...value, probeDate])}>
                    Add shown date
                </button>
                <button type="button" onClick={() => onDateChange("2026-09-01")}>
                    Next month
                </button>
            </div>
        );
    },
}));

const location: PickupLocationWithAllData = {
    id: "location-1",
    name: "Central Kitchen",
    street_address: "Main Street 1",
    postal_code: "72100",
    parcels_max_per_day: 20,
    max_parcels_per_slot: null,
    contact_name: null,
    contact_email: null,
    contact_phone_number: null,
    default_slot_duration_minutes: 15,
    outside_hours_count: 0,
    schedules: [],
};

function monthData(monthKey: string, override: number) {
    const dateKey = `${monthKey}-05`;
    return {
        success: true as const,
        data: {
            overrides: { [dateKey]: override },
            effectiveDailyLimits: { [dateKey]: override },
            bookedCounts: { [dateKey]: 0 },
            openDates: [dateKey, `${monthKey}-04`, `${monthKey}-11`],
        },
    };
}

describe("LimitsTab", () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.setSystemTime(new Date("2026-08-01T10:00:00Z"));
        vi.clearAllMocks();
        mockGetDailyLimitMonthData.mockResolvedValue(monthData("2026-08", 8));
        mockApplyDailyParcelLimits.mockResolvedValue({
            success: true,
            data: { status: "updated", changedDates: [], conflicts: [] },
        });
        mockResetDailyParcelLimits.mockResolvedValue({
            success: true,
            data: { status: "updated", changedDates: [], conflicts: [] },
        });
        mockUpdateLocationLimits.mockResolvedValue({
            success: true,
            data: { status: "updated", changedDates: [], conflicts: [] },
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("shows only a selection count and applies one value to independent dates", async () => {
        render(
            <MantineProvider>
                <LimitsTab location={location} />
            </MantineProvider>,
        );
        await waitFor(() => expect(mockGetDailyLimitMonthData).toHaveBeenCalled());

        fireEvent.click(screen.getByRole("button", { name: "Select two dates" }));
        expect(screen.getByText("2 dates selected")).toBeTruthy();
        expect(screen.queryByText("August: 4, 11")).toBeNull();

        fireEvent.change(screen.getByLabelText("Selected limit"), { target: { value: "7" } });
        fireEvent.click(screen.getByRole("button", { name: "Apply to selected dates" }));

        await waitFor(() =>
            expect(mockApplyDailyParcelLimits).toHaveBeenCalledWith(
                location.id,
                ["2026-08-04", "2026-08-11"],
                7,
                [],
            ),
        );
    });

    it("ignores a stale month response after rapid navigation", async () => {
        let resolveAugust!: (value: ReturnType<typeof monthData>) => void;
        const august = new Promise<ReturnType<typeof monthData>>(resolve => {
            resolveAugust = resolve;
        });
        mockGetDailyLimitMonthData.mockImplementation((_locationId: string, dateKeys: string[]) =>
            dateKeys[0].startsWith("2026-08") ? august : Promise.resolve(monthData("2026-09", 9)),
        );

        render(
            <MantineProvider>
                <LimitsTab location={location} />
            </MantineProvider>,
        );
        await waitFor(() => expect(mockGetDailyLimitMonthData).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole("button", { name: "Next month" }));

        await waitFor(() => expect(screen.getByTestId("rendered-day").textContent).toContain("9"));
        resolveAugust(monthData("2026-08", 8));
        await Promise.resolve();

        expect(screen.getByTestId("visible-month").textContent).toBe("2026-09");
        expect(screen.getByTestId("rendered-day").textContent).toContain("9");
        expect(screen.getByTestId("rendered-day").textContent).not.toContain("8");
    });

    it("shows booked/max details when an over-capacity date is selected", async () => {
        const data = monthData("2026-08", 8);
        data.data.bookedCounts["2026-08-05"] = 10;
        mockGetDailyLimitMonthData.mockResolvedValue(data);

        render(
            <MantineProvider>
                <LimitsTab location={location} />
            </MantineProvider>,
        );
        await waitFor(() => expect(mockGetDailyLimitMonthData).toHaveBeenCalled());

        expect(screen.getByTestId("rendered-day").textContent).toContain("!");
        fireEvent.click(screen.getByRole("button", { name: "Select shown date" }));

        expect(screen.getByText("Selected dates over capacity")).toBeTruthy();
        expect(screen.getByText(/10\/8 booked/)).toBeTruthy();
    });

    it("keeps warnings for selected over-capacity dates across months", async () => {
        const august = monthData("2026-08", 8);
        august.data.bookedCounts["2026-08-05"] = 10;
        const september = monthData("2026-09", 9);
        september.data.bookedCounts["2026-09-05"] = 12;
        mockGetDailyLimitMonthData.mockImplementation((_locationId: string, dateKeys: string[]) =>
            Promise.resolve(dateKeys[0].startsWith("2026-08") ? august : september),
        );

        render(
            <MantineProvider>
                <LimitsTab location={location} />
            </MantineProvider>,
        );
        await waitFor(() => expect(mockGetDailyLimitMonthData).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole("button", { name: "Add shown date" }));
        fireEvent.click(screen.getByRole("button", { name: "Next month" }));
        await waitFor(() =>
            expect(screen.getByTestId("visible-month").textContent).toBe("2026-09"),
        );
        await waitFor(() => expect(screen.getByTestId("rendered-day").textContent).toContain("9"));
        fireEvent.click(screen.getByRole("button", { name: "Add shown date" }));

        expect(screen.getByText(/10\/8 booked/)).toBeTruthy();
        expect(screen.getByText(/12\/9 booked/)).toBeTruthy();
    });
});
