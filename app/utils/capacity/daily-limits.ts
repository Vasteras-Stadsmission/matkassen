import { and, asc, between, count, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { fromZonedTime } from "date-fns-tz";
import { db } from "@/app/db/drizzle";
import {
    foodParcels,
    households,
    pickupLocationDailyLimits,
    pickupLocations,
    pickupLocationScheduleDays,
    pickupLocationSchedules,
} from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import type { DbOrTransaction } from "@/app/db/types";
import { getStockholmDayUtcRange, getStockholmDateKey } from "@/app/utils/date-utils";
import { Time, WEEKDAY_MAPPING } from "@/app/utils/time-provider";

const STOCKHOLM_TIMEZONE = "Europe/Stockholm";
export const MAX_DAILY_LIMIT_DATES_PER_MUTATION = 366;

export interface LocationLimitContext {
    defaultDailyLimit: number | null;
    effectiveDailyLimits: Record<string, number | null>;
    overrides: Record<string, number>;
}

export interface DailyLimitMonthData extends LocationLimitContext {
    bookedCounts: Record<string, number>;
    openDates: string[];
}

export interface OverCapacityDate {
    locationId: string;
    locationName: string;
    date: string;
    booked: number;
    limit: number;
    excess: number;
    hasOverride: boolean;
}

export type CapacityTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function isValidDateKey(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));

    return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
    );
}

export function normalizeDateKeys(values: string[]): string[] {
    const unique = normalizeDateKeysForRead(values);
    if (unique.length === 0 || unique.length > MAX_DAILY_LIMIT_DATES_PER_MUTATION) {
        throw new Error("INVALID_DATE_SELECTION_SIZE");
    }
    return unique;
}

function normalizeDateKeysForRead(values: string[]): string[] {
    const unique = [...new Set(values)];
    if (unique.some(value => !isValidDateKey(value))) throw new Error("INVALID_DATE");
    return unique.sort();
}

function utcDateKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function enumerateDateKeys(startDateKey: string, endDateKey: string): string[] {
    if (!isValidDateKey(startDateKey) || !isValidDateKey(endDateKey)) {
        throw new Error("INVALID_DATE");
    }
    const cursor = new Date(`${startDateKey}T12:00:00Z`);
    const end = new Date(`${endDateKey}T12:00:00Z`);
    if (cursor > end) throw new Error("INVALID_DATE_RANGE");

    const values: string[] = [];
    while (cursor <= end) {
        values.push(utcDateKey(cursor));
        if (values.length > MAX_DAILY_LIMIT_DATES_PER_MUTATION) {
            throw new Error("INVALID_DATE_SELECTION_SIZE");
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return values;
}

export function stockholmTodayKey(): string {
    return Time.now().toDateString();
}

export function stockholmDateKey(date: Date): string {
    return getStockholmDateKey(date);
}

export function dateKeyToStockholmDate(dateKey: string): Date {
    if (!isValidDateKey(dateKey)) throw new Error("INVALID_DATE");
    return fromZonedTime(`${dateKey}T12:00:00`, STOCKHOLM_TIMEZONE);
}

export function resolveEffectiveDailyLimit(
    defaultDailyLimit: number | null,
    override: number | null | undefined,
): number | null {
    return override ?? defaultDailyLimit;
}

export async function lockPickupLocationsForCapacity(
    tx: CapacityTransaction,
    locationIds: string[],
): Promise<void> {
    const sortedIds = [...new Set(locationIds)].sort();
    if (sortedIds.length === 0) return;

    const locked = await tx
        .select({ id: pickupLocations.id })
        .from(pickupLocations)
        .where(inArray(pickupLocations.id, sortedIds))
        .orderBy(asc(pickupLocations.id))
        .for("update");

    if (locked.length !== sortedIds.length) {
        throw new Error("PICKUP_LOCATION_NOT_FOUND");
    }
}

export async function loadLocationLimitContext(
    dbInstance: DbOrTransaction,
    locationId: string,
    dateKeys: string[],
): Promise<LocationLimitContext> {
    const normalizedDateKeys = normalizeDateKeysForRead(dateKeys);
    const [location] = await dbInstance
        .select({
            defaultDailyLimit: pickupLocations.parcels_max_per_day,
        })
        .from(pickupLocations)
        .where(eq(pickupLocations.id, locationId))
        .limit(1);

    if (!location) throw new Error("PICKUP_LOCATION_NOT_FOUND");

    const rows =
        normalizedDateKeys.length > 0
            ? await dbInstance
                  .select({
                      date: pickupLocationDailyLimits.date,
                      maxParcels: pickupLocationDailyLimits.max_parcels,
                  })
                  .from(pickupLocationDailyLimits)
                  .where(
                      and(
                          eq(pickupLocationDailyLimits.pickup_location_id, locationId),
                          inArray(pickupLocationDailyLimits.date, normalizedDateKeys),
                      ),
                  )
            : [];

    const overrides = Object.fromEntries(rows.map(row => [row.date, row.maxParcels]));
    const effectiveDailyLimits = Object.fromEntries(
        normalizedDateKeys.map(dateKey => [
            dateKey,
            resolveEffectiveDailyLimit(location.defaultDailyLimit, overrides[dateKey]),
        ]),
    );

    return {
        defaultDailyLimit: location.defaultDailyLimit,
        effectiveDailyLimits,
        overrides,
    };
}

export async function loadOpenDateKeys(
    dbInstance: DbOrTransaction,
    locationId: string,
    dateKeys: string[],
): Promise<Set<string>> {
    const normalizedDateKeys = normalizeDateKeys(dateKeys);
    const firstDate = normalizedDateKeys[0];
    const lastDate = normalizedDateKeys.at(-1)!;

    const scheduleRows = await dbInstance
        .select({
            startDate: pickupLocationSchedules.start_date,
            endDate: pickupLocationSchedules.end_date,
            weekday: pickupLocationScheduleDays.weekday,
            isOpen: pickupLocationScheduleDays.is_open,
        })
        .from(pickupLocationSchedules)
        .innerJoin(
            pickupLocationScheduleDays,
            eq(pickupLocationScheduleDays.schedule_id, pickupLocationSchedules.id),
        )
        .where(
            and(
                eq(pickupLocationSchedules.pickup_location_id, locationId),
                lte(pickupLocationSchedules.start_date, lastDate),
                gte(pickupLocationSchedules.end_date, firstDate),
            ),
        );

    const openDates = new Set<string>();
    for (const dateKey of normalizedDateKeys) {
        const weekday = WEEKDAY_MAPPING[new Date(`${dateKey}T12:00:00Z`).getUTCDay()];
        if (
            scheduleRows.some(
                row =>
                    row.startDate <= dateKey &&
                    row.endDate >= dateKey &&
                    row.weekday === weekday &&
                    row.isOpen,
            )
        ) {
            openDates.add(dateKey);
        }
    }

    return openDates;
}

export async function loadBookedCountsByDate(
    dbInstance: DbOrTransaction,
    locationId: string,
    dateKeys: string[],
): Promise<Record<string, number>> {
    const normalizedDateKeys = normalizeDateKeys(dateKeys);
    const firstRange = getStockholmDayUtcRange(dateKeyToStockholmDate(normalizedDateKeys[0]));
    const lastRange = getStockholmDayUtcRange(dateKeyToStockholmDate(normalizedDateKeys.at(-1)!));

    const rows = await dbInstance
        .select({
            date: sql<string>`date(${foodParcels.pickup_date_time_earliest} AT TIME ZONE 'Europe/Stockholm')`,
            count: count(),
        })
        .from(foodParcels)
        .where(
            and(
                eq(foodParcels.pickup_location_id, locationId),
                between(
                    foodParcels.pickup_date_time_earliest,
                    firstRange.startUtc,
                    lastRange.endUtc,
                ),
                notDeleted(),
            ),
        )
        .groupBy(
            sql`date(${foodParcels.pickup_date_time_earliest} AT TIME ZONE 'Europe/Stockholm')`,
        );

    const selected = new Set(normalizedDateKeys);
    return Object.fromEntries(
        rows.filter(row => selected.has(row.date)).map(row => [row.date, row.count]),
    );
}

export async function loadDailyLimitMonthData(
    dbInstance: DbOrTransaction,
    locationId: string,
    dateKeys: string[],
): Promise<DailyLimitMonthData> {
    const normalizedDateKeys = normalizeDateKeys(dateKeys);
    const [limitContext, openDates, bookedCounts] = await Promise.all([
        loadLocationLimitContext(dbInstance, locationId, normalizedDateKeys),
        loadOpenDateKeys(dbInstance, locationId, normalizedDateKeys),
        loadBookedCountsByDate(dbInstance, locationId, normalizedDateKeys),
    ]);

    return {
        ...limitContext,
        openDates: [...openDates],
        bookedCounts,
    };
}

/**
 * Returns one row per location and Stockholm-local date where active bookings
 * exceed that date's effective daily limit. Dates at the limit are full, not
 * over capacity, and unlimited dates are omitted.
 */
export async function loadOverCapacityDates(
    dbInstance: DbOrTransaction,
    startDateKey: string,
    endDateKey?: string,
): Promise<OverCapacityDate[]> {
    if (!isValidDateKey(startDateKey) || (endDateKey && !isValidDateKey(endDateKey))) {
        throw new Error("INVALID_DATE");
    }
    if (endDateKey && startDateKey > endDateKey) throw new Error("INVALID_DATE_RANGE");

    const parcelDate = sql`date(${foodParcels.pickup_date_time_earliest} AT TIME ZONE 'Europe/Stockholm')`;
    const effectiveLimit = sql`coalesce(${pickupLocationDailyLimits.max_parcels}, ${pickupLocations.parcels_max_per_day})`;
    const dateConditions = [sql`${parcelDate} >= ${startDateKey}::date`];
    if (endDateKey) dateConditions.push(sql`${parcelDate} <= ${endDateKey}::date`);

    const rows = await dbInstance
        .select({
            locationId: pickupLocations.id,
            locationName: pickupLocations.name,
            date: sql<string>`${parcelDate}`,
            booked: sql<number>`count(*)::int`,
            limit: sql<number>`${effectiveLimit}::int`,
            overrideLimit: pickupLocationDailyLimits.max_parcels,
        })
        .from(foodParcels)
        .innerJoin(households, eq(foodParcels.household_id, households.id))
        .innerJoin(pickupLocations, eq(foodParcels.pickup_location_id, pickupLocations.id))
        .leftJoin(
            pickupLocationDailyLimits,
            and(
                eq(pickupLocationDailyLimits.pickup_location_id, foodParcels.pickup_location_id),
                sql`${pickupLocationDailyLimits.date} = ${parcelDate}`,
            ),
        )
        .where(and(notDeleted(), isNull(households.anonymized_at), ...dateConditions))
        .groupBy(
            pickupLocations.id,
            pickupLocations.name,
            pickupLocations.parcels_max_per_day,
            pickupLocationDailyLimits.max_parcels,
            parcelDate,
        )
        .having(sql`${effectiveLimit} is not null and count(*) > ${effectiveLimit}`)
        .orderBy(parcelDate, asc(pickupLocations.name));

    return rows.map(row => ({
        locationId: row.locationId,
        locationName: row.locationName,
        date: row.date,
        booked: row.booked,
        limit: row.limit,
        excess: row.booked - row.limit,
        hasOverride: row.overrideLimit !== null,
    }));
}
