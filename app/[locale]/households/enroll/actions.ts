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
    users,
} from "@/app/db/schema";
import { eq, and, sql, gte, lte, count, inArray, asc, desc, isNull, or } from "drizzle-orm";
import { notDeleted } from "@/app/db/query-helpers";
import { getStockholmDayUtcRange, getStockholmDateKey } from "@/app/utils/date-utils";
import { protectedAdminAction, protectedReadAction } from "@/app/utils/auth/protected-action";
import { ParcelValidationError } from "@/app/utils/errors/validation-errors";
import {
    success,
    failure,
    validationFailure,
    type ActionResult,
} from "@/app/utils/auth/action-result";
import { logger, logError } from "@/app/utils/logger";
import { formatUserDisplayName } from "@/app/utils/format-user-display-name";
import { normalizePhoneToE164, validatePhoneInput } from "@/app/utils/validation/phone-validation";
import { createSmsRecord } from "@/app/utils/sms/sms-service";
import { formatEnrolmentSms } from "@/app/utils/sms/templates";
import { recomputeOutsideHoursCountForLocation } from "@/app/utils/schedule/outside-hours-count";
import { validateParcelAssignmentsForForm } from "@/app/utils/validation/parcel-assignment";
import type { SupportedLocale } from "@/app/utils/locale-detection";
import { normalizePersonName } from "@/app/utils/person-name";

import {
    HouseholdCreateData,
    FoodParcelCreateData,
    HouseholdMemberData,
    DietaryRestrictionData,
    AdditionalNeedData,
    ResponsibleStaffOption,
} from "./types";
import { OptionNotAvailableError, ensurePickupLocationExists } from "@/app/db/validation-helpers";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function dedupeIds(ids: string[]): string[] {
    return [...new Set(ids.filter(Boolean))];
}

function nameValidationMessage(
    field: "firstName" | "lastName",
    reason: "empty" | "invalid_characters",
) {
    if (reason === "invalid_characters") {
        return field === "firstName"
            ? "validation.firstNameInvalidCharacters"
            : "validation.lastNameInvalidCharacters";
    }

    return field === "firstName" ? "validation.firstNameLength" : "validation.lastNameLength";
}

async function ensureResponsibleUserIsAssignable(
    tx: DbTransaction,
    responsibleUserId: string,
    currentResponsibleUserId?: string | null,
) {
    const [user] = await tx
        .select({
            id: users.id,
            deactivatedAt: users.deactivated_at,
        })
        .from(users)
        .where(eq(users.id, responsibleUserId))
        .limit(1);

    if (!user) {
        throw new OptionNotAvailableError();
    }

    const isCurrentFormerUser =
        user.deactivatedAt !== null && currentResponsibleUserId === responsibleUserId;

    if (user.deactivatedAt !== null && !isCurrentFormerUser) {
        throw new OptionNotAvailableError();
    }
}

async function getCurrentStaffUserId(
    tx: DbTransaction | typeof db,
    githubUsername: string | null | undefined,
) {
    if (!githubUsername) return null;

    const [currentUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.github_username, githubUsername))
        .limit(1);

    return currentUser?.id ?? null;
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

