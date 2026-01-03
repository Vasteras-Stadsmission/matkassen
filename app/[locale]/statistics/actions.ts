"use server";

import { db } from "@/app/db/drizzle";
import {
    households,
    householdMembers,
    householdDietaryRestrictions,
    dietaryRestrictions,
    householdAdditionalNeeds,
    additionalNeeds,
    pets,
    petSpecies,
    foodParcels,
    pickupLocations,
    outgoingSms,
} from "@/app/db/schema";
import { sql, eq, and, isNull, isNotNull, gte, lt, count } from "drizzle-orm";
import { notDeleted } from "@/app/db/query-helpers";
import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import { logError } from "@/app/utils/logger";
import { setToStartOfDay, toStockholmTime } from "@/app/utils/date-utils";
import { addDays } from "date-fns";

// Types
export interface StatisticsPeriod {
    start: Date;
    end: Date;
}

export interface OverviewStats {
    totalHouseholds: number;
    newHouseholds: number;
    removedHouseholds: number;
    totalParcels: number;
    pickedUpParcels: number;
    pickupRate: number | null;
    smsDeliveryRate: number | null;
}

export interface HouseholdStats {
    byLocale: { locale: string; count: number }[];
    byPostalCode: { postalCode: string; count: number }[];
    ageDistribution: { bucket: string; count: number }[];
    memberCountDistribution: { memberCount: number; households: number }[];
    dietaryRestrictions: { name: string; count: number }[];
    additionalNeeds: { name: string; count: number }[];
    pets: { species: string; count: number }[];
}

export interface ParcelStats {
    total: number;
    pickedUp: number;
    notPickedUp: number;
    cancelled: number;
    byLocation: { locationName: string; count: number }[];
    byWeekday: { dayNum: number; count: number }[]; // dayNum: 0=Sunday, 1=Monday, etc.
    dailyTrend: { date: string; count: number }[];
    avgPerHousehold: number | null;
}

export interface LocationStats {
    capacityUsage: {
        locationId: string;
        locationName: string;
        date: string;
        scheduled: number;
        max: number | null;
        usagePercent: number | null;
    }[];
    pickupRateByLocation: {
        locationId: string;
        locationName: string;
        rate: number;
        total: number;
    }[];
    nearCapacityAlerts: {
        locationId: string;
        locationName: string;
        date: string;
        usagePercent: number;
    }[];
}

export interface SmsStats {
    totalSent: number;
    delivered: number;
    deliveryRate: number | null;
    failedInternal: number;
    failedProvider: number;
    pending: number;
    byIntent: { intent: string; count: number }[];
    dailyVolume: { date: string; count: number }[];
}

export interface AllStatistics {
    period: PeriodOption;
    overview: OverviewStats;
    households: HouseholdStats;
    parcels: ParcelStats;
    locations: LocationStats;
    sms: SmsStats;
}

// Period parsing
export type PeriodOption = "7d" | "30d" | "90d" | "year" | "all";

function parsePeriod(period: PeriodOption): StatisticsPeriod {
    const now = new Date();
    // Convert to Stockholm time for date arithmetic to ensure consistent day boundaries
    // regardless of server timezone (e.g., UTC in CI/prod)
    const stockholmNow = toStockholmTime(now);

    // End is start of tomorrow in Stockholm timezone (exclusive)
    const end = setToStartOfDay(addDays(stockholmNow, 1));

    let start: Date;

    switch (period) {
        case "7d":
            // Last 7 days including today (Stockholm timezone)
            start = setToStartOfDay(addDays(stockholmNow, -6));
            break;
        case "30d":
            start = setToStartOfDay(addDays(stockholmNow, -29));
            break;
        case "90d":
            start = setToStartOfDay(addDays(stockholmNow, -89));
            break;
        case "year": {
            // Start of year in Stockholm timezone
            const yearStart = new Date(stockholmNow.getFullYear(), 0, 1, 0, 0, 0, 0);
            start = setToStartOfDay(yearStart);
            break;
        }
        case "all":
        default:
            start = new Date(0); // Unix epoch
            break;
    }

    return { start, end };
}

