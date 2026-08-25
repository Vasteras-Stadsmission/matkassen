import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    resetHouseholdCounter,
    resetLocationCounter,
} from "../../factories";
import { daysFromTestNow } from "../../test-time";
import { getStockholmDateKey } from "@/app/utils/date-utils";
import { pickupLocationDailyLimits, pickupLocations } from "@/app/db/schema";

const mockSession = {
    user: { githubUsername: "daily-limit-test", name: "Daily Limit Test", role: "admin" },
};

vi.mock("@/app/utils/auth/protected-action", () => ({
    protectedAdminAction:
        (fn: (...args: unknown[]) => unknown) =>
        (...args: unknown[]) =>
            fn(mockSession, ...args),
}));

vi.mock("next/headers", () => ({
    headers: vi.fn().mockResolvedValue(new Map([["x-locale", "en"]])),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
    applyDailyParcelLimits,
    resetDailyParcelLimits,
    updateLocation,
    updateLocationLimits,
} from "@/app/[locale]/handout-locations/actions";

const allWeekdays = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
] as const;

describe("date-specific parcel limit actions", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
    });

    it("creates independent rows, updates one date, and resets only requested dates", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 20 },
            { weekdays: [...allWeekdays] },
        );
        const dates = [1, 8, 15, 22].map(offset => getStockholmDateKey(daysFromTestNow(offset)));

        const applied = await applyDailyParcelLimits(location.id, dates, 12);
        expect(applied).toMatchObject({ success: true, data: { status: "updated" } });

        const changedOne = await applyDailyParcelLimits(location.id, [dates[1]], 7);
        expect(changedOne).toMatchObject({ success: true, data: { status: "updated" } });

        let rows = await db
            .select()
            .from(pickupLocationDailyLimits)
            .where(eq(pickupLocationDailyLimits.pickup_location_id, location.id));
        expect(rows).toHaveLength(4);
        expect(Object.fromEntries(rows.map(row => [row.date, row.max_parcels]))).toEqual({
            [dates[0]]: 12,
            [dates[1]]: 7,
            [dates[2]]: 12,
            [dates[3]]: 12,
        });

        const reset = await resetDailyParcelLimits(location.id, [dates[1]]);
        expect(reset).toMatchObject({ success: true, data: { status: "updated" } });
        rows = await db
            .select()
            .from(pickupLocationDailyLimits)
            .where(eq(pickupLocationDailyLimits.pickup_location_id, location.id));
        expect(rows.map(row => row.date).sort()).toEqual([dates[0], dates[2], dates[3]].sort());
    });

    it("requires confirmation before setting a limit below current bookings", async () => {
        const db = await getTestDb();
        const firstHousehold = await createTestHousehold();
        const secondHousehold = await createTestHousehold();
        const { location } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 20 },
            { weekdays: [...allWeekdays] },
        );
        const date = daysFromTestNow(1);
        const dateKey = getStockholmDateKey(date);
        await createTestParcel({
            household_id: firstHousehold.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: date,
        });
        await createTestParcel({
            household_id: secondHousehold.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: new Date(date.getTime() + 30 * 60 * 1000),
        });

        const preview = await applyDailyParcelLimits(location.id, [dateKey], 1);
        expect(preview).toMatchObject({
            success: true,
            data: {
                status: "confirmation_required",
                conflicts: [{ date: dateKey, booked: 2, resultingLimit: 1 }],
            },
        });
        expect(
            await db
                .select()
                .from(pickupLocationDailyLimits)
                .where(
                    and(
                        eq(pickupLocationDailyLimits.pickup_location_id, location.id),
                        eq(pickupLocationDailyLimits.date, dateKey),
                    ),
                ),
        ).toHaveLength(0);

        const confirmed = await applyDailyParcelLimits(location.id, [dateKey], 1, [dateKey]);
        expect(confirmed).toMatchObject({ success: true, data: { status: "updated" } });
    });

    it("asks again if new conflicts appear after the confirmation preview", async () => {
        const db = await getTestDb();
        const households = await Promise.all(
            [1, 2, 3, 4].map(index => createTestHousehold({ phone_number: `+4681000010${index}` })),
        );
        const { location } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 20 },
            { weekdays: [...allWeekdays] },
        );
        const firstDate = daysFromTestNow(1);
        const secondDate = daysFromTestNow(2);
        const firstDateKey = getStockholmDateKey(firstDate);
        const secondDateKey = getStockholmDateKey(secondDate);
        await Promise.all(
            households.slice(0, 2).map((household, index) =>
                createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: new Date(
                        firstDate.getTime() + index * 30 * 60 * 1000,
                    ),
                }),
            ),
        );

        const preview = await applyDailyParcelLimits(location.id, [firstDateKey, secondDateKey], 1);
        expect(preview).toMatchObject({
            success: true,
            data: {
                status: "confirmation_required",
                conflicts: [{ date: firstDateKey }],
            },
        });

        await Promise.all(
            households.slice(2).map((household, index) =>
                createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: new Date(
                        secondDate.getTime() + index * 30 * 60 * 1000,
                    ),
                }),
            ),
        );

        const staleConfirmation = await applyDailyParcelLimits(
            location.id,
            [firstDateKey, secondDateKey],
            1,
            [firstDateKey],
        );
        expect(staleConfirmation).toMatchObject({
            success: true,
            data: {
                status: "confirmation_required",
                conflicts: expect.arrayContaining([
                    expect.objectContaining({ date: secondDateKey, booked: 2 }),
                ]),
            },
        });

        const rows = await db
            .select()
            .from(pickupLocationDailyLimits)
            .where(eq(pickupLocationDailyLimits.pickup_location_id, location.id));
        expect(rows).toHaveLength(0);
    });

    it("rejects a closed date without an existing override", async () => {
        const { location } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 20 },
            { weekdays: [] },
        );
        const dateKey = getStockholmDateKey(daysFromTestNow(1));

        const result = await applyDailyParcelLimits(location.id, [dateKey], 5);

        expect(result).toMatchObject({
            success: false,
            error: { code: "CLOSED_DATE" },
        });
    });

    it("does not let the general-information action bypass the limits workflow", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule({
            parcels_max_per_day: 20,
            max_parcels_per_slot: 4,
            default_slot_duration_minutes: 15,
        });

        const result = await updateLocation(location.id, {
            name: "Updated location name",
            street_address: location.street_address,
            postal_code: location.postal_code,
            contact_name: location.contact_name ?? "",
            contact_email: location.contact_email,
            contact_phone_number: location.contact_phone_number ?? "",
            parcels_max_per_day: 999,
            max_parcels_per_slot: 999,
            default_slot_duration_minutes: 999,
        });

        expect(result).toMatchObject({ success: true });
        const [updated] = await db
            .select()
            .from(pickupLocations)
            .where(eq(pickupLocations.id, location.id));
        expect(updated).toMatchObject({
            name: "Updated location name",
            parcels_max_per_day: 20,
            max_parcels_per_slot: 4,
            default_slot_duration_minutes: 15,
        });
    });

    it("does not show an unrelated daily warning when only the slot limit changes", async () => {
        const firstHousehold = await createTestHousehold({ phone_number: "+46810000201" });
        const secondHousehold = await createTestHousehold({ phone_number: "+46810000202" });
        const { location } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 1, max_parcels_per_slot: 4 },
            { weekdays: [...allWeekdays] },
        );
        const date = daysFromTestNow(1);
        await createTestParcel({
            household_id: firstHousehold.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: date,
        });
        await createTestParcel({
            household_id: secondHousehold.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: new Date(date.getTime() + 30 * 60 * 1000),
        });

        const result = await updateLocationLimits(location.id, {
            parcels_max_per_day: 1,
            max_parcels_per_slot: 3,
        });

        expect(result).toMatchObject({
            success: true,
            data: { status: "updated", conflicts: [] },
        });
    });
});
