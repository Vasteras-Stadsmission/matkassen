import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/app/db/drizzle";
import { foodParcels, pickupLocations } from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { isParcelOutsideOpeningHours } from "@/app/utils/schedule/outside-hours-filter";
import { fetchPickupLocationSchedules } from "@/app/utils/schedule/pickup-location-schedules";
import { Time } from "@/app/utils/time-provider";
import { logError } from "@/app/utils/logger";

export async function computeOutsideHoursCountForLocation(locationId: string): Promise<number> {
    const now = Time.now();

    let parcels;
    try {
        parcels = await db
            .select({
                id: foodParcels.id,
                pickupEarliestTime: foodParcels.pickup_date_time_earliest,
                pickupLatestTime: foodParcels.pickup_date_time_latest,
                isPickedUp: foodParcels.is_picked_up,
            })
            .from(foodParcels)
            .where(
                and(
                    eq(foodParcels.pickup_location_id, locationId),
                    eq(foodParcels.is_picked_up, false),
                    sql`${foodParcels.no_show_at} IS NULL`,
                    gt(foodParcels.pickup_date_time_earliest, now.toUTC()),
                    notDeleted(),
                ),
            );
    } catch (error) {
        logError("Error getting outside-hours count parcels for location", error, { locationId });
        return 0;
    }

    if (parcels.length === 0) return 0;

    const locationSchedules = await fetchPickupLocationSchedules(locationId);
    if (!locationSchedules?.schedules) return parcels.length;

    return parcels.filter(parcel =>
        isParcelOutsideOpeningHours(
            {
                id: parcel.id,
                pickupEarliestTime: new Date(parcel.pickupEarliestTime),
                pickupLatestTime: new Date(parcel.pickupLatestTime),
                isPickedUp: parcel.isPickedUp,
            },
            locationSchedules,
        ),
    ).length;
}

export async function recomputeOutsideHoursCountForLocation(locationId: string): Promise<number> {
    try {
        const totalCount = await computeOutsideHoursCountForLocation(locationId);

        await db
            .update(pickupLocations)
            .set({ outside_hours_count: totalCount })
            .where(eq(pickupLocations.id, locationId));

        return totalCount;
    } catch (error) {
        logError("Error recomputing outside-hours count", error, { locationId });
        return 0;
    }
}
