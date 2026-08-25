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
import { db } from "@/app/db/drizzle";
import { foodParcels, pickupLocations } from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { type DbOrTransaction } from "@/app/db/types";
import { Time } from "@/app/utils/time-provider";
import { logError } from "@/app/utils/logger";
import {
    loadLocationLimitContext,
    lockPickupLocationsForCapacity,
    stockholmDateKey,
    type CapacityTransaction,
} from "@/app/utils/capacity/daily-limits";
import { fetchPickupLocationSchedules } from "@/app/utils/schedule/pickup-location-schedules";
import { isParcelOutsideOpeningHours } from "@/app/utils/schedule/outside-hours-filter";

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
    tx?: DbOrTransaction;
    isNewParcel?: boolean;
    householdId?: string;
}

export function hasPositiveSlotDuration(startTime: Date, endTime: Date): boolean {
    return endTime.getTime() > startTime.getTime();
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
        if (tx) {
            await lockPickupLocationsForCapacity(tx as CapacityTransaction, [newLocationId]);
        }

        // 1. Verify parcel exists and get its details (skip for new parcels)
        let householdId: string;
        let existingParcelLocationId: string | null = null;
        let existingParcelDateKey: string | null = null;
        let existingParcelStart: Date | null = null;
        let existingParcelEnd: Date | null = null;

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
                    pickupEarliest: foodParcels.pickup_date_time_earliest,
                    pickupLatest: foodParcels.pickup_date_time_latest,
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
            existingParcelLocationId = parcel.locationId;
            existingParcelDateKey = stockholmDateKey(parcel.pickupEarliest);
            existingParcelStart = parcel.pickupEarliest;
            existingParcelEnd = parcel.pickupLatest;
        }

        // 2. Get location information using the newLocationId
        const [location] = await dbInstance
            .select({
                id: pickupLocations.id,
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

        const timeSlotChanged =
            isNewParcel ||
            existingParcelStart?.getTime() !== newTimeslot.startTime.getTime() ||
            existingParcelEnd?.getTime() !== newTimeslot.endTime.getTime();
        if (
            timeSlotChanged &&
            !hasPositiveSlotDuration(newTimeslot.startTime, newTimeslot.endTime)
        ) {
            errors.push({
                field: "timeSlot",
                code: ValidationErrorCodes.INVALID_TIME_SLOT,
                message: "Pickup time slot has an invalid duration",
                details: {
                    configuredDurationMinutes: location.slotDuration,
                    startTime: newTimeslot.startTime.toISOString(),
                    endTime: newTimeslot.endTime.toISOString(),
                    locationId: newLocationId,
                },
            });
        }

        const capacityDateKey = stockholmDateKey(newTimeslot.startTime);
        const limitContext = await loadLocationLimitContext(dbInstance, newLocationId, [
            capacityDateKey,
        ]);
        const effectiveDailyLimit = limitContext.effectiveDailyLimits[capacityDateKey];

        const schedules = await fetchPickupLocationSchedules(newLocationId, dbInstance);
        if (
            isParcelOutsideOpeningHours(
                {
                    id: parcelId,
                    pickupEarliestTime: newTimeslot.startTime,
                    pickupLatestTime: newTimeslot.endTime,
                    isPickedUp: false,
                },
                schedules,
                { onError: "return-true" },
            )
        ) {
            errors.push({
                field: "timeSlot",
                code: ValidationErrorCodes.OUTSIDE_OPERATING_HOURS,
                message: "Selected time is outside operating hours",
                details: {
                    date: capacityDateKey,
                    timeSlot: `${newTimeslot.startTime.toISOString()}-${newTimeslot.endTime.toISOString()}`,
                    locationId: newLocationId,
                } as ScheduleValidationDetails,
            });
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

        // 4. Validate the effective daily capacity for this specific Stockholm date.
        if (effectiveDailyLimit !== null) {
            const dateInStockholm = Time.fromDate(newTimeslot.startTime);
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

            const increasesDailyCount =
                isNewParcel ||
                existingParcelLocationId !== newLocationId ||
                existingParcelDateKey !== capacityDateKey;

            if (increasesDailyCount && count >= effectiveDailyLimit) {
                errors.push({
                    field: "capacity",
                    code: ValidationErrorCodes.MAX_DAILY_CAPACITY_REACHED,
                    message: `Maximum daily capacity (${effectiveDailyLimit}) reached for this date`,
                    details: {
                        current: count,
                        maximum: effectiveDailyLimit,
                        date: capacityDateKey,
                        locationId: newLocationId,
                    } as CapacityValidationDetails,
                });
            }
        }

        // 5. Validate against household double booking on the same day
        const dateInStockholm = Time.fromDate(newTimeslot.startTime);
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
                    date: capacityDateKey,
                    locationId: newLocationId,
                } as ConflictValidationDetails,
            });
        }

        // 6. Validate slot-level capacity (parcels in the same time slot)
        // A null slot limit means there is no tighter independent slot ceiling.
        // The effective daily limit above still caps how many parcels can occupy any one slot.
        const maxParcelsPerSlot = location.maxParcelsPerSlot;

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
                        date: capacityDateKey,
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

    // Individual validation sees only committed rows. Include all new rows from this request in
    // the final daily and overlapping-slot totals so one bulk request cannot claim the same last
    // place more than once.
    const newAssignments = assignments.filter(assignment => assignment.isNewParcel);
    const dateKeys = [
        ...new Set(
            newAssignments.map(assignment => stockholmDateKey(assignment.timeslot.startTime)),
        ),
    ];

    if (newAssignments.length > 0) {
        const limitContext = await loadLocationLimitContext(
            dbInstanceFor(tx),
            locationId,
            dateKeys,
        );

        for (const dateKey of dateKeys) {
            const assignmentsOnDate = newAssignments.filter(
                assignment => stockholmDateKey(assignment.timeslot.startTime) === dateKey,
            );
            const effectiveLimit = limitContext.effectiveDailyLimits[dateKey];
            if (effectiveLimit === null) continue;

            const dateInStockholm = Time.fromDate(assignmentsOnDate[0].timeslot.startTime);
            const [{ count }] = await dbInstanceFor(tx)
                .select({ count: sql<number>`count(*)` })
                .from(foodParcels)
                .where(
                    and(
                        eq(foodParcels.pickup_location_id, locationId),
                        between(
                            foodParcels.pickup_date_time_earliest,
                            dateInStockholm.startOfDay().toUTC(),
                            dateInStockholm.endOfDay().toUTC(),
                        ),
                        notDeleted(),
                    ),
                )
                .execute();

            if (count + assignmentsOnDate.length > effectiveLimit) {
                allErrors.push({
                    field: `location_${locationId}_capacity`,
                    code: ValidationErrorCodes.MAX_DAILY_CAPACITY_REACHED,
                    message: `Maximum daily capacity (${effectiveLimit}) reached for this date`,
                    details: {
                        current: count + assignmentsOnDate.length,
                        maximum: effectiveLimit,
                        date: dateKey,
                        locationId,
                    },
                });
            }
        }

        if (limitContext.explicitSlotLimit !== null) {
            for (const assignment of newAssignments) {
                const [{ slotCount }] = await dbInstanceFor(tx)
                    .select({ slotCount: sql<number>`count(*)` })
                    .from(foodParcels)
                    .where(
                        and(
                            eq(foodParcels.pickup_location_id, locationId),
                            lt(foodParcels.pickup_date_time_earliest, assignment.timeslot.endTime),
                            gt(foodParcels.pickup_date_time_latest, assignment.timeslot.startTime),
                            notDeleted(),
                        ),
                    )
                    .execute();
                const incomingOverlapCount = newAssignments.filter(
                    candidate =>
                        candidate.timeslot.startTime < assignment.timeslot.endTime &&
                        candidate.timeslot.endTime > assignment.timeslot.startTime,
                ).length;

                if (slotCount + incomingOverlapCount > limitContext.explicitSlotLimit) {
                    allErrors.push({
                        field: `parcel_${assignment.parcelId}_timeSlot`,
                        code: ValidationErrorCodes.MAX_SLOT_CAPACITY_REACHED,
                        message: `Maximum capacity (${limitContext.explicitSlotLimit}) reached for this time slot`,
                        details: {
                            current: slotCount + incomingOverlapCount,
                            maximum: limitContext.explicitSlotLimit,
                            date: stockholmDateKey(assignment.timeslot.startTime),
                            locationId,
                        },
                    });
                }
            }
        }
    }

    return {
        success: allErrors.length === 0,
        ...(allErrors.length > 0 && { errors: allErrors }),
    };
}

