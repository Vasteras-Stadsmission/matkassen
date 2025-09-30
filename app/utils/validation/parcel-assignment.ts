import { and, eq, sql, between, ne } from "drizzle-orm";
import { db } from "@/app/db/drizzle";
import { foodParcels, pickupLocations } from "@/app/db/schema";
import { Time } from "@/app/utils/time-provider";

// Structured error types for validation
export interface ValidationError {
    field: string;
    code: string;
    message: string;
    details?: Record<string, unknown>;
}

export interface ValidationResult {
    success: boolean;
    errors?: ValidationError[];
}

export interface CapacityValidationDetails extends Record<string, unknown> {
    current: number;
    maximum: number;
    date: string;
    locationId: string;
}

export interface ConflictValidationDetails extends Record<string, unknown> {
    conflictingParcelId: string;
    householdId: string;
    timeSlot: string;
    date: string;
    locationId: string;
}

export interface ScheduleValidationDetails extends Record<string, unknown> {
    date: string;
    timeSlot: string;
    locationId: string;
    reason?: string;
}

// Error codes for consistent error handling
export const ValidationErrorCodes = {
    PARCEL_NOT_FOUND: "PARCEL_NOT_FOUND",
    LOCATION_NOT_FOUND: "LOCATION_NOT_FOUND",
    MAX_DAILY_CAPACITY_REACHED: "MAX_DAILY_CAPACITY_REACHED",
    MAX_SLOT_CAPACITY_REACHED: "MAX_SLOT_CAPACITY_REACHED",
    TIME_SLOT_CONFLICT: "TIME_SLOT_CONFLICT",
    OUTSIDE_OPERATING_HOURS: "OUTSIDE_OPERATING_HOURS",
    PAST_TIME_SLOT: "PAST_TIME_SLOT",
    HOUSEHOLD_DOUBLE_BOOKING: "HOUSEHOLD_DOUBLE_BOOKING",
    INVALID_TIME_SLOT: "INVALID_TIME_SLOT",
} as const;

export type ValidationErrorCode = (typeof ValidationErrorCodes)[keyof typeof ValidationErrorCodes];

interface ParcelAssignmentParams {
    parcelId: string;
    newLocationId: string;
    newTimeslot: { startTime: Date; endTime: Date };
    newDate: string;
    tx?: unknown;
}

/**
 * Comprehensive validation for parcel assignment/rescheduling
 */