export const enrollHousehold = protectedAdminAction(
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

            if (!data.smsConsent) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: "validation.smsConsentRequired",
                    field: "sms_consent",
                });
            }

            const firstName = normalizePersonName(data.headOfHousehold.firstName);
            if (!firstName.success || firstName.value.length < 2) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: nameValidationMessage(
                        "firstName",
                        firstName.success ? "empty" : firstName.reason,
                    ),
                    field: "first_name",
                });
            }

            const lastName = normalizePersonName(data.headOfHousehold.lastName);
            if (!lastName.success || lastName.value.length < 2) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: nameValidationMessage(
                        "lastName",
                        lastName.success ? "empty" : lastName.reason,
                    ),
                    field: "last_name",
                });
            }

            // Store locationId for recompute after transaction
            const locationId = data.foodParcels?.pickupLocationId;

            // Normalize empty string to null (Mantine Select uses "" for no selection)
            const primaryLocationId = data.primaryPickupLocationId || null;
            const fallbackResponsibleUserId = await getCurrentStaffUserId(
                db,
                session.user?.githubUsername,
            );
            const responsibleUserId = data.responsibleUserId || fallbackResponsibleUserId;

            if (!responsibleUserId) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: "validation.responsibleStaffRequired",
                });
            }

            // Use a transaction to ensure all operations succeed or fail together
            const result = await db.transaction(async tx => {
                // 0. Validate primary pickup location exists (if provided)
                if (primaryLocationId) {
                    await ensurePickupLocationExists(tx, primaryLocationId);
                }

                await ensureResponsibleUserIsAssignable(tx, responsibleUserId);

                // 1. Create household
                const [household] = await tx
                    .insert(households)
                    .values({
                        first_name: firstName.value,
                        last_name: lastName.value,
                        phone_number: normalizePhoneToE164(data.headOfHousehold.phoneNumber),
                        locale: data.headOfHousehold.locale || "sv",
                        created_by: session.user?.githubUsername ?? null,
                        primary_pickup_location_id: primaryLocationId,
                        responsible_user_id: responsibleUserId,
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
                    const parcelLocationId = (parcel: FoodParcelCreateData) =>
                        parcel.pickupLocationId || data.foodParcels.pickupLocationId;

                    const parcelsToValidate = data.foodParcels.parcels.map(parcel => ({
                        householdId: household.id,
                        locationId: parcelLocationId(parcel),
                        pickupDate: new Date(parcel.pickupEarliestTime.toDateString()), // Date only
                        pickupStartTime: parcel.pickupEarliestTime,
                        pickupEndTime: parcel.pickupLatestTime,
                    }));

                    const validationResult = await validateParcelAssignmentsForForm(
                        parcelsToValidate,
                        tx,
                    );

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
                            pickup_location_id: parcelLocationId(parcel),
                            pickup_date_time_earliest: parcel.pickupEarliestTime,
                            pickup_date_time_latest: parcel.pickupLatestTime,
                            is_picked_up: false,
                        }),
                    );

                    // Route through the parcel state-transitions helper so all
                    // mutations of food_parcels go through one place. The helper
                    // delegates to insertParcels for the partial-unique-index
                    // conflict handling.
                    const { createParcels } = await import("@/app/utils/parcels/state-transitions");
                    await createParcels(tx, { parcels: parcelsToInsert, session });
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
                    await recomputeOutsideHoursCountForLocation(locationId);
                } catch (e) {
                    logError("Failed to recompute outside-hours count after enrollment", e, {
                        locationId,
                        action: "enrollHousehold",
                    });
                    // Non-fatal: The count will be corrected by the next schedule operation
                }
            }

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
async function fetchDietaryRestrictions() {
    try {
        return await db
            .select({
                id: dietaryRestrictionsTable.id,
                name: dietaryRestrictionsTable.name,
                color: dietaryRestrictionsTable.color,
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

export const getDietaryRestrictions = protectedReadAction(async () => fetchDietaryRestrictions());

// Helper function to get all additional needs
async function fetchAdditionalNeeds() {
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

export const getAdditionalNeeds = protectedReadAction(async () => fetchAdditionalNeeds());

// Helper function to get all pickup locations
async function fetchPickupLocations() {
    try {
        return await db.select().from(pickupLocationsTable);
    } catch (error) {
        logError("Error fetching pickup locations", error, {
            action: "getPickupLocations",
        });
        return [];
    }
}

export const getPickupLocations = protectedReadAction(async () => fetchPickupLocations());

export const getResponsibleStaffOptions = protectedReadAction(
    async (
        _session,
        currentResponsibleUserId?: string | null,
    ): Promise<ResponsibleStaffOption[]> => {
        try {
            const conditions = [isNull(users.deactivated_at)];
            if (currentResponsibleUserId) {
                conditions.push(eq(users.id, currentResponsibleUserId));
            }

            const rows = await db
                .select({
                    id: users.id,
                    github_username: users.github_username,
                    display_name: users.display_name,
                    first_name: users.first_name,
                    last_name: users.last_name,
                    deactivated_at: users.deactivated_at,
                })
                .from(users)
                .where(or(...conditions))
                .orderBy(users.first_name, users.last_name, users.github_username);

            return rows.map(user => ({
                id: user.id,
                displayName:
                    formatUserDisplayName(
                        {
                            first_name: user.first_name,
                            last_name: user.last_name,
                            display_name: user.display_name,
                        },
                        user.github_username,
                    ) ?? user.github_username,
                githubUsername: user.github_username,
                isFormer: user.deactivated_at !== null,
            }));
        } catch (error) {
            logError("Error fetching responsible staff options", error, {
                action: "getResponsibleStaffOptions",
                currentResponsibleUserId,
            });
            return [];
        }
    },
);

/**
 * Fetches all available pet species from the database
 * @returns Array of pet species
 */
async function fetchPetSpecies() {
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

export const getPetSpecies = protectedReadAction(async () => fetchPetSpecies());

/**
 * Check if a pickup location has reached its maximum capacity for a specific date
 * @param locationId Pickup location ID
 * @param date Date to check
 * @param excludeHouseholdId Optional household ID to exclude from the count
 * @returns Object containing isAvailable and info about capacity
 */
async function fetchPickupLocationCapacity(
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

export const checkPickupLocationCapacity = protectedReadAction(
    async (_session, locationId: string, date: Date, excludeHouseholdId?: string) =>
        fetchPickupLocationCapacity(locationId, date, excludeHouseholdId),
);

/**
 * Get capacity data for a range of dates in a single query
 * @param locationId Pickup location ID
 * @param startDate Start date of the range
 * @param endDate End date of the range
 * @returns Object containing capacity data for the range
 */
async function fetchPickupLocationCapacityForRange(
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

export const getPickupLocationCapacityForRange = protectedReadAction(
    async (_session, locationId: string, startDate: Date, endDate: Date) =>
        fetchPickupLocationCapacityForRange(locationId, startDate, endDate),
);

/**
 * Get active and upcoming schedules for a pickup location
 * @param locationId Pickup location ID
 * @returns Array of schedules with their opening days
 */
async function fetchPickupLocationSchedules(locationId: string) {
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

export const getPickupLocationSchedules = protectedReadAction(
    async (_session, locationId: string) => fetchPickupLocationSchedules(locationId),
);
