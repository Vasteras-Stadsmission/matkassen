import { and, eq, gt, sql } from "drizzle-orm";
import {
    foodParcels,
    pickupLocations,
    pickupLocationScheduleDays,
    pickupLocationSchedules,
} from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import type { FoodParcel } from "@/app/[locale]/households/enroll/types";
import { ParcelValidationError } from "@/app/utils/errors/validation-errors";
import type { ParcelActorSession, ParcelTransaction } from "@/app/utils/parcels/state-transitions";
import {
    isParcelOutsideOpeningHours,
    type LocationScheduleInfo,
} from "@/app/utils/schedule/outside-hours-filter";
import { Time } from "@/app/utils/time-provider";
import {
    type ValidationError,
    ValidationErrorCodes,
} from "@/app/utils/validation/parcel-assignment";

export interface ApplyHouseholdParcelScheduleChangesArgs {
    householdId: string;
    pickupLocationId: string;
    parcels: FoodParcel[];
    session: ParcelActorSession;
}

export interface HouseholdParcelScheduleChangeSummary {
    createdCount: number;
    updatedParcelIds: string[];
    removedParcelIds: string[];
    affectedLocationIds: string[];
}

interface ExistingFutureParcel {
    id: string;
    locationId: string;
    earliest: Date;
    latest: Date;
    isPickedUp?: boolean | null;
    noShowAt?: Date | null;
}

interface FinalStateParcel {
    id: string;
    householdId: string;
    locationId: string;
    earliest: Date;
    latest: Date;
}

const parcelKey = (locationId: string, earliest: Date, latest: Date) =>
    `${locationId}-${earliest.toISOString()}-${latest.toISOString()}`;