function dbInstanceFor(tx?: DbOrTransaction): DbOrTransaction {
    return tx ?? db;
}

export interface ParcelAssignmentFormInput {
    id?: string;
    householdId: string;
    locationId: string;
    pickupDate: Date;
    pickupStartTime: Date;
    pickupEndTime: Date;
}

export interface ParcelAssignmentFormValidationResult {
    success: boolean;
    errors: ValidationError[];
}

export async function validateParcelAssignmentsForForm(
    parcels: ParcelAssignmentFormInput[],
    tx?: DbOrTransaction,
): Promise<ParcelAssignmentFormValidationResult> {
    try {
        if (parcels.length === 0) {
            return { success: true, errors: [] };
        }

        const locationIds = [...new Set(parcels.map(parcel => parcel.locationId))].sort();

        if (tx) {
            await lockPickupLocationsForCapacity(tx as CapacityTransaction, locationIds);
        }

        const errors: ValidationError[] = [];
        for (const locationId of locationIds) {
            const assignments = parcels
                .map((parcel, index) => ({ parcel, index }))
                .filter(({ parcel }) => parcel.locationId === locationId)
                .map(({ parcel, index }) => {
                    const isNewParcel = !parcel.id;
                    return {
                        parcelId: parcel.id || `temp_${index}`,
                        timeslot: {
                            date: stockholmDateKey(parcel.pickupStartTime),
                            startTime: parcel.pickupStartTime,
                            endTime: parcel.pickupEndTime,
                        },
                        isNewParcel,
                        householdId: isNewParcel ? parcel.householdId : undefined,
                    };
                });
            const result = await validateBulkParcelAssignments(assignments, locationId, tx);
            errors.push(...(result.errors ?? []));
        }

        const householdDateCounts = new Map<string, number>();
        for (const parcel of parcels) {
            const key = `${parcel.householdId}-${stockholmDateKey(parcel.pickupStartTime)}`;
            householdDateCounts.set(key, (householdDateCounts.get(key) ?? 0) + 1);
        }
        for (const [key, count] of householdDateCounts) {
            if (count <= 1) continue;
            errors.push({
                field: "timeSlot",
                code: ValidationErrorCodes.HOUSEHOLD_DOUBLE_BOOKING,
                message: "Household already has a parcel scheduled for this date",
                details: { key },
            });
        }

        return {
            success: errors.length === 0,
            errors,
        };
    } catch (error) {
        logError("Error validating parcel assignments", error, {
            action: "validateParcelAssignmentsForForm",
            parcelCount: parcels.length,
        });
        return {
            success: false,
            errors: [
                {
                    field: "general",
                    code: "VALIDATION_ERROR",
                    message: "An error occurred during validation",
                },
            ],
        };
    }
}
