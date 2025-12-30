import { getTestDb } from "../db/test-db";
import { foodParcels } from "@/app/db/schema";
import { TEST_NOW } from "../test-time";

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
    no_show_at?: Date;
    no_show_by_user_id?: string;
    deleted_at?: Date;
    deleted_by_user_id?: string;
}) {
    const db = await getTestDb();

    // Default to tomorrow relative to TEST_NOW, 30-minute slot
    const tomorrow = new Date(TEST_NOW.getTime() + 24 * 60 * 60 * 1000);
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
            no_show_at: overrides.no_show_at,
            no_show_by_user_id: overrides.no_show_by_user_id,
            deleted_at: overrides.deleted_at,
            deleted_by_user_id: overrides.deleted_by_user_id,
        })
        .returning();

    return parcel;
}

/**
 * Create a parcel scheduled for "today" (relative to TEST_NOW).
 */
export async function createTestParcelForToday(overrides: {
    household_id: string;
    pickup_location_id: string;
    hoursFromNow?: number;
    is_picked_up?: boolean;
}) {
    // Use deterministic base time
    const earliest = new Date(TEST_NOW.getTime() + (overrides.hoursFromNow ?? 2) * 60 * 60 * 1000);
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
        // Use deterministic timestamp
        deleted_at: new Date(TEST_NOW),
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
    picked_up_at?: Date;
    picked_up_by_user_id?: string;
}) {
    // Use deterministic timestamp if not provided
    const pickedUpAt = overrides.picked_up_at ?? new Date(TEST_NOW);

    return createTestParcel({
        ...overrides,
        is_picked_up: true,
        picked_up_at: pickedUpAt,
        picked_up_by_user_id: overrides.picked_up_by_user_id ?? "test-admin",
    });
}

/**
 * Create a no-show parcel.
 */
export async function createTestNoShowParcel(overrides: {
    household_id: string;
    pickup_location_id: string;
    pickup_date_time_earliest?: Date;
    pickup_date_time_latest?: Date;
    no_show_at?: Date;
    no_show_by_user_id?: string;
}) {
    // Use deterministic timestamp if not provided
    const noShowAt = overrides.no_show_at ?? new Date(TEST_NOW);

    return createTestParcel({
        ...overrides,
        is_picked_up: false,
        no_show_at: noShowAt,
        no_show_by_user_id: overrides.no_show_by_user_id ?? "test-admin",
    });
}