// Stockholm timezone for date grouping
const STOCKHOLM_TZ = "Europe/Stockholm";

// SQL helper for "today in Stockholm" - avoids JS timezone issues
const stockholmTodaySQL = sql`(now() AT TIME ZONE 'Europe/Stockholm')::date`;

// ========================
// OVERVIEW STATS (internal)
// ========================

async function getOverviewStats(period: StatisticsPeriod): Promise<OverviewStats> {
    // Total active households
    const [totalResult] = await db
        .select({ count: count() })
        .from(households)
        .where(isNull(households.anonymized_at));
    const totalHouseholds = totalResult?.count ?? 0;

    // New households in period
    const [newResult] = await db
        .select({ count: count() })
        .from(households)
        .where(
            and(
                isNull(households.anonymized_at),
                gte(households.created_at, period.start),
                lt(households.created_at, period.end),
            ),
        );
    const newHouseholds = newResult?.count ?? 0;

    // Removed households in period (by anonymized_at date)
    const [removedResult] = await db
        .select({ count: count() })
        .from(households)
        .where(
            and(
                isNotNull(households.anonymized_at),
                gte(households.anonymized_at, period.start),
                lt(households.anonymized_at, period.end),
            ),
        );
    const removedHouseholds = removedResult?.count ?? 0;

    // Parcels in period (by pickup date)
    const [parcelsResult] = await db
        .select({ count: count() })
        .from(foodParcels)
        .where(
            and(
                notDeleted(),
                gte(foodParcels.pickup_date_time_earliest, period.start),
                lt(foodParcels.pickup_date_time_earliest, period.end),
            ),
        );
    const totalParcels = parcelsResult?.count ?? 0;

    // Picked up parcels in period
    const [pickedUpResult] = await db
        .select({ count: count() })
        .from(foodParcels)
        .where(
            and(
                notDeleted(),
                eq(foodParcels.is_picked_up, true),
                gte(foodParcels.pickup_date_time_earliest, period.start),
                lt(foodParcels.pickup_date_time_earliest, period.end),
            ),
        );
    const pickedUpParcels = pickedUpResult?.count ?? 0;

    // Eligible parcels for pickup rate (past parcels, excluding same-day)
    // Use SQL for today comparison to avoid timezone issues
    const [eligibleResult] = await db
        .select({ count: count() })
        .from(foodParcels)
        .where(
            and(
                notDeleted(),
                gte(foodParcels.pickup_date_time_earliest, period.start),
                lt(foodParcels.pickup_date_time_earliest, period.end),
                sql`DATE(${foodParcels.pickup_date_time_earliest} AT TIME ZONE '${sql.raw(STOCKHOLM_TZ)}') < ${stockholmTodaySQL}`,
            ),
        );
    const eligibleParcels = eligibleResult?.count ?? 0;

    // Picked up among eligible
    const [pickedUpEligibleResult] = await db
        .select({ count: count() })
        .from(foodParcels)
        .where(
            and(
                notDeleted(),
                eq(foodParcels.is_picked_up, true),
                gte(foodParcels.pickup_date_time_earliest, period.start),
                lt(foodParcels.pickup_date_time_earliest, period.end),
                sql`DATE(${foodParcels.pickup_date_time_earliest} AT TIME ZONE '${sql.raw(STOCKHOLM_TZ)}') < ${stockholmTodaySQL}`,
            ),
        );
    const pickedUpEligible = pickedUpEligibleResult?.count ?? 0;

    const pickupRate = eligibleParcels > 0 ? (pickedUpEligible / eligibleParcels) * 100 : null;

    // SMS delivery rate
    const [smsResult] = await db
        .select({
            delivered: sql<number>`count(*) filter (where ${outgoingSms.provider_status} = 'delivered')::int`,
            confirmed: sql<number>`count(*) filter (where ${outgoingSms.provider_status} is not null)::int`,
        })
        .from(outgoingSms)
        .where(
            and(
                eq(outgoingSms.status, "sent"),
                gte(outgoingSms.sent_at, period.start),
                lt(outgoingSms.sent_at, period.end),
            ),
        );

    const smsDelivered = smsResult?.delivered ?? 0;
    const smsConfirmed = smsResult?.confirmed ?? 0;
    const smsDeliveryRate = smsConfirmed > 0 ? (smsDelivered / smsConfirmed) * 100 : null;

    return {
        totalHouseholds,
        newHouseholds,
        removedHouseholds,
        totalParcels,
        pickedUpParcels,
        pickupRate,
        smsDeliveryRate,
    };
}