function uniqueIds(ids: Array<string | null | undefined>): string[] {
    return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function isTerminal(parcel: ExistingFutureParcel): boolean {
    return Boolean(parcel.isPickedUp || parcel.noShowAt);
}

function buildPastParcelValidationError(parcels: FoodParcel[]): ParcelValidationError {
    const dates = parcels.map(p => p.pickupEarliestTime.toISOString().split("T")[0]).join(", ");

    return new ParcelValidationError("Cannot create parcels with past pickup times", [
        {
            field: "parcels",
            code: "PAST_PICKUP_TIME",
            message: `Cannot create parcels with past pickup times for: ${dates}. Please select a future time or remove these dates.`,
            details: { affectedDates: dates },
        },
    ]);
}

function buildTerminalParcelValidationError(parcelId: string): ParcelValidationError {
    return new ParcelValidationError("Parcel validation failed", [
        {
            field: `parcel_${parcelId}`,
            code: "TERMINAL_PARCEL",
            message:
                "Cannot update or remove a parcel that has already been picked up or marked as no-show",
            details: { parcelId },
        },
    ]);
}

function stockholmDate(date: Date): string {
    return Time.fromDate(date).toDateString();
}

function timeSlotLabel(earliest: Date, latest: Date): string {
    return `${Time.fromDate(earliest).toTimeString()}-${Time.fromDate(latest).toTimeString()}`;
}

function overlaps(a: FinalStateParcel, b: Pick<FinalStateParcel, "earliest" | "latest">): boolean {
    return a.earliest < b.latest && a.latest > b.earliest;
}

function hasDesiredParcelChanged(
    existing: ExistingFutureParcel,
    desired: FoodParcel,
    pickupLocationId: string,
): boolean {
    return (
        existing.locationId !== pickupLocationId ||
        existing.earliest.getTime() !== desired.pickupEarliestTime.getTime() ||
        existing.latest.getTime() !== desired.pickupLatestTime.getTime()
    );
}

async function fetchPickupLocationSchedulesForValidation(
    tx: ParcelTransaction,
    locationId: string,
): Promise<LocationScheduleInfo> {
    const currentDateStr = Time.now().toDateString();

    const schedules = await tx
        .select({
            id: pickupLocationSchedules.id,
            name: pickupLocationSchedules.name,
            startDate: pickupLocationSchedules.start_date,
            endDate: pickupLocationSchedules.end_date,
        })
        .from(pickupLocationSchedules)
        .where(
            and(
                eq(pickupLocationSchedules.pickup_location_id, locationId),
                sql`${pickupLocationSchedules.end_date} >= ${currentDateStr}::date`,
            ),
        );

    const schedulesWithDays = await Promise.all(
        schedules
            .filter(schedule => schedule.startDate && schedule.endDate)
            .map(async schedule => {
                const days = await tx
                    .select({
                        weekday: pickupLocationScheduleDays.weekday,
                        isOpen: pickupLocationScheduleDays.is_open,
                        openingTime: pickupLocationScheduleDays.opening_time,
                        closingTime: pickupLocationScheduleDays.closing_time,
                    })
                    .from(pickupLocationScheduleDays)
                    .where(eq(pickupLocationScheduleDays.schedule_id, schedule.id));

                return {
                    ...schedule,
                    days: days.filter(day => day.weekday),
                };
            }),
    );

    return { schedules: schedulesWithDays };
}

async function validateOpeningHours(
    tx: ParcelTransaction,
    locationId: string,
    parcels: FoodParcel[],
): Promise<ValidationError[]> {
    const schedules = await fetchPickupLocationSchedulesForValidation(tx, locationId);
    return (
        schedules.schedules.length === 0
            ? parcels
            : parcels.filter(parcel =>
                  isParcelOutsideOpeningHours(
                      {
                          id: parcel.id ?? `new-${parcel.pickupEarliestTime.toISOString()}`,
                          pickupEarliestTime: parcel.pickupEarliestTime,
                          pickupLatestTime: parcel.pickupLatestTime,
                          isPickedUp: false,
                      },
                      schedules,
                      { onError: "return-true" },
                  ),
              )
    ).map(parcel => {
        return {
            field: `parcel_${parcel.id ?? parcel.pickupEarliestTime.toISOString()}_timeSlot`,
            code: ValidationErrorCodes.OUTSIDE_OPERATING_HOURS,
            message: "Selected pickup time is outside opening hours",
            details: {
                date: stockholmDate(parcel.pickupEarliestTime),
                timeSlot: timeSlotLabel(parcel.pickupEarliestTime, parcel.pickupLatestTime),
                locationId,
            },
        };
    });
}

function addUniqueError(errors: ValidationError[], error: ValidationError): void {
    const key = JSON.stringify({
        code: error.code,
        field: error.field,
        details: error.details,
    });

    const exists = errors.some(
        existing =>
            JSON.stringify({
                code: existing.code,
                field: existing.field,
                details: existing.details,
            }) === key,
    );

    if (!exists) {
        errors.push(error);
    }
}

async function validateFinalState(
    tx: ParcelTransaction,
    args: ApplyHouseholdParcelScheduleChangesArgs,
    existingFutureParcels: ExistingFutureParcel[],
    desiredFutureParcels: FoodParcel[],
    changedFutureParcels: FoodParcel[],
    now: Date,
): Promise<ValidationError[]> {
    if (changedFutureParcels.length === 0) {
        return [];
    }

    const [location] = await tx
        .select({
            id: pickupLocations.id,
            maxParcelsPerDay: pickupLocations.parcels_max_per_day,
            maxParcelsPerSlot: pickupLocations.max_parcels_per_slot,
        })
        .from(pickupLocations)
        .where(eq(pickupLocations.id, args.pickupLocationId))
        .limit(1);

    if (!location) {
        return [
            {
                field: "locationId",
                code: ValidationErrorCodes.LOCATION_NOT_FOUND,
                message: "Pickup location not found",
                details: { locationId: args.pickupLocationId },
            },
        ];
    }

    const errors = await validateOpeningHours(tx, args.pickupLocationId, changedFutureParcels);
    const existingHouseholdFutureIds = new Set(existingFutureParcels.map(parcel => parcel.id));
    const existingFutureById = new Map(existingFutureParcels.map(parcel => [parcel.id, parcel]));

    const targetLocationActiveParcels = await tx
        .select({
            id: foodParcels.id,
            householdId: foodParcels.household_id,
            locationId: foodParcels.pickup_location_id,
            earliest: foodParcels.pickup_date_time_earliest,
            latest: foodParcels.pickup_date_time_latest,
        })
        .from(foodParcels)
        .where(
            and(
                eq(foodParcels.pickup_location_id, args.pickupLocationId),
                gt(foodParcels.pickup_date_time_latest, now),
                notDeleted(),
            ),
        );

    const retainedRows: FinalStateParcel[] = targetLocationActiveParcels
        .filter(parcel => !existingHouseholdFutureIds.has(parcel.id))
        .map(parcel => ({
            id: parcel.id,
            householdId: parcel.householdId,
            locationId: parcel.locationId,
            earliest: parcel.earliest,
            latest: parcel.latest,
        }));

    const desiredRows: FinalStateParcel[] = desiredFutureParcels.map((parcel, index) => ({
        id: parcel.id ?? `new-${index}-${parcel.pickupEarliestTime.toISOString()}`,
        householdId: args.householdId,
        locationId: args.pickupLocationId,
        earliest: parcel.pickupEarliestTime,
        latest: parcel.pickupLatestTime,
    }));
    const changedRows: FinalStateParcel[] = changedFutureParcels.map((parcel, index) => ({
        id: parcel.id ?? `changed-new-${index}-${parcel.pickupEarliestTime.toISOString()}`,
        householdId: args.householdId,
        locationId: args.pickupLocationId,
        earliest: parcel.pickupEarliestTime,
        latest: parcel.pickupLatestTime,
    }));

    const finalRows = [...retainedRows, ...desiredRows];
    const changedDates = new Set(changedRows.map(parcel => stockholmDate(parcel.earliest)));
    const dailyCapacityDates = new Set(
        changedFutureParcels
            .filter(parcel => {
                const existing = parcel.id ? existingFutureById.get(parcel.id) : undefined;

                return (
                    !existing ||
                    existing.locationId !== args.pickupLocationId ||
                    stockholmDate(existing.earliest) !== stockholmDate(parcel.pickupEarliestTime)
                );
            })
            .map(parcel => stockholmDate(parcel.pickupEarliestTime)),
    );

    for (const date of changedDates) {
        const householdRowsOnDate = desiredRows.filter(
            parcel => stockholmDate(parcel.earliest) === date,
        );

        if (householdRowsOnDate.length > 1) {
            addUniqueError(errors, {
                field: "timeSlot",
                code: ValidationErrorCodes.HOUSEHOLD_DOUBLE_BOOKING,
                message: "Household already has a parcel scheduled for this date",
                details: {
                    householdId: args.householdId,
                    date,
                    locationId: args.pickupLocationId,
                },
            });
        }
    }

    for (const date of dailyCapacityDates) {
        if (location.maxParcelsPerDay !== null) {
            const locationRowsOnDate = finalRows.filter(
                parcel =>
                    parcel.locationId === args.pickupLocationId &&
                    stockholmDate(parcel.earliest) === date,
            );

            if (locationRowsOnDate.length > location.maxParcelsPerDay) {
                addUniqueError(errors, {
                    field: "capacity",
                    code: ValidationErrorCodes.MAX_DAILY_CAPACITY_REACHED,
                    message: `Maximum daily capacity (${location.maxParcelsPerDay}) reached for this date`,
                    details: {
                        current: locationRowsOnDate.length,
                        maximum: location.maxParcelsPerDay,
                        date,
                        locationId: args.pickupLocationId,
                    },
                });
            }
        }
    }

    if (location.maxParcelsPerSlot !== null) {
        const checkedSlots = new Set<string>();

        for (const desired of changedRows) {
            const slotKey = `${desired.locationId}-${desired.earliest.toISOString()}-${desired.latest.toISOString()}`;
            if (checkedSlots.has(slotKey)) continue;
            checkedSlots.add(slotKey);

            const overlappingRows = finalRows.filter(
                parcel => parcel.locationId === args.pickupLocationId && overlaps(parcel, desired),
            );

            if (overlappingRows.length > location.maxParcelsPerSlot) {
                addUniqueError(errors, {
                    field: "timeSlot",
                    code: ValidationErrorCodes.MAX_SLOT_CAPACITY_REACHED,
                    message: `Maximum capacity (${location.maxParcelsPerSlot}) reached for this time slot`,
                    details: {
                        current: overlappingRows.length,
                        maximum: location.maxParcelsPerSlot,
                        date: stockholmDate(desired.earliest),
                        locationId: args.pickupLocationId,
                        timeSlot: Time.fromDate(desired.earliest).toTimeString(),
                    },
                });
            }
        }
    }

    return errors;
}

export async function applyHouseholdParcelScheduleChanges(
    tx: ParcelTransaction,
    args: ApplyHouseholdParcelScheduleChangesArgs,
): Promise<HouseholdParcelScheduleChangeSummary> {
    const now = new Date();
    const affectedLocationIds = new Set<string>();
    const updatedParcelIds: string[] = [];
    const removedParcelIds: string[] = [];

    const newPastParcels = args.parcels.filter(
        parcel => !parcel.id && parcel.pickupLatestTime <= now,
    );
    if (newPastParcels.length > 0) {
        throw buildPastParcelValidationError(newPastParcels);
    }

    const desiredFutureParcels = args.parcels.filter(parcel => parcel.pickupLatestTime > now);

    const existingFutureParcels = await tx
        .select({
            id: foodParcels.id,
            locationId: foodParcels.pickup_location_id,
            earliest: foodParcels.pickup_date_time_earliest,
            latest: foodParcels.pickup_date_time_latest,
            isPickedUp: foodParcels.is_picked_up,
            noShowAt: foodParcels.no_show_at,
        })
        .from(foodParcels)
        .where(
            and(
                eq(foodParcels.household_id, args.householdId),
                gt(foodParcels.pickup_date_time_latest, now),
                notDeleted(),
            ),
        );

    const existingFutureById = new Map(existingFutureParcels.map(parcel => [parcel.id, parcel]));
    const mutableExistingFutureParcels = existingFutureParcels.filter(
        parcel => !isTerminal(parcel),
    );
    const mutableExistingFutureById = new Map(
        mutableExistingFutureParcels.map(parcel => [parcel.id, parcel]),
    );
    const mutableExistingFutureKeys = new Set(
        mutableExistingFutureParcels.map(parcel =>
            parcelKey(parcel.locationId, parcel.earliest, parcel.latest),
        ),
    );

    const desiredFutureById = new Map(
        desiredFutureParcels.flatMap(parcel => (parcel.id ? [[parcel.id, parcel]] : [])),
    );

    for (const existing of existingFutureParcels) {
        if (!isTerminal(existing)) continue;
        const desired = desiredFutureById.get(existing.id);

        if (!desired || hasDesiredParcelChanged(existing, desired, args.pickupLocationId)) {
            throw buildTerminalParcelValidationError(existing.id);
        }
    }

    const parcelsToChange = desiredFutureParcels.filter(parcel => {
        if (parcel.id) {
            const existing = existingFutureById.get(parcel.id);
            if (existing && isTerminal(existing)) {
                return false;
            }
        }

        if (parcel.id && mutableExistingFutureById.has(parcel.id)) {
            const existing = mutableExistingFutureById.get(parcel.id)!;
            return hasDesiredParcelChanged(existing, parcel, args.pickupLocationId);
        }

        return !mutableExistingFutureKeys.has(
            parcelKey(args.pickupLocationId, parcel.pickupEarliestTime, parcel.pickupLatestTime),
        );
    });

    const finalStateErrors = await validateFinalState(
        tx,
        args,
        existingFutureParcels,
        desiredFutureParcels,
        parcelsToChange,
        now,
    );
    if (finalStateErrors.length > 0) {
        throw new ParcelValidationError("Parcel validation failed", finalStateErrors);
    }

    const parcelsToUpdate = parcelsToChange.filter(
        parcel => parcel.id && mutableExistingFutureById.has(parcel.id),
    );
    const parcelsToCreate = parcelsToChange.filter(
        parcel => !parcel.id || !mutableExistingFutureById.has(parcel.id),
    );
    const desiredMutableIds = new Set(
        desiredFutureParcels
            .map(parcel => parcel.id)
            .filter(
                (id): id is string => typeof id === "string" && mutableExistingFutureById.has(id),
            ),
    );
    const desiredFutureKeysWithoutIds = new Set(
        desiredFutureParcels
            .filter(parcel => !parcel.id)
            .map(parcel =>
                parcelKey(
                    args.pickupLocationId,
                    parcel.pickupEarliestTime,
                    parcel.pickupLatestTime,
                ),
            ),
    );

    const parcelsToDelete = mutableExistingFutureParcels.filter(parcel => {
        if (desiredMutableIds.has(parcel.id)) return false;
        return !desiredFutureKeysWithoutIds.has(
            parcelKey(parcel.locationId, parcel.earliest, parcel.latest),
        );
    });

    if (parcelsToUpdate.length > 0) {
        const temporaryBase = Date.UTC(2100, 0, 1, 0, 0, 0, 0);

        for (const [index, parcel] of parcelsToUpdate.entries()) {
            const existing = mutableExistingFutureById.get(parcel.id!)!;
            const temporaryEarliest = new Date(temporaryBase + index * 2 * 60 * 1000);
            const temporaryLatest = new Date(temporaryEarliest.getTime() + 60 * 1000);

            await tx
                .update(foodParcels)
                .set({
                    pickup_location_id: existing.locationId,
                    pickup_date_time_earliest: temporaryEarliest,
                    pickup_date_time_latest: temporaryLatest,
                })
                .where(eq(foodParcels.id, parcel.id!));
        }
    }

    if (parcelsToDelete.length > 0) {
        const { softDeleteParcelLenient } = await import("@/app/utils/parcels/state-transitions");

        for (const parcel of parcelsToDelete) {
            affectedLocationIds.add(parcel.locationId);
            await softDeleteParcelLenient(tx, {
                parcelId: parcel.id,
                session: args.session,
            });
            removedParcelIds.push(parcel.id);
        }
    }

    for (const parcel of parcelsToUpdate) {
        const existing = mutableExistingFutureById.get(parcel.id!)!;
        affectedLocationIds.add(existing.locationId);
        affectedLocationIds.add(args.pickupLocationId);

        await tx
            .update(foodParcels)
            .set({
                pickup_location_id: args.pickupLocationId,
                pickup_date_time_earliest: parcel.pickupEarliestTime,
                pickup_date_time_latest: parcel.pickupLatestTime,
            })
            .where(eq(foodParcels.id, parcel.id!));

        updatedParcelIds.push(parcel.id!);
    }

    if (parcelsToCreate.length > 0) {
        const parcelsToSave = parcelsToCreate.map(parcel => ({
            household_id: args.householdId,
            pickup_location_id: args.pickupLocationId,
            pickup_date_time_earliest: parcel.pickupEarliestTime,
            pickup_date_time_latest: parcel.pickupLatestTime,
            is_picked_up: false,
        }));

        const { createParcels } = await import("@/app/utils/parcels/state-transitions");
        const createdParcelIds = await createParcels(tx, {
            parcels: parcelsToSave,
            session: args.session,
        });
        const skippedCount = parcelsToSave.length - createdParcelIds.length;
        if (skippedCount > 0) {
            throw new ParcelValidationError("Parcel validation failed", [
                {
                    field: "parcels",
                    code: ValidationErrorCodes.TIME_SLOT_CONFLICT,
                    message: "One or more parcels already exist for the selected time slot",
                    details: { skippedCount },
                },
            ]);
        }
        affectedLocationIds.add(args.pickupLocationId);
    }

    return {
        createdCount: parcelsToCreate.length,
        updatedParcelIds,
        removedParcelIds,
        affectedLocationIds: uniqueIds([...affectedLocationIds]),
    };
}

export async function runHouseholdParcelPostCommitEffects(
    summary: HouseholdParcelScheduleChangeSummary,
    context: {
        householdId: string;
        logError: (message: string, error: unknown, context?: Record<string, unknown>) => void;
    },
): Promise<void> {
    if (summary.affectedLocationIds.length > 0) {
        try {
            const { recomputeOutsideHoursCount } = await import("@/app/[locale]/schedule/actions");
            await Promise.all(
                summary.affectedLocationIds.map(locationId =>
                    recomputeOutsideHoursCount(locationId),
                ),
            );
        } catch (e) {
            context.logError("Failed to recompute outside-hours count after parcel update", e, {
                action: "runHouseholdParcelPostCommitEffects",
                householdId: context.householdId,
                locationIds: summary.affectedLocationIds,
            });
        }
    }

    if (summary.updatedParcelIds.length > 0) {
        try {
            const { queuePickupUpdatedSms } = await import("@/app/utils/sms/sms-service");
            await Promise.allSettled(summary.updatedParcelIds.map(id => queuePickupUpdatedSms(id)));
        } catch (e) {
            context.logError("Failed to queue pickup_updated SMS after parcel update", e, {
                parcelIds: summary.updatedParcelIds,
                householdId: context.householdId,
            });
        }
    }
}
