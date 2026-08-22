import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";
import { LocationForm } from "@/app/[locale]/handout-locations/components/LocationForm";
import type { PickupLocationWithAllData } from "@/app/[locale]/handout-locations/types";

vi.mock("next-intl", () => ({
    useTranslations: () => (key: string) =>
        ({
            "generalInfo": "General",
            "openingHours": "Opening hours",
            "limits.tab": "Limits",
            "name": "Location name",
            "postalCode": "Postal code",
            "streetAddress": "Street address",
            "contactInfo": "Contact information",
            "contactName": "Contact person",
            "contactEmail": "Email",
            "contactPhone": "Phone",
            "updateLocation": "Update location",
        })[key] ?? key,
}));

vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));
vi.mock("@/app/[locale]/handout-locations/actions", () => ({
    createLocation: vi.fn(),
    updateLocation: vi.fn(),
}));
vi.mock("@/app/[locale]/handout-locations/components/schedules/SchedulesTab", () => ({
    SchedulesTab: () => <div>Opening-hours editor</div>,
}));
vi.mock("@/app/[locale]/handout-locations/components/limits/LimitsTab", () => ({
    LimitsTab: () => <div>Date-specific limits editor</div>,
}));

const location: PickupLocationWithAllData = {
    id: "location-1",
    name: "Central Kitchen",
    street_address: "Main Street 1",
    postal_code: "72100",
    parcels_max_per_day: 20,
    max_parcels_per_slot: 4,
    contact_name: null,
    contact_email: null,
    contact_phone_number: null,
    default_slot_duration_minutes: 15,
    outside_hours_count: 0,
    schedules: [],
};

describe("LocationForm tabs", () => {
    it("keeps operational capacity out of General and exposes a dedicated Limits tab", () => {
        render(
            <MantineProvider>
                <LocationForm location={location} />
            </MantineProvider>,
        );

        expect(screen.getByRole("tab", { name: "General" })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Opening hours" })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Limits" })).toBeTruthy();
        expect(screen.queryByText("Maximum Food Parcels Per Day")).toBeNull();

        fireEvent.click(screen.getByRole("tab", { name: "Limits" }));
        expect(screen.getByText("Date-specific limits editor")).toBeTruthy();
    });
});
