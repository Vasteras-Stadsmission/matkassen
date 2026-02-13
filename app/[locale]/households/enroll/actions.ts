"use server";

import { db } from "@/app/db/drizzle";
import {
    households,
    foodParcels,
    householdMembers,
    dietaryRestrictions as dietaryRestrictionsTable,
    householdDietaryRestrictions as householdDietaryRestrictionsTable,
    additionalNeeds as additionalNeedsTable,
    householdAdditionalNeeds as householdAdditionalNeedsTable,
    petSpecies as petSpeciesTable,
    pets as petsTable,
    pickupLocations as pickupLocationsTable,
    pickupLocationSchedules as pickupLocationSchedulesTable,
    pickupLocationScheduleDays as pickupLocationScheduleDaysTable,
    householdComments,
} from "@/app/db/schema";
import { eq, and, sql, gte, lte, count, inArray, asc, desc } from "drizzle-orm";
import { notDeleted } from "@/app/db/query-helpers";
import { getStockholmDayUtcRange, getStockholmDateKey } from "@/app/utils/date-utils";
import { protectedAgreementAction } from "@/app/utils/auth/protected-action";
import { ParcelValidationError } from "@/app/utils/errors/validation-errors";
import {
    success,
    failure,
    validationFailure,
    type ActionResult,
} from "@/app/utils/auth/action-result";
import { logger, logError } from "@/app/utils/logger";
import { normalizePhoneToE164, validatePhoneInput } from "@/app/utils/validation/phone-validation";
import { createSmsRecord } from "@/app/utils/sms/sms-service";
import { formatEnrolmentSms } from "@/app/utils/sms/templates";
import type { SupportedLocale } from "@/app/utils/locale-detection";

import {
    HouseholdCreateData,
    FoodParcelCreateData,
    HouseholdMemberData,
    DietaryRestrictionData,
    AdditionalNeedData,
} from "./types";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

class OptionNotAvailableError extends Error {
    readonly code = "OPTION_NOT_AVAILABLE";

    constructor() {
        super("error.optionNotAvailable");
    }
}

function dedupeIds(ids: string[]): string[] {
    return [...new Set(ids.filter(Boolean))];
}

async function ensureActiveDietaryRestrictions(
    tx: DbTransaction,
    restrictions: DietaryRestrictionData[],
) {
    const ids = dedupeIds(restrictions.map(restriction => restriction.id));
    if (ids.length === 0) return;

    const existing = await tx
        .select({
            id: dietaryRestrictionsTable.id,
            isActive: dietaryRestrictionsTable.is_active,
        })
        .from(dietaryRestrictionsTable)
        .where(inArray(dietaryRestrictionsTable.id, ids));

    const activeIds = new Set(existing.filter(item => item.isActive).map(item => item.id));
    const invalid = restrictions.find(restriction => !activeIds.has(restriction.id));
    if (invalid) {
        throw new OptionNotAvailableError();
    }
}

async function ensureActivePetSpecies(
    tx: DbTransaction,
    pets: { species: string; speciesName?: string; count?: number }[],
) {
    const speciesIds = dedupeIds(pets.map(pet => pet.species));
    if (speciesIds.length === 0) return;

    const existing = await tx
        .select({
            id: petSpeciesTable.id,
            isActive: petSpeciesTable.is_active,
        })
        .from(petSpeciesTable)
        .where(inArray(petSpeciesTable.id, speciesIds));

    const activeIds = new Set(existing.filter(item => item.isActive).map(item => item.id));
    const invalid = pets.find(pet => !activeIds.has(pet.species));
    if (invalid) {
        throw new OptionNotAvailableError();
    }
}

async function ensureActiveAdditionalNeeds(tx: DbTransaction, needs: AdditionalNeedData[]) {
    const ids = dedupeIds(needs.map(need => need.id));
    if (ids.length === 0) return;

    const existing = await tx
        .select({
            id: additionalNeedsTable.id,
            isActive: additionalNeedsTable.is_active,
        })
        .from(additionalNeedsTable)
        .where(inArray(additionalNeedsTable.id, ids));

    const activeIds = new Set(existing.filter(item => item.isActive).map(item => item.id));
    const invalid = needs.find(need => !activeIds.has(need.id));
    if (invalid) {
        throw new OptionNotAvailableError();
    }
}

