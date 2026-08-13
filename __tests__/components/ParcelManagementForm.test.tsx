import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { FoodParcel, FoodParcels } from "@/app/[locale]/households/enroll/types";
import { ParcelManagementForm } from "@/components/ParcelManagementForm/ParcelManagementForm";

const { mockRouterPush, mockNotificationsShow } = vi.hoisted(() => ({
    mockRouterPush: vi.fn(),
    mockNotificationsShow: vi.fn(),
}));

vi.mock("@/app/i18n/navigation", () => ({
    useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock("@mantine/notifications", () => ({
    notifications: { show: mockNotificationsShow },
}));

vi.mock("next-intl", () => ({
    useTranslations: (namespace: string) => (key: string, params?: Record<string, string>) => {
        if (namespace === "parcelWarning" && key === "modal.message") {
            return `Projected count: ${params?.count}; threshold: ${params?.threshold}`;
        }

        const translations: Record<string, string> = {
            "parcelWarning.modal.title": "High Parcel Count Warning",
            "parcelWarning.modal.explanation": "Warning explanation",
            "parcelWarning.modal.acknowledgmentLabel": "Acknowledge warning",
            "parcelWarning.modal.confirmButton": "Continue Adding Parcels",
            "parcelWarning.modal.cancelButton": "Cancel",
            "parcelManagement.actions.saveParcels": "Save Parcels",
        };

        return translations[`${namespace}.${key}`] ?? key;
    },
}));

vi.mock("@/app/[locale]/households/enroll/components/FoodParcelsForm", () => ({
    default: ({
        data,
        updateData,
    }: {
        data: FoodParcels;
        updateData: (data: FoodParcels) => void;
    }) => (
        <div>
            <span>Form count: {data.parcels.length}</span>
            <button
                type="button"
                onClick={() =>
                    updateData({
                        ...data,
                        parcels: [...data.parcels, createParcel(data.parcels.length + 1)],
                    })
                }
            >
                Add Parcel
            </button>
            <button
                type="button"
                onClick={() => updateData({ ...data, parcels: data.parcels.slice(0, -1) })}
            >
                Remove Parcel
            </button>
        </div>
    ),
}));

vi.mock("@/components/ParcelManagementForm/ParcelWarningModal", () => ({
    ParcelWarningModal: ({
        opened,
        onConfirm,
        projectedParcelCount,
        threshold,
    }: {
        opened: boolean;
        onConfirm: () => void;
        projectedParcelCount: number;
        threshold: number;
    }) =>
        opened ? (
            <div>
                <h2>High Parcel Count Warning</h2>
                <p>{`Projected count: ${projectedParcelCount}; threshold: ${threshold}`}</p>
                <button type="button" onClick={onConfirm}>
                    Continue Adding Parcels
                </button>
            </div>
        ) : null,
}));

function createParcel(index: number): FoodParcel {
    const pickupEarliestTime = new Date(2027, 0, index + 1, 10, 0);
    return {
        id: `parcel-${index}`,
        pickupLocationId: "location-1",
        pickupDate: pickupEarliestTime,
        pickupEarliestTime,
        pickupLatestTime: new Date(2027, 0, index + 1, 11, 0),
    };
}

function createInitialData(count: number): FoodParcels {
    return {
        pickupLocationId: "location-1",
        parcels: Array.from({ length: count }, (_, index) => createParcel(index)),
    };
}

function renderForm({
    currentCount,
    threshold,
    initialCount = currentCount,
}: {
    currentCount: number;
    threshold: number | null;
    initialCount?: number;
}) {
    const onSubmit = vi.fn(async (_data: FoodParcels) => ({
        success: true as const,
        data: undefined,
    }));

    render(
        <MantineProvider>
            <ParcelManagementForm
                householdName="Test Household"
                initialData={createInitialData(initialCount)}
                onSubmit={onSubmit}
                warningData={{
                    parcelCount: currentCount,
                    threshold,
                }}
            />
        </MantineProvider>,
    );

    return { onSubmit };
}

describe("ParcelManagementForm threshold warning", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("submits a reduction without warning even when the projected count remains above the threshold", async () => {
        const { onSubmit } = renderForm({ currentCount: 12, threshold: 10 });

        fireEvent.click(screen.getByRole("button", { name: "Remove Parcel" }));
        fireEvent.click(screen.getByRole("button", { name: "Save Parcels" }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
        expect(screen.queryByText("High Parcel Count Warning")).toBeNull();
    });

    it("warns when the change crosses the threshold", () => {
        const { onSubmit } = renderForm({ currentCount: 10, threshold: 10 });

        fireEvent.click(screen.getByRole("button", { name: "Add Parcel" }));
        fireEvent.click(screen.getByRole("button", { name: "Save Parcels" }));

        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByText("High Parcel Count Warning")).not.toBeNull();
        expect(screen.getByText("Projected count: 11; threshold: 10")).not.toBeNull();
    });

    it("warns when an already over-threshold household receives another parcel", () => {
        const { onSubmit } = renderForm({ currentCount: 12, threshold: 10 });

        fireEvent.click(screen.getByRole("button", { name: "Add Parcel" }));
        fireEvent.click(screen.getByRole("button", { name: "Save Parcels" }));

        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByText("Projected count: 13; threshold: 10")).not.toBeNull();
    });

    it("submits without warning when the resulting count equals the threshold", async () => {
        const { onSubmit } = renderForm({ currentCount: 9, threshold: 10 });

        fireEvent.click(screen.getByRole("button", { name: "Add Parcel" }));
        fireEvent.click(screen.getByRole("button", { name: "Save Parcels" }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
        expect(screen.queryByText("High Parcel Count Warning")).toBeNull();
    });

    it("submits an unchanged over-threshold count without warning", async () => {
        const { onSubmit } = renderForm({ currentCount: 12, threshold: 10 });

        fireEvent.click(screen.getByRole("button", { name: "Save Parcels" }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
        expect(screen.queryByText("High Parcel Count Warning")).toBeNull();
    });

    it("does not warn when the threshold setting is disabled", async () => {
        const { onSubmit } = renderForm({ currentCount: 10, threshold: null });

        fireEvent.click(screen.getByRole("button", { name: "Add Parcel" }));
        fireEvent.click(screen.getByRole("button", { name: "Save Parcels" }));

        await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
        expect(screen.queryByText("High Parcel Count Warning")).toBeNull();
    });

    it("uses the form's net change with the current server count", () => {
        const { onSubmit } = renderForm({ currentCount: 10, initialCount: 9, threshold: 10 });

        fireEvent.click(screen.getByRole("button", { name: "Add Parcel" }));
        fireEvent.click(screen.getByRole("button", { name: "Save Parcels" }));

        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByText("Projected count: 11; threshold: 10")).not.toBeNull();
    });

    it("requires a new acknowledgment if the projected count changes", () => {
        const { onSubmit } = renderForm({ currentCount: 10, threshold: 10 });

        fireEvent.click(screen.getByRole("button", { name: "Add Parcel" }));
        fireEvent.click(screen.getByRole("button", { name: "Save Parcels" }));
        fireEvent.click(screen.getByRole("button", { name: "Continue Adding Parcels" }));
        fireEvent.click(screen.getByRole("button", { name: "Add Parcel" }));
        fireEvent.click(screen.getByRole("button", { name: "Save Parcels" }));

        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByText("Projected count: 12; threshold: 10")).not.toBeNull();
    });
});
