import { getTestDb } from "../db/test-db";
import { foodParcels } from "@/app/db/schema";

/**
 * Create a test food parcel.
 * Requires household_id and pickup_location_id.
 */
export async function createTestParcel(overrides: {
    household_id: string;
    pickup_location_id: string;
    pickup_date_time_earliest?: Date;
    pickup_date_time_latest?: Date;
    is_picked_up?: boolean;
    picked_up_at?: Date;
    picked_up_by_user_id?: string;
    deleted_at?: Date;
    deleted_by_user_id?: string;
}) {
    const db = await getTestDb();

    // Default to tomorrow, 30-minute slot
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    tomorrow.setHours(10, 0, 0, 0);

    const earliest = overrides.pickup_date_time_earliest ?? tomorrow;
    const latest =
        overrides.pickup_date_time_latest ?? new Date(earliest.getTime() + 30 * 60 * 1000);

    const [parcel] = await db
        .insert(foodParcels)
        .values({
            household_id: overrides.household_id,
            pickup_location_id: overrides.pickup_location_id,
            pickup_date_time_earliest: earliest,
            pickup_date_time_latest: latest,
            is_picked_up: overrides.is_picked_up ?? false,
            picked_up_at: overrides.picked_up_at,
            picked_up_by_user_id: overrides.picked_up_by_user_id,
            deleted_at: overrides.deleted_at,
            deleted_by_user_id: overrides.deleted_by_user_id,
        })
        .returning();

    return parcel;
}

/**
 * Create a parcel scheduled for today.
 */
export async function createTestParcelForToday(overrides: {
    household_id: string;
    pickup_location_id: string;
    hoursFromNow?: number;
    is_picked_up?: boolean;
}) {
    const now = new Date();
    const earliest = new Date(now.getTime() + (overrides.hoursFromNow ?? 2) * 60 * 60 * 1000);
    const latest = new Date(earliest.getTime() + 30 * 60 * 1000);

    return createTestParcel({
        household_id: overrides.household_id,
        pickup_location_id: overrides.pickup_location_id,
        pickup_date_time_earliest: earliest,
        pickup_date_time_latest: latest,
        is_picked_up: overrides.is_picked_up,
    });
}

/**
 * Create a soft-deleted parcel.
 * Useful for testing partial unique index behavior.
 */
export async function createTestDeletedParcel(overrides: {
    household_id: string;
    pickup_location_id: string;
    pickup_date_time_earliest?: Date;
    pickup_date_time_latest?: Date;
    deleted_by_user_id?: string;
}) {
    return createTestParcel({
        ...overrides,
        deleted_at: new Date(),
        deleted_by_user_id: overrides.deleted_by_user_id ?? "test-admin",
    });
}

/**
 * Create a picked-up parcel.
 */
export async function createTestPickedUpParcel(overrides: {
    household_id: string;
    pickup_location_id: string;
    pickup_date_time_earliest?: Date;
    pickup_date_time_latest?: Date;
    picked_up_by_user_id?: string;
}) {
    const pickedUpAt = new Date();

    return createTestParcel({
        ...overrides,
        is_picked_up: true,
        picked_up_at: pickedUpAt,
        picked_up_by_user_id: overrides.picked_up_by_user_id ?? "test-admin",
    });
}
