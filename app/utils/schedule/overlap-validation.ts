import { eq } from "drizzle-orm";
import { db } from "@/app/db/drizzle";
import { pickupLocationSchedules } from "@/app/db/schema";
import { ScheduleInput } from "@/app/[locale]/handout-locations/types";

// Define types for the database query results
interface ExistingSchedule {
    id: string;
    start_date: string;
    end_date: string;
    name: string;
}

/**
 * Validates that a schedule doesn't overlap with existing schedules for a location
 *
 * @param scheduleData - The schedule data to validate
 * @param locationId - The pickup location ID
 * @param excludeScheduleId - Optional schedule ID to exclude from overlap check (for updates)
 * @throws Error if validation fails or overlap is found
 */
export async function validateScheduleOverlap(
    scheduleData: ScheduleInput,
    locationId: string,
    excludeScheduleId?: string,
): Promise<void> {
    // Import validation functions
    const { findOverlappingSchedule } = await import("@/app/utils/schedule/schedule-validation");

    // Get existing schedules for this location to check for overlaps
    const existingSchedules = await db
        .select({
            id: pickupLocationSchedules.id,
            start_date: pickupLocationSchedules.start_date,
            end_date: pickupLocationSchedules.end_date,
            name: pickupLocationSchedules.name,
        })
        .from(pickupLocationSchedules)
        .where(eq(pickupLocationSchedules.pickup_location_id, locationId));

    // Convert to the format expected by validation
    const existingDateRanges = existingSchedules.map((schedule: ExistingSchedule) => ({
        id: schedule.id,
        start_date: new Date(schedule.start_date),
        end_date: new Date(schedule.end_date),
    }));

    const newScheduleRange = {
        id: excludeScheduleId, // Include schedule ID for updates to exclude it from overlap check
        start_date:
            scheduleData.start_date instanceof Date
                ? scheduleData.start_date
                : new Date(scheduleData.start_date),
        end_date:
            scheduleData.end_date instanceof Date
                ? scheduleData.end_date
                : new Date(scheduleData.end_date),
    };

    // Check for overlaps
    const overlap = findOverlappingSchedule(newScheduleRange, existingDateRanges);
    if (overlap) {
        const overlappingSchedule = existingSchedules.find(
            (s: ExistingSchedule) => s.id === overlap.id,
        );
        throw new Error(
            `Schedule overlaps with existing schedule "${overlappingSchedule?.name || "Unknown"}" (${overlap.start_date.toISOString().split("T")[0]} - ${overlap.end_date.toISOString().split("T")[0]})`,
        );
    }
}