// ========================
// HOUSEHOLD STATS (internal)
// ========================

async function getHouseholdStats(): Promise<HouseholdStats> {
    // Note: total/new/removed household counts are computed in getOverviewStats
    // This function focuses on demographic distributions

    // By locale (include removed - they preserve locale)
    const byLocaleResult = await db
        .select({
            locale: households.locale,
            count: sql<number>`count(*)::int`,
        })
        .from(households)
        .groupBy(households.locale)
        .orderBy(sql`count(*) desc`);
    const byLocale = byLocaleResult.map(r => ({ locale: r.locale, count: r.count }));

    // By postal code (include removed - they preserve postal_code, top 10)
    const byPostalCodeResult = await db
        .select({
            postalCode: households.postal_code,
            count: sql<number>`count(*)::int`,
        })
        .from(households)
        .where(isNotNull(households.postal_code))
        .groupBy(households.postal_code)
        .orderBy(sql`count(*) desc`)
        .limit(10);
    const byPostalCode = byPostalCodeResult.map(r => ({
        postalCode: r.postalCode ?? "",
        count: r.count,
    }));

    // Age distribution (active households only) - with numeric sort key
    const ageDistributionResult = await db
        .select({
            bucket: sql<string>`
                CASE
                    WHEN ${householdMembers.age} BETWEEN 0 AND 5 THEN '0-5'
                    WHEN ${householdMembers.age} BETWEEN 6 AND 12 THEN '6-12'
                    WHEN ${householdMembers.age} BETWEEN 13 AND 17 THEN '13-17'
                    WHEN ${householdMembers.age} BETWEEN 18 AND 64 THEN '18-64'
                    ELSE '65+'
                END
            `,
            sortKey: sql<number>`
                CASE
                    WHEN ${householdMembers.age} BETWEEN 0 AND 5 THEN 1
                    WHEN ${householdMembers.age} BETWEEN 6 AND 12 THEN 2
                    WHEN ${householdMembers.age} BETWEEN 13 AND 17 THEN 3
                    WHEN ${householdMembers.age} BETWEEN 18 AND 64 THEN 4
                    ELSE 5
                END
            `,
            count: sql<number>`count(*)::int`,
        })
        .from(householdMembers)
        .innerJoin(households, eq(householdMembers.household_id, households.id))
        .where(isNull(households.anonymized_at))
        .groupBy(sql`1, 2`)
        .orderBy(sql`2`);
    const ageDistribution = ageDistributionResult.map(r => ({ bucket: r.bucket, count: r.count }));

    // Member count distribution (active households only)
    // Count includes head of household (+1) plus additional members
    const memberCountResult = await db
        .select({
            memberCount: sql<number>`(count(${householdMembers.id}) + 1)::int`,
            households: sql<number>`1`,
        })
        .from(households)
        .leftJoin(householdMembers, eq(householdMembers.household_id, households.id))
        .where(isNull(households.anonymized_at))
        .groupBy(households.id);

    // Aggregate the member counts
    const memberCountMap = new Map<number, number>();
    for (const row of memberCountResult) {
        const mc = row.memberCount;
        memberCountMap.set(mc, (memberCountMap.get(mc) ?? 0) + 1);
    }
    const memberCountDistribution = Array.from(memberCountMap.entries())
        .map(([memberCount, households]) => ({ memberCount, households }))
        .sort((a, b) => a.memberCount - b.memberCount);

    // Dietary restrictions (active households only)
    const dietaryResult = await db
        .select({
            name: dietaryRestrictions.name,
            count: sql<number>`count(distinct ${householdDietaryRestrictions.household_id})::int`,
        })
        .from(householdDietaryRestrictions)
        .innerJoin(
            dietaryRestrictions,
            eq(householdDietaryRestrictions.dietary_restriction_id, dietaryRestrictions.id),
        )
        .innerJoin(households, eq(householdDietaryRestrictions.household_id, households.id))
        .where(isNull(households.anonymized_at))
        .groupBy(dietaryRestrictions.name)
        .orderBy(sql`count(*) desc`);
    const dietaryRestrictionsStats = dietaryResult.map(r => ({ name: r.name, count: r.count }));

    // Additional needs (active households only)
    const additionalNeedsResult = await db
        .select({
            name: additionalNeeds.need,
            count: sql<number>`count(distinct ${householdAdditionalNeeds.household_id})::int`,
        })
        .from(householdAdditionalNeeds)
        .innerJoin(
            additionalNeeds,
            eq(householdAdditionalNeeds.additional_need_id, additionalNeeds.id),
        )
        .innerJoin(households, eq(householdAdditionalNeeds.household_id, households.id))
        .where(isNull(households.anonymized_at))
        .groupBy(additionalNeeds.need)
        .orderBy(sql`count(*) desc`);
    const additionalNeedsStats = additionalNeedsResult.map(r => ({ name: r.name, count: r.count }));

    // Pets - count households with each pet species (active households only)
    const petsResult = await db
        .select({
            species: petSpecies.name,
            count: sql<number>`count(distinct ${pets.household_id})::int`,
        })
        .from(pets)
        .innerJoin(petSpecies, eq(pets.pet_species_id, petSpecies.id))
        .innerJoin(households, eq(pets.household_id, households.id))
        .where(isNull(households.anonymized_at))
        .groupBy(petSpecies.name)
        .orderBy(sql`count(*) desc`);
    const petsStats = petsResult.map(r => ({ species: r.species, count: r.count }));

    return {
        byLocale,
        byPostalCode,
        ageDistribution,
        memberCountDistribution,
        dietaryRestrictions: dietaryRestrictionsStats,
        additionalNeeds: additionalNeedsStats,
        pets: petsStats,
    };
}