export const enrollHousehold = protectedAgreementAction(
    async (session, data: HouseholdCreateData): Promise<ActionResult<{ householdId: string }>> => {
        try {
            // Auth already verified by protectedAction wrapper

            // Server-side validation - don't trust client input
            const phoneError = validatePhoneInput(data.headOfHousehold.phoneNumber);
            if (phoneError) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: phoneError, // Translation key e.g. "validation.phoneNumberFormat"
                });
            }

            // Store locationId for recompute after transaction
            const locationId = data.foodParcels?.pickupLocationId;

            // Use a transaction to ensure all operations succeed or fail together
            const result = await db.transaction(async tx => {
                // 1. Create household
                const [household] = await tx
                    .insert(households)
                    .values({
                        first_name: data.headOfHousehold.firstName,
                        last_name: data.headOfHousehold.lastName,
                        phone_number: normalizePhoneToE164(data.headOfHousehold.phoneNumber),
                        locale: data.headOfHousehold.locale || "sv",
                        created_by: session.user?.githubUsername ?? null,
                    })
                    .returning();

                // 2. Add household members
                if (data.members && data.members.length > 0) {
                    await tx.insert(householdMembers).values(
                        data.members.map((member: HouseholdMemberData) => ({
                            household_id: household.id,
                            age: member.age,
                            sex: member.sex as "male" | "female" | "other",
                        })),
                    );
                }

                // 3. Add dietary restrictions
                if (data.dietaryRestrictions && data.dietaryRestrictions.length > 0) {
                    await ensureActiveDietaryRestrictions(tx, data.dietaryRestrictions);

                    // Then link all restrictions to the household
                    await tx.insert(householdDietaryRestrictionsTable).values(
                        dedupeIds(data.dietaryRestrictions.map(restriction => restriction.id)).map(
                            restrictionId => ({
                                household_id: household.id,
                                dietary_restriction_id: restrictionId,
                            }),
                        ),
                    );
                }

                // 4. Add pets
                if (data.pets && data.pets.length > 0) {
                    await ensureActivePetSpecies(tx, data.pets);

                    // Then add all pets to the database
                    await tx.insert(petsTable).values(
                        data.pets.map(
                            (pet: { species: string; speciesName?: string; count?: number }) => ({
                                household_id: household.id,
                                pet_species_id: pet.species,
                            }),
                        ),
                    );
                }

                // 5. Add additional needs
                if (data.additionalNeeds && data.additionalNeeds.length > 0) {
                    await ensureActiveAdditionalNeeds(tx, data.additionalNeeds);

                    // Then link all needs to the household
                    await tx.insert(householdAdditionalNeedsTable).values(
                        dedupeIds(data.additionalNeeds.map(need => need.id)).map(needId => ({
                            household_id: household.id,
                            additional_need_id: needId,
                        })),
                    );
                }

                // 6. Create food parcels if provided
                if (
                    data.foodParcels &&
                    data.foodParcels.parcels &&
                    data.foodParcels.parcels.length > 0
                ) {
                    // Validate all parcel assignments before creating any
                    const { validateParcelAssignments } =
                        await import("@/app/[locale]/schedule/actions");

                    const parcelsToValidate = data.foodParcels.parcels.map(parcel => ({
                        householdId: household.id,
                        locationId: data.foodParcels.pickupLocationId,
                        pickupDate: new Date(parcel.pickupEarliestTime.toDateString()), // Date only
                        pickupStartTime: parcel.pickupEarliestTime,
                        pickupEndTime: parcel.pickupLatestTime,
                    }));

                    const validationResult = await validateParcelAssignments(parcelsToValidate, tx);

                    if (!validationResult.success) {
                        // Throw to trigger transaction rollback
                        throw new ParcelValidationError(
                            "Parcel validation failed",
                            validationResult.errors || [],
                        );
                    }

                    // Use upsert pattern to ensure idempotency under concurrent operations
                    // The partial unique index food_parcels_household_location_time_active_unique
                    // (household_id, pickup_location_id, pickup_date_time_earliest, pickup_date_time_latest)
                    // WHERE deleted_at IS NULL guarantees that we won't create duplicates even if
                    // multiple requests run concurrently. Including location ensures that location
                    // changes are properly handled.
                    //
                    // Drizzle ORM supports partial index targeting through the 'where' parameter
                    // in onConflictDoNothing (supported since v0.31.0, we're on v0.42.0)
                    const parcelsToInsert = data.foodParcels.parcels.map(
                        (parcel: FoodParcelCreateData) => ({
                            household_id: household.id,
                            pickup_location_id: data.foodParcels.pickupLocationId,
                            pickup_date_time_earliest: parcel.pickupEarliestTime,
                            pickup_date_time_latest: parcel.pickupLatestTime,
                            is_picked_up: false,
                        }),
                    );

                    // Use centralized helper for proper conflict handling
                    const { insertParcels } = await import("@/app/db/insert-parcels");
                    await insertParcels(tx, parcelsToInsert);
                }

                // 7. Add comments if provided
                if (data.comments && data.comments.length > 0) {
                    const validComments = data.comments
                        .filter(comment => comment.trim().length > 0)
                        .map(comment => ({
                            household_id: household.id,
                            comment: comment.trim(),
                            author_github_username: session.user?.githubUsername ?? "anonymous",
                        }));

                    if (validComments.length > 0) {
                        await tx.insert(householdComments).values(validComments);
                    }
                }

                return { householdId: household.id };
            });

            /**
             * EVENTUAL CONSISTENCY: Recompute outside-hours count after transaction commits.
             *
             * This is intentionally executed AFTER the transaction to avoid holding database locks
             * during the potentially expensive recomputation. The trade-off is that there's a brief
             * window where the count might be stale if another request modifies parcels between
             * transaction commit and this recomputation.
             *
             * This is acceptable because:
             * 1. The outside-hours count is a UI convenience feature, not critical business logic
             * 2. The count will eventually converge to the correct value
             * 3. Keeping it inside the transaction would increase lock contention and reduce throughput
             * 4. Any stale count will be corrected by the next schedule operation
             *
             * If stronger consistency is required, consider moving this to a background job queue.
             */
            if (locationId) {
                try {
                    const { recomputeOutsideHoursCount } =
                        await import("@/app/[locale]/schedule/actions");
                    await recomputeOutsideHoursCount(locationId);
                } catch (e) {
                    logError("Failed to recompute outside-hours count after enrollment", e, {
                        locationId,
                        action: "enrollHousehold",
                    });
                    // Non-fatal: The count will be corrected by the next schedule operation
                }
            }

            // Send enrollment SMS if consent was given
            if (data.smsConsent && data.headOfHousehold.phoneNumber) {
                try {
                    const locale = (data.headOfHousehold.locale || "sv") as SupportedLocale;
                    const smsText = formatEnrolmentSms(locale);
                    const phoneE164 = normalizePhoneToE164(data.headOfHousehold.phoneNumber);

                    await createSmsRecord({
                        intent: "enrolment",
                        householdId: result.householdId,
                        toE164: phoneE164,
                        text: smsText,
                    });

                    logger.debug({ householdId: result.householdId }, "Enrollment SMS queued");
                } catch (e) {
                    logError("Failed to queue enrollment SMS", e, {
                        householdId: result.householdId,
                        action: "enrollHousehold",
                    });
                    // Non-fatal: Household was created successfully, SMS is best-effort
                }
            }

            // Audit log with IDs only (no PII)
            logger.info(
                {
                    householdId: result.householdId,
                    locationId: data.foodParcels?.pickupLocationId,
                    parcelCount: data.foodParcels?.parcels?.length || 0,
                    smsQueued: data.smsConsent,
                },
                "Household enrolled",
            );

            return success(result);
        } catch (error: unknown) {
            // Check if this is a validation error from within the transaction
            if (error instanceof ParcelValidationError) {
                return validationFailure(error.message, error.validationErrors);
            }
            if (error instanceof OptionNotAvailableError) {
                return failure({
                    code: error.code,
                    message: error.message,
                });
            }

            logError("Error enrolling household", error, {
                action: "enrollHousehold",
                hasData: !!data,
            });
            return failure({
                code: "INTERNAL_ERROR",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    },
);

// Helper function to get all dietary restrictions
export async function getDietaryRestrictions() {
    try {
        return await db
            .select({
                id: dietaryRestrictionsTable.id,
                name: dietaryRestrictionsTable.name,
                isActive: dietaryRestrictionsTable.is_active,
            })
            .from(dietaryRestrictionsTable)
            .orderBy(desc(dietaryRestrictionsTable.is_active), asc(dietaryRestrictionsTable.name));
    } catch (error) {
        logError("Error fetching dietary restrictions", error, {
            action: "getDietaryRestrictions",
        });
        return [];
    }
}

// Helper function to get all additional needs
export async function getAdditionalNeeds() {
    try {
        return await db
            .select({
                id: additionalNeedsTable.id,
                need: additionalNeedsTable.need,
                isActive: additionalNeedsTable.is_active,
            })
            .from(additionalNeedsTable)
            .orderBy(desc(additionalNeedsTable.is_active), asc(additionalNeedsTable.need));
    } catch (error) {
        logError("Error fetching additional needs", error, {
            action: "getAdditionalNeeds",
        });
        return [];
    }
}

// Helper function to get all pickup locations
export async function getPickupLocations() {
    try {
        return await db.select().from(pickupLocationsTable);
    } catch (error) {
        logError("Error fetching pickup locations", error, {
            action: "getPickupLocations",
        });
        return [];
    }
}

/**
 * Fetches all available pet species from the database
 * @returns Array of pet species
 */
export async function getPetSpecies() {
    try {
        return await db
            .select({
                id: petSpeciesTable.id,
                name: petSpeciesTable.name,
                isActive: petSpeciesTable.is_active,
            })
            .from(petSpeciesTable)
            .orderBy(desc(petSpeciesTable.is_active), asc(petSpeciesTable.name));
    } catch (error) {
        logError("Error fetching pet species", error, {
            action: "getPetSpecies",
        });
        return [];
    }
}

/**
 * Check if a pickup location has reached its maximum capacity for a specific date
 * @param locationId Pickup location ID
 * @param date Date to check
 * @param excludeHouseholdId Optional household ID to exclude from the count
 * @returns Object containing isAvailable and info about capacity
 */
export async function checkPickupLocationCapacity(
    locationId: string,
    date: Date,
    excludeHouseholdId?: string,
) {
    try {
        // Get the location to check if it has a max parcels per day limit
        const [location] = await db
            .select()
            .from(pickupLocationsTable)
            .where(eq(pickupLocationsTable.id, locationId))
            .limit(1);

        // If location doesn't exist or has no limit, return available
        if (!location || location.parcels_max_per_day === null) {
            return {
                isAvailable: true,
                currentCount: 0,
                maxCount: null,
                message: "Ingen gräns för denna hämtplats",
            };
        }

        // Get Stockholm day boundaries in UTC for correct timezone-aware comparison
        const { startUtc, endUtc } = getStockholmDayUtcRange(date);

        // Build query conditions using range comparison (more reliable than EXTRACT)
        const whereConditions = [
            eq(foodParcels.pickup_location_id, locationId),
            gte(foodParcels.pickup_date_time_earliest, startUtc),
            lte(foodParcels.pickup_date_time_earliest, endUtc),
            notDeleted(),
        ];

        // Exclude the current household's parcels if we're editing an existing household
        if (excludeHouseholdId) {
            whereConditions.push(sql`${foodParcels.household_id} != ${excludeHouseholdId}`);
        }

        // Use count(*) for efficiency instead of selecting all rows
        const [result] = await db
            .select({ count: count() })
            .from(foodParcels)
            .where(and(...whereConditions));

        const parcelCount = result?.count ?? 0;
        const isAvailable = parcelCount < location.parcels_max_per_day;

        // Return availability info
        return {
            isAvailable,
            currentCount: parcelCount,
            maxCount: location.parcels_max_per_day,
            message: isAvailable
                ? `${parcelCount} av ${location.parcels_max_per_day} bokade`
                : `Max antal (${location.parcels_max_per_day}) matkassar bokade för detta datum`,
        };
    } catch (error) {
        logError("Error checking pickup location capacity", error, {
            action: "checkPickupLocationCapacity",
            locationId,
            date: date?.toISOString(),
        });
        // Default to available in case of error, with a warning message
        return {
            isAvailable: true,
            currentCount: 0,
            maxCount: null,
            message: "Kunde inte kontrollera kapacitet",
        };
    }
}

/**
 * Get capacity data for a range of dates in a single query
 * @param locationId Pickup location ID
 * @param startDate Start date of the range
 * @param endDate End date of the range
 * @returns Object containing capacity data for the range
 */
export async function getPickupLocationCapacityForRange(
    locationId: string,
    startDate: Date,
    endDate: Date,
) {
    try {
        // Get the location to check if it has a max parcels per day limit
        const [location] = await db
            .select()
            .from(pickupLocationsTable)
            .where(eq(pickupLocationsTable.id, locationId))
            .limit(1);

        // If location doesn't exist or has no limit, return null
        if (!location || location.parcels_max_per_day === null) {
            return {
                hasLimit: false,
                maxPerDay: null,
                dateCapacities: {},
            };
        }

        // Get Stockholm day boundaries in UTC for consistent timezone handling
        const { startUtc } = getStockholmDayUtcRange(startDate);
        const { endUtc } = getStockholmDayUtcRange(endDate);

        // Get all food parcels for this location within the date range
        const parcels = await db
            .select({
                pickupDateEarliest: foodParcels.pickup_date_time_earliest,
            })
            .from(foodParcels)
            .where(
                and(
                    eq(foodParcels.pickup_location_id, locationId),
                    gte(foodParcels.pickup_date_time_earliest, startUtc),
                    lte(foodParcels.pickup_date_time_earliest, endUtc),
                    notDeleted(),
                ),
            );

        // Count parcels by Stockholm date (consistent with checkPickupLocationCapacity)
        const dateCountMap: Record<string, number> = {};

        parcels.forEach(parcel => {
            // Use getStockholmDateKey for consistent date bucketing
            const dateKey = getStockholmDateKey(parcel.pickupDateEarliest);

            if (!dateCountMap[dateKey]) {
                dateCountMap[dateKey] = 0;
            }

            dateCountMap[dateKey]++;
        });

        // Return capacity info for all dates
        return {
            hasLimit: true,
            maxPerDay: location.parcels_max_per_day,
            dateCapacities: dateCountMap,
        };
    } catch (error) {
        logError("Error checking pickup location capacity range", error, {
            action: "getPickupLocationCapacityForRange",
            locationId,
            startDate: startDate?.toISOString(),
            endDate: endDate?.toISOString(),
        });
        return {
            hasLimit: false,
            maxPerDay: null,
            dateCapacities: {},
        };
    }
}

/**
 * Get active and upcoming schedules for a pickup location
 * @param locationId Pickup location ID
 * @returns Array of schedules with their opening days
 */
export async function getPickupLocationSchedules(locationId: string) {
    try {
        const currentDate = new Date();
        // Use our date utility for consistent Stockholm timezone date formatting
        const currentDateStr = getStockholmDateKey(currentDate);

        // Get all current and upcoming schedules for this location
        // (end_date is in the future - this includes both active and upcoming schedules)
        const schedules = await db
            .select({
                id: pickupLocationSchedulesTable.id,
                name: pickupLocationSchedulesTable.name,
                startDate: pickupLocationSchedulesTable.start_date,
                endDate: pickupLocationSchedulesTable.end_date,
            })
            .from(pickupLocationSchedulesTable)
            .where(
                and(
                    eq(pickupLocationSchedulesTable.pickup_location_id, locationId),
                    sql`${pickupLocationSchedulesTable.end_date} >= ${currentDateStr}::date`,
                ),
            );

        // For each schedule, get the days it's active
        const schedulesWithDays = await Promise.all(
            schedules.map(async schedule => {
                const days = await db
                    .select({
                        weekday: pickupLocationScheduleDaysTable.weekday,
                        isOpen: pickupLocationScheduleDaysTable.is_open,
                        openingTime: pickupLocationScheduleDaysTable.opening_time,
                        closingTime: pickupLocationScheduleDaysTable.closing_time,
                    })
                    .from(pickupLocationScheduleDaysTable)
                    .where(eq(pickupLocationScheduleDaysTable.schedule_id, schedule.id));

                return {
                    ...schedule,
                    days,
                };
            }),
        );

        return {
            schedules: schedulesWithDays,
        };
    } catch (error) {
        logError("Error fetching pickup location schedules", error, {
            action: "getPickupLocationSchedules",
            locationId,
        });
        return {
            schedules: [],
        };
    }
}
