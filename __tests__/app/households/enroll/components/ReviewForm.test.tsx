import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type React from "react";
import type { FormData } from "../../../../../app/[locale]/households/enroll/types";
import ReviewForm from "../../../../../app/[locale]/households/enroll/components/ReviewForm";

const { translate } = vi.hoisted(() => ({
    translate: (key: string, params?: Record<string, string>) => {
        if (key === "householdDetail.foodParcels" && params?.count) {
            return `Food parcels (${params.count})`;
        }
        if (key === "locationUnknownWithId") {
            return `Unknown location ${params?.id}`;
        }
        return key;
    },
}));

vi.mock("next-intl", () => ({
    useLocale: () => "sv",
    useTranslations: () => translate,
}));

vi.mock("../../../../../app/[locale]/households/enroll/client-actions", () => ({
    getPickupLocationsAction: vi.fn(async () => []),
    getResponsibleStaffOptionsAction: vi.fn(async () => []),
}));

vi.mock("@/components/LocalizedDate", () => ({
    default: ({ date }: { date: Date }) => <time>{date.toISOString().split("T")[0]}</time>,
}));

vi.mock("@/components/CommentSection", () => ({
    default: () => <div data-testid="comments" />,
}));

vi.mock("@mantine/core", () => ({
    Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    Box: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
    Code: ({ children }: { children: React.ReactNode }) => <code>{children}</code>,
    Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Loader: () => <span>loading</span>,
    Paper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SimpleGrid: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    ThemeIcon: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    Title: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@tabler/icons-react", () => ({
    IconBuilding: () => <span />,
    IconCalendarEvent: () => <span />,
    IconClock: () => <span />,
    IconGenderBigender: () => <span />,
    IconMapPin: () => <span />,
    IconMars: () => <span />,
    IconPhone: () => <span />,
    IconUser: () => <span />,
    IconUserCheck: () => <span />,
    IconVenus: () => <span />,
}));

const formData: FormData = {
    household: {
        first_name: "Test",
        last_name: "Household",
        phone_number: "0701234567",
        locale: "sv",
        primary_pickup_location_id: "location-1",
    },
    members: [],
    dietaryRestrictions: [],
    additionalNeeds: [],
    pets: [],
    foodParcels: {
        pickupLocationId: "location-1",
        parcels: [
            {
                pickupLocationId: "location-1",
                pickupDate: new Date("2026-05-15T10:00:00"),
                pickupEarliestTime: new Date("2026-05-15T10:00:00"),
                pickupLatestTime: new Date("2026-05-15T10:30:00"),
            },
            {
                pickupLocationId: "location-2",
                pickupDate: new Date("2026-05-22T11:00:00"),
                pickupEarliestTime: new Date("2026-05-22T11:00:00"),
                pickupLatestTime: new Date("2026-05-22T11:45:00"),
            },
        ],
    },
    comments: [],
};

describe("ReviewForm food parcel summary", () => {
    afterEach(() => {
        cleanup();
    });

    it("shows each selected parcel with its own pickup location", async () => {
        render(
            <ReviewForm
                formData={formData}
                pickupLocationsData={[
                    { id: "location-1", name: "Primary Location" },
                    { id: "location-2", name: "Alternate Location" },
                ]}
            />,
        );

        expect(await screen.findByText("Alternate Location")).toBeDefined();
        expect(screen.getAllByText("Primary Location")).toHaveLength(2);
        expect(screen.getByText("11:00-11:45")).toBeDefined();
    });
});