// ========================
// PARCEL STATS (internal)
// ========================

async function getParcelStats(period: StatisticsPeriod): Promise<ParcelStats> {
    // Total active parcels in period
    const [totalResult] = await db
        .select({ count: count() })
        .from(foodParcels)
        .where(
            and(
                notDeleted(),
                gte(foodParcels.pickup_date_time_earliest, period.start),
                lt(foodParcels.pickup_date_time_earliest, period.end),
            ),
        );
    const total = totalResult?.count ?? 0;

    // Picked up
    const [pickedUpResult] = await db
        .select({ count: count() })
        .from(foodParcels)
        .where(
            and(
                notDeleted(),
                eq(foodParcels.is_picked_up, true),
                gte(foodParcels.pickup_date_time_earliest, period.start),
                lt(foodParcels.pickup_date_time_earliest, period.end),
            ),
        );
    const pickedUp = pickedUpResult?.count ?? 0;

    // Not picked up (past only, excluding same-day)
    const [notPickedUpResult] = await db
        .select({ count: count() })
        .from(foodParcels)
        .where(
            and(
                notDeleted(),
                eq(foodParcels.is_picked_up, false),
                gte(foodParcels.pickup_date_time_earliest, period.start),
                lt(foodParcels.pickup_date_time_earliest, period.end),
                sql`DATE(${foodParcels.pickup_date_time_earliest} AT TIME ZONE '${sql.raw(STOCKHOLM_TZ)}') < ${stockholmTodaySQL}`,
            ),
        );
    const notPickedUp = notPickedUpResult?.count ?? 0;

    // Cancelled (soft-deleted)
    const [cancelledResult] = await db
        .select({ count: count() })
        .from(foodParcels)
        .where(
            and(
                isNotNull(foodParcels.deleted_at),
                gte(foodParcels.pickup_date_time_earliest, period.start),
                lt(foodParcels.pickup_date_time_earliest, period.end),
            ),
        );
    const cancelled = cancelledResult?.count ?? 0;

    // By location
    const byLocationResult = await db
        .select({
            locationId: pickupLocations.id,
            locationName: pickupLocations.name,
            count: sql<number>`count(*)::int`,
        })
        .from(foodParcels)
        .innerJoin(pickupLocations, eq(foodParcels.pickup_location_id, pickupLocations.id))
        .where(
            and(
                notDeleted(),
                gte(foodParcels.pickup_date_time_earliest, period.start),
                lt(foodParcels.pickup_date_time_earliest, period.end),
            ),
        )
        .groupBy(pickupLocations.id, pickupLocations.name)
        .orderBy(sql`count(*) desc`);
    const byLocation = byLocationResult.map(r => ({
        locationName: r.locationName,
        count: r.count,
    }));

    // By weekday (Stockholm time) - return dayNum for client-side translation
    const byWeekdayResult = await db
        .select({
            dayNum: sql<number>`extract(dow from ${foodParcels.pickup_date_time_earliest} AT TIME ZONE '${sql.raw(STOCKHOLM_TZ)}')::int`,
            count: sql<number>`count(*)::int`,
        })
        .from(foodParcels)
        .where(
            and(
                notDeleted(),
                gte(foodParcels.pickup_date_time_earliest, period.start),
                lt(foodParcels.pickup_date_time_earliest, period.end),
            ),
        )
        .groupBy(sql`1`)
        .orderBy(sql`1`);
    const byWeekday = byWeekdayResult.map(r => ({ dayNum: r.dayNum, count: r.count }));

    // Daily trend (Stockholm time)
    const dailyTrendResult = await db
        .select({
            date: sql<string>`to_char(${foodParcels.pickup_date_time_earliest} AT TIME ZONE '${sql.raw(STOCKHOLM_TZ)}', 'YYYY-MM-DD')`,
            count: sql<number>`count(*)::int`,
        })
        .from(foodParcels)
        .where(
            and(
                notDeleted(),
                gte(foodParcels.pickup_date_time_earliest, period.start),
                lt(foodParcels.pickup_date_time_earliest, period.end),
            ),
        )
        .groupBy(sql`1`)
        .orderBy(sql`1`);
    const dailyTrend = dailyTrendResult.map(r => ({ date: r.date, count: r.count }));

    // Avg parcels per household (active households with parcels in period)
    // Get parcel counts per household, then calculate average in JavaScript
    const parcelCountsPerHousehold = await db
        .select({
            householdId: foodParcels.household_id,
            count: sql<number>`count(*)::int`,
        })
        .from(foodParcels)
        .innerJoin(households, eq(foodParcels.household_id, households.id))
        .where(
            and(
                notDeleted(),
                isNull(households.anonymized_at),
                gte(foodParcels.pickup_date_time_earliest, period.start),
                lt(foodParcels.pickup_date_time_earliest, period.end),
            ),
        )
        .groupBy(foodParcels.household_id);

    const avgPerHousehold =
        parcelCountsPerHousehold.length > 0
            ? parcelCountsPerHousehold.reduce((sum, h) => sum + h.count, 0) /
              parcelCountsPerHousehold.length
            : null;

    return {
        total,
        pickedUp,
        notPickedUp,
        cancelled,
        byLocation,
        byWeekday,
        dailyTrend,
        avgPerHousehold,
    };
}

