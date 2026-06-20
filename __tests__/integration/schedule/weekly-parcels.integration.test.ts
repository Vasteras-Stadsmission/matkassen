/**
 * Integration tests for weekly schedule parcel loading.
 *
 * Covers data fields that directly drive the weekly grid UI.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestNoShowParcel,
    createTestParcel,
    resetHouseholdCounter,
    resetLocationCounter,
} from "../../factories";
import { TEST_NOW, daysFromTestNow } from "../../test-time";
import { Time } from "@/app/utils/time-provider";

type MockSession = { user: { githubUsername: string; name: string; role: "admin" } };
const mockSession: MockSession = {
    user: { githubUsername: "test-admin", name: "Test Admin", role: "admin" },
};

vi.mock("@/app/utils/auth/protected-action", () => ({
    protectedAdminAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => {
            return fn(mockSession, ...args);
        };
    },
    protectedReadAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => {
            return fn(mockSession, ...args);
        };
    },
    protectedAgreementReadAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => {
            return fn(mockSession, ...args);
        };
    },
    protectedAgreementAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => {
            return fn(mockSession, ...args);
        };
    },
}));

vi.mock("next/headers", () => ({
    headers: vi.fn().mockResolvedValue(new Map([["x-locale", "sv"]])),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

import { getFoodParcelsForWeek, getParcelById } from "@/app/[locale]/schedule/actions";

describe("getFoodParcelsForWeek - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
    });

    it("includes no-show metadata for weekly schedule cards", async () => {
        const household = await createTestHousehold({
            first_name: "NoShow",
            last_name: "Household",
        });
        const { location } = await createTestLocationWithSchedule();

        const pickupStart = daysFromTestNow(2);
        pickupStart.setHours(10, 0, 0, 0);

        const noShowAt = new Date(TEST_NOW);
        const parcel = await createTestNoShowParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: pickupStart,
            pickup_date_time_latest: new Date(pickupStart.getTime() + 15 * 60 * 1000),
            no_show_at: noShowAt,
            no_show_by_user_id: "test-admin",
        });

        const weekStart = daysFromTestNow(1);
        const weekEnd = daysFromTestNow(7);

        const parcels = await getFoodParcelsForWeek(location.id, weekStart, weekEnd);

        const loadedParcel = parcels.find(p => p.id === parcel.id);
        expect(loadedParcel).toMatchObject({
            id: parcel.id,
            householdName: "NoShow Household",
            isPickedUp: false,
        });
        expect(loadedParcel?.noShowAt).toEqual(noShowAt);
    });

    it("maps parcel details used by schedule deep links", async () => {
        const household = await createTestHousehold({
            first_name: "Deep",
            last_name: "Link",
        });
        const { location } = await createTestLocationWithSchedule();

        const pickupStart = daysFromTestNow(3);
        pickupStart.setHours(10, 0, 0, 0);
        const pickupEnd = new Date(pickupStart.getTime() + 15 * 60 * 1000);

        const parcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: pickupStart,
            pickup_date_time_latest: pickupEnd,
        });

        const loadedParcel = await getParcelById(parcel.id);

        expect(loadedParcel).toMatchObject({
            id: parcel.id,
            householdId: household.id,
            householdName: "Deep Link",
            isPickedUp: false,
            noShowAt: null,
            pickup_location_id: location.id,
        });
        expect(loadedParcel?.pickupDate).toEqual(Time.fromDate(pickupStart).startOfDay().toDate());
        expect(loadedParcel?.pickupEarliestTime).toEqual(pickupStart);
        expect(loadedParcel?.pickupLatestTime).toEqual(pickupEnd);
    });
});
