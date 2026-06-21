import { describe, expect, it, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestPickedUpParcel,
    resetLocationCounter,
} from "../../factories";
import { TEST_NOW } from "../../test-time";
import {
    foodParcels,
    pickupLocations,
    pickupLocationScheduleDays,
    pickupLocationSchedules,
    scheduleAuditLog,
} from "@/app/db/schema";

type MockSession = { user: { githubUsername: string; name: string; role: "admin" } };
const mockSession: MockSession = {
    user: { githubUsername: "location-delete-test", name: "Location Delete Test", role: "admin" },
};

vi.mock("@/app/utils/auth/protected-action", () => ({
    protectedAdminAction: (fn: (...args: unknown[]) => unknown) => {
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

import { deleteLocation } from "@/app/[locale]/handout-locations/actions";

describe("deleteLocation", () => {
    beforeEach(() => {
        resetLocationCounter();
    });

    it("deletes an unused location and cascades its schedules and days", async () => {
        const db = await getTestDb();
        const { location, schedule } = await createTestLocationWithSchedule();

        await db.insert(scheduleAuditLog).values({
            schedule_id: schedule.id,
            pickup_location_id: location.id,
            action: "created",
            changed_by: "location-delete-test",
            changes_summary: "Audit row should survive location deletion",
        });

        const result = await deleteLocation(location.id);

        expect(result.success).toBe(true);

        const remainingLocations = await db
            .select()
            .from(pickupLocations)
            .where(eq(pickupLocations.id, location.id));
        expect(remainingLocations).toHaveLength(0);

        const remainingSchedules = await db
            .select()
            .from(pickupLocationSchedules)
            .where(eq(pickupLocationSchedules.pickup_location_id, location.id));
        expect(remainingSchedules).toHaveLength(0);

        const remainingDays = await db
            .select()
            .from(pickupLocationScheduleDays)
            .where(eq(pickupLocationScheduleDays.schedule_id, schedule.id));
        expect(remainingDays).toHaveLength(0);

        const auditRows = await db
            .select()
            .from(scheduleAuditLog)
            .where(eq(scheduleAuditLog.pickup_location_id, location.id));
        expect(auditRows).toHaveLength(1);
        expect(auditRows[0].schedule_id).toBe(schedule.id);
    });

    it("blocks deleting a location with past picked-up parcel history", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule();
        const household = await createTestHousehold();
        const pastPickup = new Date(TEST_NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
        pastPickup.setHours(10, 0, 0, 0);

        await createTestPickedUpParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: pastPickup,
            pickup_date_time_latest: new Date(pastPickup.getTime() + 30 * 60 * 1000),
        });

        const result = await deleteLocation(location.id);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("LOCATION_HAS_PARCELS");
        }

        const remainingLocations = await db
            .select()
            .from(pickupLocations)
            .where(eq(pickupLocations.id, location.id));
        expect(remainingLocations).toHaveLength(1);
    });

    it("blocks deleting a location with upcoming parcels", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule();
        const household = await createTestHousehold();

        await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
        });

        const result = await deleteLocation(location.id);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("LOCATION_HAS_PARCELS");
        }

        const remainingLocations = await db
            .select()
            .from(pickupLocations)
            .where(eq(pickupLocations.id, location.id));
        expect(remainingLocations).toHaveLength(1);
    });

    it("leaves related rows intact when delete is blocked by parcel history", async () => {
        const db = await getTestDb();
        const { location, schedule } = await createTestLocationWithSchedule();
        const household = await createTestHousehold();

        const parcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
        });

        const result = await deleteLocation(location.id);

        expect(result.success).toBe(false);

        const locations = await db
            .select()
            .from(pickupLocations)
            .where(eq(pickupLocations.id, location.id));
        const schedules = await db
            .select()
            .from(pickupLocationSchedules)
            .where(eq(pickupLocationSchedules.id, schedule.id));
        const days = await db
            .select()
            .from(pickupLocationScheduleDays)
            .where(eq(pickupLocationScheduleDays.schedule_id, schedule.id));
        const parcels = await db.select().from(foodParcels).where(eq(foodParcels.id, parcel.id));

        expect(locations).toHaveLength(1);
        expect(schedules).toHaveLength(1);
        expect(days.length).toBeGreaterThan(0);
        expect(parcels).toHaveLength(1);
    });
});