// ========================
// LOCATION STATS (internal)
// ========================

async function getLocationStats(period: StatisticsPeriod): Promise<LocationStats> {
    // Get all locations
    const locations = await db.select().from(pickupLocations);

    // Optimized: Get capacity usage for next 7 days in a single query
    const capacityResult = await db
        .select({
            locationId: foodParcels.pickup_location_id,
            date: sql<string>`to_char(${foodParcels.pickup_date_time_earliest} AT TIME ZONE '${sql.raw(STOCKHOLM_TZ)}', 'YYYY-MM-DD')`,
            count: sql<number>`count(*)::int`,
        })
        .from(foodParcels)
        .where(
            and(
                notDeleted(),
                sql`DATE(${foodParcels.pickup_date_time_earliest} AT TIME ZONE '${sql.raw(STOCKHOLM_TZ)}') >= ${stockholmTodaySQL}`,
                sql`DATE(${foodParcels.pickup_date_time_earliest} AT TIME ZONE '${sql.raw(STOCKHOLM_TZ)}') < ${stockholmTodaySQL} + interval '7 days'`,
            ),
        )
        .groupBy(sql`1, 2`);

    // Build capacity map: locationId -> date -> count
    const capacityMap = new Map<string, Map<string, number>>();
    for (const row of capacityResult) {
        if (!capacityMap.has(row.locationId)) {
            capacityMap.set(row.locationId, new Map());
        }
        capacityMap.get(row.locationId)!.set(row.date, row.count);
    }

    // Generate capacity usage for each location for next 7 days
    const capacityUsage: LocationStats["capacityUsage"] = [];
    const nearCapacityAlerts: LocationStats["nearCapacityAlerts"] = [];

    // Generate dates in Stockholm timezone
    // Use Intl.DateTimeFormat to format dates consistently in Stockholm timezone
    const stockholmFormatter = new Intl.DateTimeFormat("sv-SE", {
        timeZone: STOCKHOLM_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    const now = new Date();
    for (let i = 0; i < 7; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() + i);
        const dateStr = stockholmFormatter.format(date); // YYYY-MM-DD format in Stockholm TZ

        for (const location of locations) {
            const scheduled = capacityMap.get(location.id)?.get(dateStr) ?? 0;
            const max = location.parcels_max_per_day;
            const usagePercent = max ? (scheduled / max) * 100 : null;

            capacityUsage.push({
                locationId: location.id,
                locationName: location.name,
                date: dateStr,
                scheduled,
                max,
                usagePercent,
            });

            if (usagePercent !== null && usagePercent >= 80) {
                nearCapacityAlerts.push({
                    locationId: location.id,
                    locationName: location.name,
                    date: dateStr,
                    usagePercent,
                });
            }
        }
    }

    // Pickup rate by location (for the period)
    // Fixed: count pickedUpEligible (picked up AND eligible) separately
    const pickupRateResult = await db
        .select({
            locationId: pickupLocations.id,
            locationName: pickupLocations.name,
            pickedUpEligible: sql<number>`count(*) filter (
                where ${foodParcels.is_picked_up} = true
                AND DATE(${foodParcels.pickup_date_time_earliest} AT TIME ZONE '${sql.raw(STOCKHOLM_TZ)}') < ${stockholmTodaySQL}
            )::int`,
            eligible: sql<number>`count(*) filter (
                where DATE(${foodParcels.pickup_date_time_earliest} AT TIME ZONE '${sql.raw(STOCKHOLM_TZ)}') < ${stockholmTodaySQL}
            )::int`,
            total: sql<number>`count(*)::int`,
        })
        .from(foodParcels)
        .innerJoin(pickupLocations, eq(foodParcels.pickup_location_id, pickupLocations.id))
        .where(
            and(
                notDeleted(),
                gte(foodParcels.pickup_date_time_earliest, period.start),
                lt(foodParcels.pickup_date_time_earliest, period.end),
            ),
        )
        .groupBy(pickupLocations.id, pickupLocations.name);

    const pickupRateByLocation = pickupRateResult.map(r => ({
        locationId: r.locationId,
        locationName: r.locationName,
        rate: r.eligible > 0 ? (r.pickedUpEligible / r.eligible) * 100 : 0,
        total: r.total,
    }));

    return {
        capacityUsage,
        pickupRateByLocation,
        nearCapacityAlerts,
    };
}

// ========================
// SMS STATS (internal)
// ========================

async function getSmsStats(period: StatisticsPeriod): Promise<SmsStats> {
    // Total sent in period
    const [totalSentResult] = await db
        .select({ count: count() })
        .from(outgoingSms)
        .where(
            and(
                eq(outgoingSms.status, "sent"),
                gte(outgoingSms.sent_at, period.start),
                lt(outgoingSms.sent_at, period.end),
            ),
        );
    const totalSent = totalSentResult?.count ?? 0;

    // Delivery stats
    const [deliveryResult] = await db
        .select({
            delivered: sql<number>`count(*) filter (where ${outgoingSms.provider_status} = 'delivered')::int`,
            confirmed: sql<number>`count(*) filter (where ${outgoingSms.provider_status} is not null)::int`,
        })
        .from(outgoingSms)
        .where(
            and(
                eq(outgoingSms.status, "sent"),
                gte(outgoingSms.sent_at, period.start),
                lt(outgoingSms.sent_at, period.end),
            ),
        );
    const delivered = deliveryResult?.delivered ?? 0;
    const confirmed = deliveryResult?.confirmed ?? 0;
    const deliveryRate = confirmed > 0 ? (delivered / confirmed) * 100 : null;

    // Failed (internal)
    const [failedInternalResult] = await db
        .select({ count: count() })
        .from(outgoingSms)
        .where(
            and(
                eq(outgoingSms.status, "failed"),
                gte(outgoingSms.created_at, period.start),
                lt(outgoingSms.created_at, period.end),
            ),
        );
    const failedInternal = failedInternalResult?.count ?? 0;

    // Failed (provider)
    const [failedProviderResult] = await db
        .select({ count: count() })
        .from(outgoingSms)
        .where(
            and(
                eq(outgoingSms.status, "sent"),
                sql`${outgoingSms.provider_status} in ('failed', 'not delivered')`,
                gte(outgoingSms.sent_at, period.start),
                lt(outgoingSms.sent_at, period.end),
            ),
        );
    const failedProvider = failedProviderResult?.count ?? 0;

    // Pending
    const [pendingResult] = await db
        .select({ count: count() })
        .from(outgoingSms)
        .where(sql`${outgoingSms.status} in ('queued', 'sending', 'retrying')`);
    const pending = pendingResult?.count ?? 0;

    // By intent
    const byIntentResult = await db
        .select({
            intent: outgoingSms.intent,
            count: sql<number>`count(*)::int`,
        })
        .from(outgoingSms)
        .where(
            and(
                eq(outgoingSms.status, "sent"),
                gte(outgoingSms.sent_at, period.start),
                lt(outgoingSms.sent_at, period.end),
            ),
        )
        .groupBy(outgoingSms.intent)
        .orderBy(sql`count(*) desc`);
    const byIntent = byIntentResult.map(r => ({ intent: r.intent, count: r.count }));

    // Daily volume (Stockholm time)
    const dailyVolumeResult = await db
        .select({
            date: sql<string>`to_char(${outgoingSms.sent_at} AT TIME ZONE '${sql.raw(STOCKHOLM_TZ)}', 'YYYY-MM-DD')`,
            count: sql<number>`count(*)::int`,
        })
        .from(outgoingSms)
        .where(
            and(
                eq(outgoingSms.status, "sent"),
                gte(outgoingSms.sent_at, period.start),
                lt(outgoingSms.sent_at, period.end),
            ),
        )
        .groupBy(sql`1`)
        .orderBy(sql`1`);
    const dailyVolume = dailyVolumeResult.map(r => ({ date: r.date, count: r.count }));

    return {
        totalSent,
        delivered,
        deliveryRate,
        failedInternal,
        failedProvider,
        pending,
        byIntent,
        dailyVolume,
    };
}

// ========================
// PUBLIC API (protected)
// ========================

/**
 * Get all statistics for the given period.
 * Protected action that requires authentication.
 */
export const getAllStatistics = protectedAction(
    async (_session, periodOption: PeriodOption): Promise<ActionResult<AllStatistics>> => {
        try {
            const period = parsePeriod(periodOption);

            const [overview, householdStats, parcels, locations, sms] = await Promise.all([
                getOverviewStats(period),
                getHouseholdStats(),
                getParcelStats(period),
                getLocationStats(period),
                getSmsStats(period),
            ]);

            return success({
                period: periodOption,
                overview,
                households: householdStats,
                parcels,
                locations,
                sms,
            });
        } catch (error) {
            logError("Failed to fetch statistics", error, { periodOption });
            return failure({
                code: "LOAD_ERROR",
                message: "LOAD_ERROR", // Client will translate using t("error")
            });
        }
    },
);
