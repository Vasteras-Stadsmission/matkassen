import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import IssuesPageClient from "@/app/[locale]/components/IssuesPageClient";

const { mockAdminFetch, translate, mediaState } = vi.hoisted(() => ({
    mockAdminFetch: vi.fn(),
    mediaState: { compact: false },
    translate: (key: string, params?: Record<string, unknown>) => {
        const labels: Record<string, string> = {
            "title": "Follow-up",
            "filters.all": "All",
            "filters.overCapacity": "Over capacity",
            "cardType.overCapacity": "Food parcel limit exceeded",
            "actions.viewWeek": "View week",
            "actions.viewHousehold": "View household",
            "actions.reschedule": "Reschedule",
            "overCapacity.allBookings": "All bookings for this date",
            "errorCodes.ALREADY_PICKED_UP": "Handed out — cannot be rescheduled.",
            "errorCodes.ALREADY_NO_SHOW": "No-show — cannot be rescheduled.",
        };
        if (key === "overCapacity.summary") return `${params?.booked}/${params?.limit} booked`;
        if (key === "overCapacity.resolveHint") {
            return `Move or cancel at least ${params?.excess} food parcels.`;
        }
        if (key === "overCapacity.resolve") return `Resolve · ${params?.count} parcels`;
        return labels[key] ?? key;
    },
}));

vi.mock("@/app/utils/auth/redirect-on-auth-error", () => ({
    adminFetch: mockAdminFetch,
}));

vi.mock("@/app/i18n/navigation", () => ({
    Link: ({
        href,
        children,
        ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => {
        return (
            <a href={href} {...props}>
                {children}
            </a>
        );
    },
}));

vi.mock("@mantine/hooks", () => ({
    useMediaQuery: () => mediaState.compact,
}));

vi.mock("@mantine/notifications", () => ({
    notifications: { show: vi.fn() },
}));

vi.mock("@mantine/modals", () => ({
    modals: { openConfirmModal: vi.fn() },
}));

vi.mock("@/app/[locale]/components/RescheduleInline", () => ({
    default: ({ isExpanded }: { isExpanded: boolean }) =>
        isExpanded ? <div>Reschedule form</div> : null,
}));

vi.mock("next-intl", () => ({
    useLocale: () => "en",
    useTranslations: () => translate,
}));

const issuesResponse = {
    unresolvedHandouts: [],
    outsideHours: [],
    failedSms: [],
    noShowFollowups: [],
    overCapacityDates: [
        {
            locationId: "location-1",
            locationName: "Central Kitchen",
            date: "2026-10-08",
            booked: 23,
            limit: 20,
            excess: 3,
            hasOverride: true,
            parcels: [
                {
                    parcelId: "parcel-1",
                    householdId: "household-1",
                    householdFirstName: "Anna",
                    householdLastName: "Andersson",
                    pickupDateEarliest: "2026-10-08T07:00:00.000Z",
                    pickupDateLatest: "2026-10-08T07:15:00.000Z",
                    isPickedUp: false,
                    noShowAt: null,
                },
                {
                    parcelId: "parcel-2",
                    householdId: "household-2",
                    householdFirstName: "Mohamed",
                    householdLastName: "Ali",
                    pickupDateEarliest: "2026-10-08T07:15:00.000Z",
                    pickupDateLatest: "2026-10-08T07:30:00.000Z",
                    isPickedUp: false,
                    noShowAt: null,
                },
                {
                    parcelId: "parcel-3",
                    householdId: "household-3",
                    householdFirstName: "Erik",
                    householdLastName: "Berg",
                    pickupDateEarliest: "2026-10-08T07:30:00.000Z",
                    pickupDateLatest: "2026-10-08T07:45:00.000Z",
                    isPickedUp: true,
                    noShowAt: null,
                },
                {
                    parcelId: "parcel-4",
                    householdId: "household-4",
                    householdFirstName: "Sara",
                    householdLastName: "Dahl",
                    pickupDateEarliest: "2026-10-08T07:45:00.000Z",
                    pickupDateLatest: "2026-10-08T08:00:00.000Z",
                    isPickedUp: false,
                    noShowAt: "2026-10-08T08:30:00.000Z",
                },
            ],
        },
    ],
    counts: {
        total: 1,
        unresolvedHandouts: 0,
        outsideHours: 0,
        failedSms: 0,
        noShowFollowups: 0,
        overCapacityDates: 1,
    },
};

describe("IssuesPageClient over-capacity workflow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mediaState.compact = false;
        mockAdminFetch.mockResolvedValue(
            new Response(JSON.stringify(issuesResponse), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );
    });

    it("keeps the landing card compact and resolves parcels in a drawer", async () => {
        render(
            <MantineProvider>
                <IssuesPageClient />
            </MantineProvider>,
        );

        await waitFor(() => expect(screen.getByText(/23\/20 booked/)).toBeTruthy());
        expect(screen.getByText("Move or cancel at least 3 food parcels.")).toBeTruthy();
        expect(screen.queryByText(/Edit food parcel limits/i)).toBeNull();

        fireEvent.click(screen.getByRole("button", { name: "Resolve · 4 parcels" }));

        const drawer = await screen.findByTestId("over-capacity-drawer");
        expect(within(drawer).getByText("All bookings for this date")).toBeTruthy();
        expect(within(drawer).getByText("Anna Andersson")).toBeTruthy();
        expect(within(drawer).getByText("Mohamed Ali")).toBeTruthy();
        const parcelCards = within(drawer).getAllByTestId("over-capacity-parcel");
        expect(parcelCards).toHaveLength(4);
        parcelCards.forEach(card => {
            expect(within(card).getByText("Central Kitchen")).toBeTruthy();
        });
        expect(within(drawer).getByText(/Thu, Oct 8.*09:00.*09:15/i)).toBeTruthy();
        expect(within(drawer).getAllByRole("button", { name: "Reschedule" })).toHaveLength(2);
        expect(within(drawer).getByText("Handed out — cannot be rescheduled.")).toBeTruthy();
        expect(within(drawer).getByText("No-show — cannot be rescheduled.")).toBeTruthy();
    });

    it("uses a near-full-height bottom sheet on compact touch layouts", async () => {
        mediaState.compact = true;

        render(
            <MantineProvider>
                <IssuesPageClient />
            </MantineProvider>,
        );

        fireEvent.click(await screen.findByRole("button", { name: "Resolve · 4 parcels" }));

        const drawer = await screen.findByTestId("over-capacity-drawer");
        expect(drawer.style.getPropertyValue("--drawer-size")).toBe("90%");
    });
});
