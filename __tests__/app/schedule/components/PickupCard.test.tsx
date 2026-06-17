import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { TestWrapper } from "../../../test-utils";
import { FoodParcel } from "../../../../app/[locale]/schedule/types";

vi.mock("@dnd-kit/sortable", () => ({
    useSortable: () => ({
        attributes: {},
        listeners: {},
        setNodeRef: vi.fn(),
        transform: null,
        transition: undefined,
        isDragging: false,
    }),
}));

vi.mock("next-intl", () => ({
    useLocale: () => "sv",
    useTranslations: () => (key: string) => {
        const translations: Record<string, string> = {
            noShowStatus: "No-show",
            notPickedUpStatus: "Not handed out",
            pickedUpStatus: "Handed out",
            pickupTimeLabel: "Pickup time",
            statusLabel: "Status",
            viewParcelDetails: "View parcel details",
            primaryLocationLabel: "Primary pickup location",
            createdByLabel: "Created by",
        };

        return translations[key] ?? key;
    },
}));

import PickupCard from "../../../../app/[locale]/schedule/components/PickupCard";

function parcel(overrides: Partial<FoodParcel> = {}): FoodParcel {
    return {
        id: "parcel-1",
        householdId: "household-1",
        householdName: "Test Household",
        pickupDate: new Date("2026-06-18T00:00:00.000Z"),
        pickupEarliestTime: new Date("2026-06-18T10:00:00.000Z"),
        pickupLatestTime: new Date("2026-06-18T10:30:00.000Z"),
        isPickedUp: false,
        noShowAt: null,
        ...overrides,
    };
}

describe("PickupCard", () => {
    it("shows no-show status in compact schedule cards", () => {
        const { container } = render(
            <TestWrapper>
                <PickupCard
                    foodParcel={parcel({
                        noShowAt: new Date("2026-06-18T11:00:00.000Z"),
                    })}
                />
            </TestWrapper>,
        );

        expect(container.textContent).toContain("Test Household");

        const noShowMarker = container.querySelector('[aria-label="No-show"]');
        expect(noShowMarker).toBeTruthy();
        expect(noShowMarker?.getAttribute("title")).toBe("No-show");
    });

    it("does not show the no-show marker for ordinary unpicked parcels", () => {
        const { container } = render(
            <TestWrapper>
                <PickupCard foodParcel={parcel()} />
            </TestWrapper>,
        );

        expect(container.textContent).toContain("Test Household");
        expect(container.querySelector('[aria-label="No-show"]')).toBeNull();
    });
});