export async function validateParcelAssignment({
    parcelId,
    newLocationId,
    newTimeslot,
    newDate,
    tx,
}: ParcelAssignmentParams): Promise<ValidationResult> {
    const dbInstance = tx ? (tx as typeof db) : db;
    const errors: ValidationError[] = [];

    try {
        // 1. Verify parcel exists and get its details
        const [parcel] = await dbInstance
            .select({
                id: foodParcels.id,
                householdId: foodParcels.household_id,
                locationId: foodParcels.pickup_location_id,
            })
            .from(foodParcels)
            .where(eq(foodParcels.id, parcelId))
            .limit(1);

        if (!parcel) {
            errors.push({
                field: "parcelId",
                code: ValidationErrorCodes.PARCEL_NOT_FOUND,
                message: "Food parcel not found",
                details: { parcelId },
            });
            return { success: false, errors };
        }

        // 2. Get location information using the newLocationId
        const [location] = await dbInstance
            .select({
                id: pickupLocations.id,
                maxParcelsPerDay: pickupLocations.parcels_max_per_day,
                slotDuration: pickupLocations.default_slot_duration_minutes,
                name: pickupLocations.name,
            })
            .from(pickupLocations)
            .where(eq(pickupLocations.id, newLocationId))
            .limit(1);

        if (!location) {
            errors.push({
                field: "locationId",
                code: ValidationErrorCodes.LOCATION_NOT_FOUND,
                message: "Pickup location not found",
                details: { locationId: newLocationId },
            });
            return { success: false, errors };
        }

        // 3. Validate time slot is not in the past
        const now = new Date();
        if (newTimeslot.startTime <= now) {
            errors.push({
                field: "timeSlot",
                code: ValidationErrorCodes.PAST_TIME_SLOT,
                message: "Cannot schedule pickup in the past",
                details: {
                    requestedTime: newTimeslot.startTime.toISOString(),
                    currentTime: now.toISOString(),
                },
            });
        }

        // 4. Validate daily capacity if set
        if (location.maxParcelsPerDay !== null) {
            const dateInStockholm = Time.fromDate(new Date(newDate));
            const startTimeStockholm = dateInStockholm.startOfDay();
            const endTimeStockholm = dateInStockholm.endOfDay();
            const startDate = startTimeStockholm.toDate();
            const endDate = endTimeStockholm.toDate();

            const [{ count }] = await dbInstance
                .select({ count: sql<number>`count(*)` })
                .from(foodParcels)
                .where(
                    and(
                        eq(foodParcels.pickup_location_id, newLocationId),
                        between(foodParcels.pickup_date_time_earliest, startDate, endDate),
                        ne(foodParcels.id, parcelId), // Exclude current parcel
                    ),
                )
                .execute();

            if (count >= location.maxParcelsPerDay) {
                errors.push({
                    field: "capacity",
                    code: ValidationErrorCodes.MAX_DAILY_CAPACITY_REACHED,
                    message: `Maximum daily capacity (${location.maxParcelsPerDay}) reached for this date`,
                    details: {
                        current: count,
                        maximum: location.maxParcelsPerDay,
                        date: newDate,
                        locationId: newLocationId,
                    } as CapacityValidationDetails,
                });
            }
        }

        // 5. Validate against household double booking on the same day
        const dateInStockholm = Time.fromDate(new Date(newDate));
        const startTimeStockholm = dateInStockholm.startOfDay();
        const endTimeStockholm = dateInStockholm.endOfDay();
        const startDate = startTimeStockholm.toDate();
        const endDate = endTimeStockholm.toDate();

        const conflictingParcels = await dbInstance
            .select({
                id: foodParcels.id,
                startTime: foodParcels.pickup_date_time_earliest,
            })
            .from(foodParcels)
            .where(
                and(
                    eq(foodParcels.household_id, parcel.householdId),
                    between(foodParcels.pickup_date_time_earliest, startDate, endDate),
                    ne(foodParcels.id, parcelId), // Exclude current parcel
                ),
            );

        if (conflictingParcels.length > 0) {
            const conflictingParcel = conflictingParcels[0];
            const startTimeStr = Time.fromDate(newTimeslot.startTime).toTimeString();
            errors.push({
                field: "timeSlot",
                code: ValidationErrorCodes.HOUSEHOLD_DOUBLE_BOOKING,
                message: "Household already has a parcel scheduled for this date",
                details: {
                    conflictingParcelId: conflictingParcel.id,
                    householdId: parcel.householdId,
                    timeSlot: startTimeStr,
                    date: newDate,
                } as ConflictValidationDetails,
            });
        }

        // 6. Validate slot-level capacity (parcels in the same time slot)
        const slotStart = newTimeslot.startTime;
        const slotEnd = newTimeslot.endTime;

        const [{ slotCount }] = await dbInstance
            .select({ slotCount: sql<number>`count(*)` })
            .from(foodParcels)
            .where(
                and(
                    eq(foodParcels.pickup_location_id, newLocationId),
                    // Check for overlapping time slots
                    sql`${foodParcels.pickup_date_time_earliest} < ${slotEnd}`,
                    sql`${foodParcels.pickup_date_time_latest} > ${slotStart}`,
                    ne(foodParcels.id, parcelId), // Exclude current parcel
                ),
            )
            .execute();

        // Allow up to 4 parcels per time slot (configurable)
        const maxParcelsPerSlot = 4;
        if (slotCount >= maxParcelsPerSlot) {
            const startTimeStr = Time.fromDate(newTimeslot.startTime).toTimeString();
            errors.push({
                field: "timeSlot",
                code: ValidationErrorCodes.MAX_SLOT_CAPACITY_REACHED,
                message: `Maximum capacity (${maxParcelsPerSlot}) reached for this time slot`,
                details: {
                    current: slotCount,
                    maximum: maxParcelsPerSlot,
                    date: newDate,
                    locationId: newLocationId,
                    timeSlot: startTimeStr,
                } as CapacityValidationDetails,
            });
        }

        return {
            success: errors.length === 0,
            ...(errors.length > 0 && { errors }),
        };
    } catch (error) {
        console.error("Error during parcel assignment validation:", error);
        errors.push({
            field: "general",
            code: "VALIDATION_ERROR",
            message: "An unexpected error occurred during validation",
            details: { error: error instanceof Error ? error.message : String(error) },
        });
        return { success: false, errors };
    }
}

/**
 * Helper function to create user-friendly error messages
 */
export function formatValidationError(error: ValidationError, locationName?: string): string {
    switch (error.code) {
        case ValidationErrorCodes.MAX_DAILY_CAPACITY_REACHED:
            const capacityDetails = error.details as CapacityValidationDetails;
            return `${locationName || "This location"} has reached its maximum capacity of ${capacityDetails.maximum} parcels for ${capacityDetails.date}`;

        case ValidationErrorCodes.MAX_SLOT_CAPACITY_REACHED:
            return `This time slot is fully booked. Please select a different time.`;

        case ValidationErrorCodes.HOUSEHOLD_DOUBLE_BOOKING:
            const conflictDetails = error.details as ConflictValidationDetails;
            return `This household already has a parcel scheduled for ${conflictDetails.date}`;

        case ValidationErrorCodes.OUTSIDE_OPERATING_HOURS:
            const scheduleDetails = error.details as ScheduleValidationDetails;
            return scheduleDetails.reason || "The selected time is outside operating hours";

        case ValidationErrorCodes.PAST_TIME_SLOT:
            return "Cannot schedule pickup in the past";

        default:
            return error.message;
    }
}

/**
 * Validate multiple parcel assignments (for bulk operations)
 */
export async function validateBulkParcelAssignments(
    assignments: Array<{
        parcelId: string;
        timeslot: {
            date: string;
            startTime: Date;
            endTime: Date;
        };
    }>,
    locationId: string,
    tx?: unknown,
): Promise<ValidationResult> {
    const allErrors: ValidationError[] = [];

    for (const assignment of assignments) {
        const result = await validateParcelAssignment({
            parcelId: assignment.parcelId,
            newLocationId: locationId,
            newTimeslot: {
                startTime: assignment.timeslot.startTime,
                endTime: assignment.timeslot.endTime,
            },
            newDate: assignment.timeslot.date,
            tx,
        });

        // Add field prefixes to distinguish between different parcels in bulk operations
        if (result.errors) {
            const prefixedErrors = result.errors.map(error => ({
                ...error,
                field: `parcel_${assignment.parcelId}_${error.field}`,
            }));
            allErrors.push(...prefixedErrors);
        }
    }

    return {
        success: allErrors.length === 0,
        ...(allErrors.length > 0 && { errors: allErrors }),
    };
}
