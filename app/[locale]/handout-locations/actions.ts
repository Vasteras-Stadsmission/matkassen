"use server";

import { db } from "@/app/db/drizzle";
import {
    pickupLocations,
    pickupLocationSchedules,
    pickupLocationScheduleDays,
    pickupLocationDailyLimits,
    scheduleAuditLog,
    foodParcels,
} from "@/app/db/schema";
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { protectedAdminAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import {
    LocationFormInput,
    PickupLocationWithAllData,
    ScheduleInput,
    PickupLocationScheduleWithDays,
    LocationLimitsInput,
    LimitMutationResult,
    DailyLimitConflict,
} from "./types";
import { logError } from "@/app/utils/logger";
import { recordAuditEvent } from "@/app/utils/audit/log";
import { auditDetailsForChanges, buildChanges } from "@/app/utils/audit/changes";
import { recomputeOutsideHoursCountForLocation } from "@/app/utils/schedule/outside-hours-count";
import { notDeleted } from "@/app/db/query-helpers";
import { getStockholmDayUtcRange } from "@/app/utils/date-utils";
import {
    dateKeyToStockholmDate,
    loadBookedCountsByDate,
    loadDailyLimitMonthData,
    loadLocationLimitContext,
    loadOpenDateKeys,
    lockPickupLocationsForCapacity,
    normalizeDateKeys,
    stockholmTodayKey,
    type DailyLimitMonthData,
} from "@/app/utils/capacity/daily-limits";

// Get all locations with their schedules
export const getLocations = protectedAdminAction(
    async (): Promise<ActionResult<PickupLocationWithAllData[]>> => {
        try {
            // Auth already verified by protectedAdminAction wrapper
            // Fetch all locations
            const locations = await db.select().from(pickupLocations);

            // For each location, fetch the related data
            const locationsWithSchedules = await Promise.all(
                locations.map(async location => {
                    // Fetch schedules
                    const schedules = await db
                        .select()
                        .from(pickupLocationSchedules)
                        .where(eq(pickupLocationSchedules.pickup_location_id, location.id));

                    // For each schedule, fetch the related days
                    const schedulesWithDays = await Promise.all(
                        schedules.map(async schedule => {
                            const days = await db
                                .select()
                                .from(pickupLocationScheduleDays)
                                .where(eq(pickupLocationScheduleDays.schedule_id, schedule.id));

                            return {
                                ...schedule,
                                days,
                            };
                        }),
                    );

                    // Return location with related data
                    return {
                        ...location,
                        schedules: schedulesWithDays,
                    };
                }),
            );

            return success(locationsWithSchedules);
        } catch (error) {
            logError("Error fetching locations", error, {
                action: "getLocations",
            });
            return failure({
                code: "DATABASE_ERROR",
                message: `Failed to fetch locations: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    },
);

// Create a new location
export const createLocation = protectedAdminAction(
    async (
        _: unknown,
        locationData: LocationFormInput,
    ): Promise<ActionResult<PickupLocationWithAllData>> => {
        // Auth already verified by protectedAdminAction wrapper

        if (
            !isPositiveIntegerOrNull(locationData.parcels_max_per_day) ||
            !isPositiveIntegerOrNull(locationData.max_parcels_per_slot)
        ) {
            return failure({ code: "INVALID_LIMIT", message: "Limits must be positive integers" });
        }

        try {
            // Process email to ensure it's either null or a valid format
            const contact_email = locationData.contact_email?.trim()
                ? locationData.contact_email.trim()
                : null;

            // Insert the location
            const locationValues = {
                name: locationData.name,
                street_address: locationData.street_address,
                postal_code: locationData.postal_code,
                parcels_max_per_day: locationData.parcels_max_per_day,
                max_parcels_per_slot: locationData.max_parcels_per_slot,
                contact_name: locationData.contact_name,
                contact_email: contact_email, // Use processed email value
                contact_phone_number: locationData.contact_phone_number,
                default_slot_duration_minutes: locationData.default_slot_duration_minutes,
            };
            const [createdLocation] = await db
                .insert(pickupLocations)
                .values(locationValues)
                .returning();

            // Get the current locale from headers
            const locale = (await headers()).get("x-locale") || "en";

            // Revalidate the settings page to update the UI
            revalidatePath(`/${locale}/settings/locations`, "page");

            // Return the created location with empty schedules array
            return success({
                ...createdLocation,
                schedules: [],
            });
        } catch (error) {
            logError("Error creating location", error, {
                action: "createLocation",
                locationName: locationData.name,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: `Failed to create location: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    },
);

// Update an existing location
export const updateLocation = protectedAdminAction(
    async (session, id: string, locationData: LocationFormInput): Promise<ActionResult<void>> => {
        // Auth already verified by protectedAdminAction wrapper

        try {
            // Process email to ensure it's either null or a valid format
            const contact_email = locationData.contact_email?.trim()
                ? locationData.contact_email.trim()
                : null;

            // Update the location
            const locationValues = {
                name: locationData.name,
                street_address: locationData.street_address,
                postal_code: locationData.postal_code,
                contact_name: locationData.contact_name,
                contact_email: contact_email, // Use processed email value
                contact_phone_number: locationData.contact_phone_number,
            };
            await db.transaction(async tx => {
                const [existingLocation] = await tx
                    .select({
                        name: pickupLocations.name,
                        street_address: pickupLocations.street_address,
                        postal_code: pickupLocations.postal_code,
                        contact_name: pickupLocations.contact_name,
                        contact_email: pickupLocations.contact_email,
                        contact_phone_number: pickupLocations.contact_phone_number,
                    })
                    .from(pickupLocations)
                    .where(eq(pickupLocations.id, id))
                    .limit(1);

                await tx
                    .update(pickupLocations)
                    .set(locationValues)
                    .where(eq(pickupLocations.id, id));

                if (existingLocation) {
                    const changes = buildChanges(existingLocation, locationValues);

                    if (Object.keys(changes).length > 0) {
                        await recordAuditEvent(tx, {
                            session,
                            entityType: "pickup_location",
                            entityId: id,
                            action: "updated",
                            summary: "Updated pickup location general information",
                            details: auditDetailsForChanges(changes),
                        });
                    }
                }
            });

            // Get the current locale from headers
            const locale = (await headers()).get("x-locale") || "en";

            // Revalidate the settings page to update the UI
            revalidatePath(`/${locale}/settings/locations`, "page");
            return success(undefined);
        } catch (error) {
            logError("Error updating location", error, {
                action: "updateLocation",
                locationId: id,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: `Failed to update location: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    },
);

function isPositiveIntegerOrNull(value: number | null): boolean {
    return value === null || (Number.isInteger(value) && value > 0);
}

async function revalidateLocationSettings(): Promise<void> {
    const locale = (await headers()).get("x-locale") || "en";
    revalidatePath(`/${locale}/settings/locations`, "page");
}

async function getDefaultLimitConflicts(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    locationId: string,
    resultingDefault: number | null,
): Promise<DailyLimitConflict[]> {
    if (resultingDefault === null) return [];

    const today = stockholmTodayKey();
    const { startUtc } = getStockholmDayUtcRange(dateKeyToStockholmDate(today));
    const rows = await tx
        .select({
            date: sql<string>`date(${foodParcels.pickup_date_time_earliest} AT TIME ZONE 'Europe/Stockholm')`,
            booked: count(),
        })
        .from(foodParcels)
        .where(
            and(
                eq(foodParcels.pickup_location_id, locationId),
                gte(foodParcels.pickup_date_time_earliest, startUtc),
                notDeleted(),
            ),
        )
        .groupBy(
            sql`date(${foodParcels.pickup_date_time_earliest} AT TIME ZONE 'Europe/Stockholm')`,
        );

    if (rows.length === 0) return [];
    const context = await loadLocationLimitContext(
        tx,
        locationId,
        rows.map(row => row.date),
    );

    return rows
        .filter(row => context.overrides[row.date] === undefined && row.booked > resultingDefault)
        .map(row => ({ date: row.date, booked: row.booked, resultingLimit: resultingDefault }));
}

export const getDailyLimitMonthData = protectedAdminAction(
    async (
        _session,
        locationId: string,
        dateKeys: string[],
    ): Promise<ActionResult<DailyLimitMonthData>> => {
        try {
            const normalizedDateKeys = normalizeDateKeys(dateKeys);
            return success(await loadDailyLimitMonthData(db, locationId, normalizedDateKeys));
        } catch (error) {
            logError("Error loading daily parcel limits", error, {
                action: "getDailyLimitMonthData",
                locationId,
            });
            return failure({
                code: error instanceof Error ? error.message : "DATABASE_ERROR",
                message: "Failed to load daily parcel limits",
            });
        }
    },
);

export const updateLocationLimits = protectedAdminAction(
    async (
        session,
        locationId: string,
        values: LocationLimitsInput,
        acknowledgedConflictDates: string[] = [],
    ): Promise<ActionResult<LimitMutationResult>> => {
        if (
            !isPositiveIntegerOrNull(values.parcels_max_per_day) ||
            !isPositiveIntegerOrNull(values.max_parcels_per_slot)
        ) {
            return failure({ code: "INVALID_LIMIT", message: "Limits must be positive integers" });
        }

        try {
            const result = await db.transaction(async tx => {
                await lockPickupLocationsForCapacity(tx, [locationId]);
                const current = await loadLocationLimitContext(tx, locationId, []);
                const changed =
                    current.defaultDailyLimit !== values.parcels_max_per_day ||
                    current.explicitSlotLimit !== values.max_parcels_per_slot;

                if (!changed) {
                    return {
                        status: "updated" as const,
                        changedDates: [],
                        conflicts: [],
                    };
                }

                const lowersDailyDefault =
                    values.parcels_max_per_day !== null &&
                    (current.defaultDailyLimit === null ||
                        values.parcels_max_per_day < current.defaultDailyLimit);
                const conflicts = lowersDailyDefault
                    ? await getDefaultLimitConflicts(tx, locationId, values.parcels_max_per_day)
                    : [];
                const acknowledged = new Set(acknowledgedConflictDates);
                if (
                    conflicts.length > 0 &&
                    conflicts.some(conflict => !acknowledged.has(conflict.date))
                ) {
                    return {
                        status: "confirmation_required" as const,
                        changedDates: [],
                        conflicts,
                    };
                }

                await tx
                    .update(pickupLocations)
                    .set({
                        parcels_max_per_day: values.parcels_max_per_day,
                        max_parcels_per_slot: values.max_parcels_per_slot,
                    })
                    .where(eq(pickupLocations.id, locationId));

                await recordAuditEvent(tx, {
                    session,
                    entityType: "pickup_location",
                    entityId: locationId,
                    action: "updated",
                    summary: "Updated pickup location parcel limits",
                    details: auditDetailsForChanges(
                        buildChanges(
                            {
                                parcels_max_per_day: current.defaultDailyLimit,
                                max_parcels_per_slot: current.explicitSlotLimit,
                            },
                            {
                                parcels_max_per_day: values.parcels_max_per_day,
                                max_parcels_per_slot: values.max_parcels_per_slot,
                            },
                        ),
                    ),
                });

                return {
                    status: "updated" as const,
                    changedDates: [],
                    conflicts,
                };
            });

            if (result.status === "updated") await revalidateLocationSettings();
            return success(result);
        } catch (error) {
            logError("Error updating location parcel limits", error, {
                action: "updateLocationLimits",
                locationId,
            });
            return failure({
                code: error instanceof Error ? error.message : "DATABASE_ERROR",
                message: "Failed to update location parcel limits",
            });
        }
    },
);

export const applyDailyParcelLimits = protectedAdminAction(
    async (
        session,
        locationId: string,
        dateKeys: string[],
        maxParcels: number,
        acknowledgedConflictDates: string[] = [],
    ): Promise<ActionResult<LimitMutationResult>> => {
        if (!Number.isInteger(maxParcels) || maxParcels <= 0) {
            return failure({ code: "INVALID_LIMIT", message: "Limit must be a positive integer" });
        }

        try {
            const normalizedDateKeys = normalizeDateKeys(dateKeys);
            if (normalizedDateKeys.some(dateKey => dateKey < stockholmTodayKey())) {
                return failure({ code: "PAST_DATE", message: "Past dates cannot be changed" });
            }

            const result = await db.transaction(async tx => {
                await lockPickupLocationsForCapacity(tx, [locationId]);
                const [context, openDates, bookedCounts] = await Promise.all([
                    loadLocationLimitContext(tx, locationId, normalizedDateKeys),
                    loadOpenDateKeys(tx, locationId, normalizedDateKeys),
                    loadBookedCountsByDate(tx, locationId, normalizedDateKeys),
                ]);

                const invalidClosedDates = normalizedDateKeys.filter(
                    dateKey => !openDates.has(dateKey) && context.overrides[dateKey] === undefined,
                );
                if (invalidClosedDates.length > 0) {
                    throw new Error("CLOSED_DATE");
                }

                const changedDates = normalizedDateKeys.filter(
                    dateKey => context.overrides[dateKey] !== maxParcels,
                );
                const conflicts = changedDates
                    .filter(dateKey => (bookedCounts[dateKey] ?? 0) > maxParcels)
                    .map(dateKey => ({
                        date: dateKey,
                        booked: bookedCounts[dateKey] ?? 0,
                        resultingLimit: maxParcels,
                    }));

                const acknowledged = new Set(acknowledgedConflictDates);
                if (
                    conflicts.length > 0 &&
                    conflicts.some(conflict => !acknowledged.has(conflict.date))
                ) {
                    return { status: "confirmation_required" as const, changedDates, conflicts };
                }
                if (changedDates.length === 0) {
                    return { status: "updated" as const, changedDates, conflicts: [] };
                }

                await tx
                    .insert(pickupLocationDailyLimits)
                    .values(
                        changedDates.map(dateKey => ({
                            pickup_location_id: locationId,
                            date: dateKey,
                            max_parcels: maxParcels,
                        })),
                    )
                    .onConflictDoUpdate({
                        target: [
                            pickupLocationDailyLimits.pickup_location_id,
                            pickupLocationDailyLimits.date,
                        ],
                        set: { max_parcels: maxParcels },
                    });

                await recordAuditEvent(tx, {
                    session,
                    entityType: "pickup_location",
                    entityId: locationId,
                    action: "daily_limits_updated",
                    summary: `Updated parcel limits for ${changedDates.length} date(s)`,
                    details: {
                        dates: changedDates,
                        max_parcels: maxParcels,
                    },
                });

                return { status: "updated" as const, changedDates, conflicts };
            });

            if (result.status === "updated") await revalidateLocationSettings();
            return success(result);
        } catch (error) {
            logError("Error applying daily parcel limits", error, {
                action: "applyDailyParcelLimits",
                locationId,
            });
            return failure({
                code: error instanceof Error ? error.message : "DATABASE_ERROR",
                message: "Failed to apply daily parcel limits",
            });
        }
    },
);

export const resetDailyParcelLimits = protectedAdminAction(
    async (
        session,
        locationId: string,
        dateKeys: string[],
        acknowledgedConflictDates: string[] = [],
    ): Promise<ActionResult<LimitMutationResult>> => {
        try {
            const normalizedDateKeys = normalizeDateKeys(dateKeys);
            if (normalizedDateKeys.some(dateKey => dateKey < stockholmTodayKey())) {
                return failure({ code: "PAST_DATE", message: "Past dates cannot be changed" });
            }

            const result = await db.transaction(async tx => {
                await lockPickupLocationsForCapacity(tx, [locationId]);
                const [context, bookedCounts] = await Promise.all([
                    loadLocationLimitContext(tx, locationId, normalizedDateKeys),
                    loadBookedCountsByDate(tx, locationId, normalizedDateKeys),
                ]);
                const changedDates = normalizedDateKeys.filter(
                    dateKey => context.overrides[dateKey] !== undefined,
                );
                const conflicts =
                    context.defaultDailyLimit === null
                        ? []
                        : changedDates
                              .filter(
                                  dateKey =>
                                      (bookedCounts[dateKey] ?? 0) > context.defaultDailyLimit!,
                              )
                              .map(dateKey => ({
                                  date: dateKey,
                                  booked: bookedCounts[dateKey] ?? 0,
                                  resultingLimit: context.defaultDailyLimit!,
                              }));

                const acknowledged = new Set(acknowledgedConflictDates);
                if (
                    conflicts.length > 0 &&
                    conflicts.some(conflict => !acknowledged.has(conflict.date))
                ) {
                    return { status: "confirmation_required" as const, changedDates, conflicts };
                }
                if (changedDates.length === 0) {
                    return { status: "updated" as const, changedDates, conflicts: [] };
                }

                await tx
                    .delete(pickupLocationDailyLimits)
                    .where(
                        and(
                            eq(pickupLocationDailyLimits.pickup_location_id, locationId),
                            inArray(pickupLocationDailyLimits.date, changedDates),
                        ),
                    );

                await recordAuditEvent(tx, {
                    session,
                    entityType: "pickup_location",
                    entityId: locationId,
                    action: "daily_limits_reset",
                    summary: `Reset parcel limits for ${changedDates.length} date(s)`,
                    details: { dates: changedDates },
                });

                return { status: "updated" as const, changedDates, conflicts };
            });

            if (result.status === "updated") await revalidateLocationSettings();
            return success(result);
        } catch (error) {
            logError("Error resetting daily parcel limits", error, {
                action: "resetDailyParcelLimits",
                locationId,
            });
            return failure({
                code: error instanceof Error ? error.message : "DATABASE_ERROR",
                message: "Failed to reset daily parcel limits",
            });
        }
    },
);

export const updateLocationSlotDuration = protectedAdminAction(
    async (
        session,
        locationId: string,
        slotDurationMinutes: number,
    ): Promise<ActionResult<number>> => {
        if (
            !Number.isInteger(slotDurationMinutes) ||
            slotDurationMinutes <= 0 ||
            slotDurationMinutes > 240 ||
            slotDurationMinutes % 15 !== 0
        ) {
            return failure({
                code: "INVALID_SLOT_DURATION",
                message: "Slot duration must be a 15-minute increment between 15 and 240",
            });
        }

        try {
            await db.transaction(async tx => {
                await lockPickupLocationsForCapacity(tx, [locationId]);
                const [current] = await tx
                    .select({ value: pickupLocations.default_slot_duration_minutes })
                    .from(pickupLocations)
                    .where(eq(pickupLocations.id, locationId))
                    .limit(1);
                if (!current) throw new Error("PICKUP_LOCATION_NOT_FOUND");
                if (current.value === slotDurationMinutes) return;

                await tx
                    .update(pickupLocations)
                    .set({ default_slot_duration_minutes: slotDurationMinutes })
                    .where(eq(pickupLocations.id, locationId));
                await recordAuditEvent(tx, {
                    session,
                    entityType: "pickup_location",
                    entityId: locationId,
                    action: "updated",
                    summary: "Updated pickup location slot duration",
                    details: auditDetailsForChanges(
                        buildChanges(
                            { default_slot_duration_minutes: current.value },
                            { default_slot_duration_minutes: slotDurationMinutes },
                        ),
                    ),
                });
            });
            await revalidateLocationSettings();
            return success(slotDurationMinutes);
        } catch (error) {
            logError("Error updating location slot duration", error, {
                action: "updateLocationSlotDuration",
                locationId,
            });
            return failure({
                code: error instanceof Error ? error.message : "DATABASE_ERROR",
                message: "Failed to update slot duration",
            });
        }
    },
);

// Delete a location
export const deleteLocation = protectedAdminAction(
    async (_: unknown, id: string): Promise<ActionResult<void>> => {
        // Auth already verified by protectedAdminAction wrapper

        try {
            const [referencedParcel] = await db
                .select({ id: foodParcels.id })
                .from(foodParcels)
                .where(eq(foodParcels.pickup_location_id, id))
                .limit(1);

            if (referencedParcel) {
                return failure({
                    code: "LOCATION_HAS_PARCELS",
                    message: "Locations with parcel history cannot be deleted",
                });
            }

            // Delete the location. Schedules and schedule days cascade, while
            // plain-text audit rows survive. Parcel history blocks deletion above.
            await db.delete(pickupLocations).where(eq(pickupLocations.id, id));

            // Get the current locale from headers
            const locale = (await headers()).get("x-locale") || "en";

            // Revalidate the settings page to update the UI
            revalidatePath(`/${locale}/settings/locations`, "page");
            return success(undefined);
        } catch (error) {
            logError("Error deleting location", error, {
                action: "deleteLocation",
                locationId: id,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: `Failed to delete location: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    },
);

// Create a new schedule for a location
export const createSchedule = protectedAdminAction(
    async (
        session,
        locationId: string,
        scheduleData: ScheduleInput,
    ): Promise<ActionResult<PickupLocationScheduleWithDays>> => {
        // Auth already verified by protectedAdminAction wrapper
        const username = session.user?.githubUsername ?? "unknown";

        try {
            let createdSchedule: PickupLocationScheduleWithDays;

            // Begin a transaction
            await db.transaction(async tx => {
                await lockPickupLocationsForCapacity(tx, [locationId]);
                const { validateScheduleOverlap } =
                    await import("@/app/utils/schedule/overlap-validation");
                await validateScheduleOverlap(scheduleData, locationId, undefined, tx);

                // Insert the schedule
                const [schedule] = await tx
                    .insert(pickupLocationSchedules)
                    .values({
                        pickup_location_id: locationId,
                        name: scheduleData.name,
                        // Persist dates as ISO YYYY-MM-DD derived from UTC to avoid TZ shifts
                        start_date:
                            scheduleData.start_date instanceof Date
                                ? scheduleData.start_date.toISOString().split("T")[0]
                                : scheduleData.start_date,
                        end_date:
                            scheduleData.end_date instanceof Date
                                ? scheduleData.end_date.toISOString().split("T")[0]
                                : scheduleData.end_date,
                        created_by: username,
                    })
                    .returning();

                // Insert the weekday schedules
                const scheduleDays = await Promise.all(
                    scheduleData.days.map(async day => {
                        const [createdDay] = await tx
                            .insert(pickupLocationScheduleDays)
                            .values({
                                schedule_id: schedule.id,
                                weekday: day.weekday,
                                is_open: day.is_open,
                                opening_time: day.opening_time || null,
                                closing_time: day.closing_time || null,
                                // NOTE: Drizzle ORM type inference issue - the actual schema includes
                                // all these fields, but auto-generated types don't reflect this correctly.
                                // This is a known limitation with complex enum + nullable field combinations.
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            } as any)
                            .returning();

                        return createdDay;
                    }),
                );

                // Insert audit log entry
                const openDays = scheduleData.days
                    .filter(d => d.is_open)
                    .map(d => `${d.weekday}: ${d.opening_time}-${d.closing_time}`)
                    .join(", ");
                await tx.insert(scheduleAuditLog).values({
                    schedule_id: schedule.id,
                    pickup_location_id: locationId,
                    action: "created",
                    changed_by: username,
                    changes_summary: `Created schedule "${scheduleData.name}" (${openDays})`,
                });

                await recordAuditEvent(tx, {
                    session,
                    entityType: "schedule",
                    entityId: schedule.id,
                    action: "updated",
                    summary: "Updated pickup location opening hours",
                    details: {
                        pickup_location_id: locationId,
                        schedule_action: "created",
                    },
                });

                // Create the return object
                createdSchedule = {
                    ...schedule,
                    days: scheduleDays,
                };
            });

            // Get the current locale from headers
            const locale = (await headers()).get("x-locale") || "en";

            // Revalidate the settings page to update the UI
            revalidatePath(`/${locale}/settings/locations`, "page");

            // Recompute outside-hours count after schedule change
            try {
                await recomputeOutsideHoursCountForLocation(locationId);
            } catch (e) {
                logError("Failed to recompute outside-hours count after schedule create", e, {
                    action: "createSchedule",
                    locationId,
                });
            }

            return success(createdSchedule!);
        } catch (error) {
            logError("Error creating schedule for location", error, {
                action: "createSchedule",
                locationId,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: `Failed to create schedule: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    },
);

// Update an existing schedule
export const updateSchedule = protectedAdminAction(
    async (
        session,
        scheduleId: string,
        scheduleData: ScheduleInput,
    ): Promise<ActionResult<PickupLocationScheduleWithDays>> => {
        // Auth already verified by protectedAdminAction wrapper
        const username = session.user?.githubUsername ?? "unknown";

        try {
            // Get the current schedule to find the location and old days for diff
            const currentScheduleRows = await db
                .select()
                .from(pickupLocationSchedules)
                .where(eq(pickupLocationSchedules.id, scheduleId))
                .limit(1);

            if (currentScheduleRows.length === 0) {
                return failure({
                    code: "NOT_FOUND",
                    message: `Schedule with ID ${scheduleId} not found`,
                });
            }

            const locationId = currentScheduleRows[0].pickup_location_id;

            let updatedSchedule: PickupLocationScheduleWithDays;

            // Begin a transaction
            await db.transaction(async tx => {
                await lockPickupLocationsForCapacity(tx, [locationId]);
                const [lockedSchedule] = await tx
                    .select()
                    .from(pickupLocationSchedules)
                    .where(eq(pickupLocationSchedules.id, scheduleId))
                    .limit(1)
                    .for("update");
                if (!lockedSchedule || lockedSchedule.pickup_location_id !== locationId) {
                    throw new Error("SCHEDULE_CHANGED");
                }
                const oldDays = await tx
                    .select()
                    .from(pickupLocationScheduleDays)
                    .where(eq(pickupLocationScheduleDays.schedule_id, scheduleId));
                const { validateScheduleOverlap } =
                    await import("@/app/utils/schedule/overlap-validation");
                await validateScheduleOverlap(scheduleData, locationId, scheduleId, tx);

                // Update the schedule
                const [schedule] = await tx
                    .update(pickupLocationSchedules)
                    .set({
                        name: scheduleData.name,
                        // Persist dates as ISO YYYY-MM-DD derived from UTC to avoid TZ shifts
                        start_date:
                            scheduleData.start_date instanceof Date
                                ? scheduleData.start_date.toISOString().split("T")[0]
                                : scheduleData.start_date,
                        end_date:
                            scheduleData.end_date instanceof Date
                                ? scheduleData.end_date.toISOString().split("T")[0]
                                : scheduleData.end_date,
                        updated_by: username,
                        updated_at: new Date(),
                    })
                    .where(eq(pickupLocationSchedules.id, scheduleId))
                    .returning();

                // Delete existing weekday schedules
                await tx
                    .delete(pickupLocationScheduleDays)
                    .where(eq(pickupLocationScheduleDays.schedule_id, scheduleId));

                // Insert the updated weekday schedules
                const scheduleDays = await Promise.all(
                    scheduleData.days.map(async day => {
                        const [createdDay] = await tx
                            .insert(pickupLocationScheduleDays)
                            .values({
                                schedule_id: scheduleId,
                                weekday: day.weekday,
                                is_open: day.is_open,
                                opening_time: day.opening_time || null,
                                closing_time: day.closing_time || null,
                                // NOTE: Drizzle ORM type inference issue - the actual schema includes
                                // all these fields, but auto-generated types don't reflect this correctly.
                                // This is a known limitation with complex enum + nullable field combinations.
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            } as any)
                            .returning();

                        return createdDay;
                    }),
                );

                // Build change summary for audit log
                const changes: string[] = [];
                for (const newDay of scheduleData.days) {
                    const oldDay = oldDays.find(d => d.weekday === newDay.weekday);
                    const oldOpen = oldDay?.is_open ?? false;
                    const newOpen = newDay.is_open;
                    const oldTime = oldDay
                        ? `${oldDay.opening_time?.substring(0, 5)}-${oldDay.closing_time?.substring(0, 5)}`
                        : null;
                    const newTime = `${newDay.opening_time}-${newDay.closing_time}`;

                    if (oldOpen !== newOpen) {
                        changes.push(
                            `${newDay.weekday}: ${oldOpen ? "open" : "closed"} → ${newOpen ? "open" : "closed"}`,
                        );
                    } else if (newOpen && oldTime !== newTime) {
                        changes.push(`${newDay.weekday}: ${oldTime} → ${newTime}`);
                    }
                }
                const summary =
                    changes.length > 0
                        ? changes.join(", ")
                        : "No day changes (name or date range updated)";

                await tx.insert(scheduleAuditLog).values({
                    schedule_id: scheduleId,
                    pickup_location_id: locationId,
                    action: "updated",
                    changed_by: username,
                    changes_summary: summary,
                });

                await recordAuditEvent(tx, {
                    session,
                    entityType: "schedule",
                    entityId: scheduleId,
                    action: "updated",
                    summary: "Updated pickup location opening hours",
                    details: {
                        pickup_location_id: locationId,
                        changes_summary: summary,
                    },
                });

                // Create the return object
                updatedSchedule = {
                    ...schedule,
                    days: scheduleDays,
                };
            });

            // Get the current locale from headers
            const locale = (await headers()).get("x-locale") || "en";

            // Revalidate the settings page to update the UI
            revalidatePath(`/${locale}/settings/locations`, "page");

            // Recompute outside-hours count with fresh data
            try {
                await recomputeOutsideHoursCountForLocation(locationId);
            } catch (e) {
                logError("Failed to recompute outside-hours count after schedule update", e, {
                    action: "updateSchedule",
                    scheduleId,
                    locationId,
                });
            }

            return success(updatedSchedule!);
        } catch (error) {
            logError("Error updating schedule", error, {
                action: "updateSchedule",
                scheduleId,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: `Failed to update schedule: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    },
);

// Delete a schedule
export const deleteSchedule = protectedAdminAction(
    async (session, scheduleId: string): Promise<ActionResult<void>> => {
        // Auth already verified by protectedAdminAction wrapper
        const username = session.user?.githubUsername ?? "unknown";

        try {
            // Determine location and schedule name before deletion
            const [scheduleRow] = await db
                .select({
                    pickup_location_id: pickupLocationSchedules.pickup_location_id,
                    name: pickupLocationSchedules.name,
                })
                .from(pickupLocationSchedules)
                .where(eq(pickupLocationSchedules.id, scheduleId))
                .limit(1);

            // Audit log + delete in a single transaction for atomicity
            await db.transaction(async tx => {
                if (scheduleRow) {
                    await lockPickupLocationsForCapacity(tx, [scheduleRow.pickup_location_id]);
                    const [lockedSchedule] = await tx
                        .select({
                            pickup_location_id: pickupLocationSchedules.pickup_location_id,
                            name: pickupLocationSchedules.name,
                        })
                        .from(pickupLocationSchedules)
                        .where(eq(pickupLocationSchedules.id, scheduleId))
                        .limit(1)
                        .for("update");
                    if (
                        !lockedSchedule ||
                        lockedSchedule.pickup_location_id !== scheduleRow.pickup_location_id
                    ) {
                        throw new Error("SCHEDULE_CHANGED");
                    }
                    await tx.insert(scheduleAuditLog).values({
                        schedule_id: scheduleId,
                        pickup_location_id: lockedSchedule.pickup_location_id,
                        action: "deleted",
                        changed_by: username,
                        changes_summary: `Deleted schedule "${lockedSchedule.name}"`,
                    });

                    await recordAuditEvent(tx, {
                        session,
                        entityType: "schedule",
                        entityId: scheduleId,
                        action: "updated",
                        summary: "Updated pickup location opening hours",
                        details: {
                            pickup_location_id: lockedSchedule.pickup_location_id,
                            schedule_action: "deleted",
                        },
                    });
                }

                // Delete the schedule (cascade will delete related days)
                await tx
                    .delete(pickupLocationSchedules)
                    .where(eq(pickupLocationSchedules.id, scheduleId));
            });

            // Get the current locale from headers
            const locale = (await headers()).get("x-locale") || "en";

            // Revalidate the settings page to update the UI
            revalidatePath(`/${locale}/settings/locations`, "page");

            // Recompute outside-hours count with fresh data
            try {
                if (scheduleRow?.pickup_location_id) {
                    await recomputeOutsideHoursCountForLocation(scheduleRow.pickup_location_id);
                }
            } catch (e) {
                logError("Failed to recompute outside-hours count after schedule delete", e, {
                    action: "deleteSchedule",
                    scheduleId,
                    locationId: scheduleRow?.pickup_location_id,
                });
            }
            return success(undefined);
        } catch (error) {
            logError("Error deleting schedule", error, {
                action: "deleteSchedule",
                scheduleId,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: `Failed to delete schedule: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    },
);
