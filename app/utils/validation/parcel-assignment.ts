/**
 * Parcel Assignment Validation Utilities
 *
 * This module provides comprehensive validation for parcel assignment and rescheduling operations.
 * It ensures that parcels are assigned to valid time slots without exceeding capacity limits
 * or creating conflicts.
 *
 * Key validations:
 * - Location and parcel existence
 * - Daily capacity limits (location-specific)
 * - Time slot capacity limits (configurable per location, defaults to 4)
 * - Double booking prevention (one parcel per household per day)
 * - Operating hours validation
 * - Past date prevention
 *
 * @module validation/parcel-assignment
 */

import { and, eq, sql, between, ne, lt, gt } from "drizzle-orm";
import { type PgTransaction } from "drizzle-orm/pg-core";
import { type PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { db } from "@/app/db/drizzle";
import { foodParcels, pickupLocations } from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { Time } from "@/app/utils/time-provider";
import { logError } from "@/app/utils/logger";

// Configuration constants
/** Default maximum number of parcels allowed in a single time slot (used when location has no limit set) */
const DEFAULT_MAX_PARCELS_PER_SLOT = 4;

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

/**
 * Type alias for Drizzle database or transaction
 * Uses a generic type that's compatible with both the main db instance and transaction objects.
 * The 'any' types here are intentional to allow flexibility while still maintaining the core interface.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbOrTransaction = PgTransaction<PostgresJsQueryResultHKT, any, any> | typeof db;

interface ParcelAssignmentParams {
    parcelId: string;
    newLocationId: string;
    newTimeslot: { startTime: Date; endTime: Date };
    newDate: string;
    tx?: DbOrTransaction;
    isNewParcel?: boolean;
    householdId?: string;
}

/**
 * Comprehensive validation for parcel assignment/rescheduling.
 *
 * Validates that a parcel can be assigned to a specific location and time slot
 * by checking multiple constraints:
 * 1. Parcel and location existence (skipped for new parcels)
 * 2. Time slot is not in the past
 * 3. Daily capacity at the location
 * 4. Time slot capacity (concurrent parcels)
 * 5. Household double booking prevention
 *
 * @param params - Validation parameters
 * @param params.parcelId - ID of the parcel to validate (can be temporary for new parcels)
 * @param params.newLocationId - Target location ID
 * @param params.newTimeslot - Target time slot
 * @param params.newDate - Target date (ISO string)
 * @param params.tx - Optional transaction context
 * @param params.isNewParcel - If true, skip parcel existence check (for new parcels not yet in DB)
 * @param params.householdId - Required when isNewParcel is true (household ID for the new parcel)
 * @returns Validation result with success flag and any errors
 *
 * @example
 * ```typescript
 * // Validating an existing parcel
 * const result = await validateParcelAssignment({
 *   parcelId: "parcel-123",
 *   newLocationId: "loc-1",
 *   newTimeslot: { startTime: new Date(), endTime: new Date() },
 *   newDate: "2025-10-01"
 * });
 *
 * // Validating a new parcel
 * const result = await validateParcelAssignment({
 *   parcelId: "temp_12345",
 *   newLocationId: "loc-1",
 *   newTimeslot: { startTime: new Date(), endTime: new Date() },
 *   newDate: "2025-10-01",
 *   isNewParcel: true,
 *   householdId: "household-123"
 * });
 *
 * if (!result.success) {
 *   console.error("Validation failed:", result.errors);
 * }
 * ```
 */
export async function validateParcelAssignment({
    parcelId,
    newLocationId,
    newTimeslot,
    newDate,
    tx,
    isNewParcel = false,
    householdId: providedHouseholdId,
}: ParcelAssignmentParams): Promise<ValidationResult> {
    const dbInstance = tx ?? db;
    const errors: ValidationError[] = [];

    try {
        // 1. Verify parcel exists and get its details (skip for new parcels)
        let householdId: string;

        if (isNewParcel) {
            // For new parcels, use the provided household ID
            if (!providedHouseholdId) {
                errors.push({
                    field: "householdId",
                    code: "HOUSEHOLD_ID_REQUIRED",
                    message: "Household ID is required for new parcel validation",
                    details: { parcelId },
                });
                return { success: false, errors };
            }
            householdId = providedHouseholdId;
        } else {
            // For existing parcels, look up the parcel in the database
            const [parcel] = await dbInstance
                .select({
                    id: foodParcels.id,
                    householdId: foodParcels.household_id,
                    locationId: foodParcels.pickup_location_id,
                })
                .from(foodParcels)
                .where(and(eq(foodParcels.id, parcelId), notDeleted()))
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
            householdId = parcel.householdId;
        }

        // 2. Get location information using the newLocationId
        const [location] = await dbInstance
            .select({
                id: pickupLocations.id,
                maxParcelsPerDay: pickupLocations.parcels_max_per_day,
                maxParcelsPerSlot: pickupLocations.max_parcels_per_slot,
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

        // 3. Validate time slot is not in the past (only for NEW parcels)
        // Existing parcels can be updated even if their time has passed
        if (isNewParcel) {
            const now = new Date();

            if (newTimeslot.startTime <= now) {
                errors.push({
                    field: "timeSlot",
                    code: ValidationErrorCodes.PAST_TIME_SLOT,
                    message: "Cannot create new parcel with pickup time in the past",
                    details: {
                        requestedTime: newTimeslot.startTime.toISOString(),
                        currentTime: now.toISOString(),
                    },
                });
            }
        }

        // 4. Validate daily capacity if set
        if (location.maxParcelsPerDay !== null) {
            const dateInStockholm = Time.fromDate(new Date(newDate));
            const startTimeStockholm = dateInStockholm.startOfDay();
            const endTimeStockholm = dateInStockholm.endOfDay();

            // Use toUTC() to get clean Date objects for database queries (DB stores timestamps in UTC)
            const startDate = startTimeStockholm.toUTC();
            const endDate = endTimeStockholm.toUTC();

            const [{ count }] = await dbInstance
                .select({ count: sql<number>`count(*)` })
                .from(foodParcels)
                .where(
                    and(
                        eq(foodParcels.pickup_location_id, newLocationId),
                        between(foodParcels.pickup_date_time_earliest, startDate, endDate),
                        ne(foodParcels.id, parcelId), // Exclude current parcel
                        notDeleted(),
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
                        date:
                            typeof newDate === "string"
                                ? newDate
                                : new Date(newDate).toISOString().split("T")[0],
                        locationId: newLocationId,
                    } as CapacityValidationDetails,
                });
            }
        }

        // 5. Validate against household double booking on the same day
        const dateInStockholm = Time.fromDate(new Date(newDate));
        const startTimeStockholm = dateInStockholm.startOfDay();
        const endTimeStockholm = dateInStockholm.endOfDay();
        // Use toUTC() to get clean Date objects for database queries (DB stores timestamps in UTC)
        const startDate = startTimeStockholm.toUTC();
        const endDate = endTimeStockholm.toUTC();

        const conflictingParcels = await dbInstance
            .select({
                id: foodParcels.id,
                startTime: foodParcels.pickup_date_time_earliest,
            })
            .from(foodParcels)
            .where(
                and(
                    eq(foodParcels.household_id, householdId),
                    between(foodParcels.pickup_date_time_earliest, startDate, endDate),
                    ne(foodParcels.id, parcelId), // Exclude current parcel
                    notDeleted(),
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
                    householdId: householdId,
                    timeSlot: startTimeStr,
                    date:
                        typeof newDate === "string"
                            ? newDate
                            : new Date(newDate).toISOString().split("T")[0],
                    locationId: newLocationId,
                } as ConflictValidationDetails,
            });
        }

        // 6. Validate slot-level capacity (parcels in the same time slot)
        // Only validate if location has a slot limit configured
        const maxParcelsPerSlot =
            location.maxParcelsPerSlot ?? DEFAULT_MAX_PARCELS_PER_SLOT;

        if (maxParcelsPerSlot !== null) {
            const slotStartUTC = new Date(newTimeslot.startTime);
            const slotEndUTC = new Date(newTimeslot.endTime);

            const [{ slotCount }] = await dbInstance
                .select({ slotCount: sql<number>`count(*)` })
                .from(foodParcels)
                .where(
                    and(
                        eq(foodParcels.pickup_location_id, newLocationId),
                        // Check for overlapping time slots using UTC comparisons
                        lt(foodParcels.pickup_date_time_earliest, slotEndUTC),
                        gt(foodParcels.pickup_date_time_latest, slotStartUTC),
                        ne(foodParcels.id, parcelId), // Exclude current parcel
                        notDeleted(),
                    ),
                )
                .execute();

            // Allow up to maxParcelsPerSlot parcels per time slot
            if (slotCount >= maxParcelsPerSlot) {
                const startTimeStr = Time.fromDate(newTimeslot.startTime).toTimeString();
                errors.push({
                    field: "timeSlot",
                    code: ValidationErrorCodes.MAX_SLOT_CAPACITY_REACHED,
                    message: `Maximum capacity (${maxParcelsPerSlot}) reached for this time slot`,
                    details: {
                        current: slotCount,
                        maximum: maxParcelsPerSlot,
                        date:
                            typeof newDate === "string"
                                ? newDate
                                : new Date(newDate).toISOString().split("T")[0],
                        locationId: newLocationId,
                        timeSlot: startTimeStr,
                    } as CapacityValidationDetails,
                });
            }
        }

        return {
            success: errors.length === 0,
            ...(errors.length > 0 && { errors }),
        };
    } catch (error) {
        logError("Error during parcel assignment validation", error, {
            parcelId,
            newLocationId,
            newDate,
            isNewParcel,
        });
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
 * Helper function to create user-friendly error messages from validation errors.
 *
 * Converts structured validation errors into human-readable messages that can be
 * displayed to end users.
 *
 * @param error - The validation error to format
 * @param locationName - Optional location name for more specific messages
 * @returns A user-friendly error message string
 *
 * @example
 * ```typescript
 * const message = formatValidationError(error, "Central Food Bank");
 * // => "Central Food Bank has reached its maximum capacity of 50 parcels for 2025-10-01"
 * ```
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
        isNewParcel?: boolean;
        householdId?: string;
    }>,
    locationId: string,
    tx?: DbOrTransaction,
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
            isNewParcel: assignment.isNewParcel,
            householdId: assignment.householdId,
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
