"use server";

import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import { db } from "@/app/db/drizzle";
import {
    dietaryRestrictions,
    householdDietaryRestrictions,
    petSpecies,
    pets,
    additionalNeeds,
    householdAdditionalNeeds,
    households,
    nanoid,
} from "@/app/db/schema";
import { eq, asc, and, isNull, isNotNull, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { routing } from "@/app/i18n/routing";
import { logError } from "@/app/utils/logger";

/**
 * Revalidates the settings/options page for all supported locales.
 */
function revalidateOptionsPage() {
    routing.locales.forEach(locale => {
        revalidatePath(`/${locale}/settings/options`, "page");
    });
}

// ============================================================================
// Types
// ============================================================================

interface LinkedHousehold {
    id: string;
    name: string;
}

export interface OptionWithUsage {
    id: string;
    name: string;
    color: string | null;
    isActive: boolean;
    usageCount: number;
    linkedHouseholds: LinkedHousehold[];
}

export interface CreateOptionData {
    name: string;
    color?: string | null;
}

export interface UpdateOptionData {
    name: string;
    color?: string | null;
}

interface OptionRow {
    id: string;
    name: string;
    color: string | null;
    isActive: boolean;
}

interface OptionLinkRow {
    optionId: string;
    householdId: string;
    firstName: string;
    lastName: string;
}

function toOptionWithUsage(options: OptionRow[], links: OptionLinkRow[]): OptionWithUsage[] {
    const linksByOptionId = new Map<string, Map<string, LinkedHousehold>>();

    for (const link of links) {
        const optionLinks =
            linksByOptionId.get(link.optionId) ?? new Map<string, LinkedHousehold>();

        if (!optionLinks.has(link.householdId)) {
            optionLinks.set(link.householdId, {
                id: link.householdId,
                name: `${link.firstName} ${link.lastName}`.trim(),
            });
        }

        linksByOptionId.set(link.optionId, optionLinks);
    }

    return options.map(option => {
        const linkedHouseholds = Array.from(linksByOptionId.get(option.id)?.values() ?? []).sort(
            (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        );

        return {
            ...option,
            usageCount: linkedHouseholds.length,
            linkedHouseholds,
        };
    });
}

async function getAnonymizedHouseholdIds(): Promise<string[]> {
    const rows = await db
        .select({ id: households.id })
        .from(households)
        .where(isNotNull(households.anonymized_at));

    return rows.map(row => row.id);
}

async function listDietaryRestrictionsWithUsage(): Promise<OptionWithUsage[]> {
    const options = await db
        .select({
            id: dietaryRestrictions.id,
            name: dietaryRestrictions.name,
            color: dietaryRestrictions.color,
            isActive: dietaryRestrictions.is_active,
        })
        .from(dietaryRestrictions)
        .orderBy(asc(dietaryRestrictions.name));

    const links = await db
        .select({
            optionId: householdDietaryRestrictions.dietary_restriction_id,
            householdId: households.id,
            firstName: households.first_name,
            lastName: households.last_name,
        })
        .from(householdDietaryRestrictions)
        .innerJoin(households, eq(householdDietaryRestrictions.household_id, households.id))
        .where(isNull(households.anonymized_at));

    return toOptionWithUsage(options, links);
}

async function listPetSpeciesWithUsage(): Promise<OptionWithUsage[]> {
    const options = await db
        .select({
            id: petSpecies.id,
            name: petSpecies.name,
            color: petSpecies.color,
            isActive: petSpecies.is_active,
        })
        .from(petSpecies)
        .orderBy(asc(petSpecies.name));

    const links = await db
        .select({
            optionId: pets.pet_species_id,
            householdId: households.id,
            firstName: households.first_name,
            lastName: households.last_name,
        })
        .from(pets)
        .innerJoin(households, eq(pets.household_id, households.id))
        .where(isNull(households.anonymized_at));

    return toOptionWithUsage(options, links);
}

async function listAdditionalNeedsWithUsage(): Promise<OptionWithUsage[]> {
    const options = await db
        .select({
            id: additionalNeeds.id,
            name: additionalNeeds.need,
            color: additionalNeeds.color,
            isActive: additionalNeeds.is_active,
        })
        .from(additionalNeeds)
        .orderBy(asc(additionalNeeds.need));

    const links = await db
        .select({
            optionId: householdAdditionalNeeds.additional_need_id,
            householdId: households.id,
            firstName: households.first_name,
            lastName: households.last_name,
        })
        .from(householdAdditionalNeeds)
        .innerJoin(households, eq(householdAdditionalNeeds.household_id, households.id))
        .where(isNull(households.anonymized_at));

    return toOptionWithUsage(options, links);
}

// ============================================================================
// Dietary Restrictions
// ============================================================================

export const listDietaryRestrictions = protectedAction(
    async (): Promise<ActionResult<OptionWithUsage[]>> => {
        try {
            return success(await listDietaryRestrictionsWithUsage());
        } catch (error) {
            logError("Error fetching dietary restrictions", error);
            return failure({
                code: "FETCH_FAILED",
                message: "Failed to fetch dietary restrictions",
            });
        }
    },
);

export const createDietaryRestriction = protectedAction(
    async (session, data: CreateOptionData): Promise<ActionResult<OptionWithUsage>> => {
        try {
            if (!data.name?.trim()) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: "Name cannot be empty",
                });
            }

            const trimmedName = data.name.trim();

            const existing = await db
                .select()
                .from(dietaryRestrictions)
                .where(eq(dietaryRestrictions.name, trimmedName))
                .limit(1);

            if (existing.length > 0) {
                return failure({
                    code: "DUPLICATE_NAME",
                    message: "A dietary restriction with this name already exists",
                });
            }

            const [newRestriction] = await db
                .insert(dietaryRestrictions)
                .values({
                    id: nanoid(8),
                    name: trimmedName,
                    color: data.color ?? null,
                })
                .returning();

            revalidateOptionsPage();
            return success({
                id: newRestriction.id,
                name: newRestriction.name,
                color: newRestriction.color,
                isActive: newRestriction.is_active,
                usageCount: 0,
                linkedHouseholds: [],
            });
        } catch (error) {
            logError("Error creating dietary restriction", error);
            return failure({
                code: "CREATE_FAILED",
                message: "Failed to create dietary restriction",
            });
        }
    },
);

export const updateDietaryRestriction = protectedAction(
    async (session, id: string, data: UpdateOptionData): Promise<ActionResult<OptionWithUsage>> => {
        try {
            if (!data.name?.trim()) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: "Name cannot be empty",
                });
            }

            const trimmedName = data.name.trim();

            const existing = await db
                .select()
                .from(dietaryRestrictions)
                .where(eq(dietaryRestrictions.name, trimmedName))
                .limit(1);

            if (existing.length > 0 && existing[0].id !== id) {
                return failure({
                    code: "DUPLICATE_NAME",
                    message: "A dietary restriction with this name already exists",
                });
            }

            const [updated] = await db
                .update(dietaryRestrictions)
                .set({ name: trimmedName, color: data.color ?? null })
                .where(eq(dietaryRestrictions.id, id))
                .returning();

            if (!updated) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Dietary restriction not found",
                });
            }

            const options = await listDietaryRestrictionsWithUsage();
            const option = options.find(item => item.id === id);

            if (!option) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Dietary restriction not found",
                });
            }

            revalidateOptionsPage();
            return success(option);
        } catch (error) {
            logError("Error updating dietary restriction", error);
            return failure({
                code: "UPDATE_FAILED",
                message: "Failed to update dietary restriction",
            });
        }
    },
);

export const setDietaryRestrictionActiveStatus = protectedAction(
    async (session, id: string, isActive: boolean): Promise<ActionResult<OptionWithUsage>> => {
        try {
            const [updated] = await db
                .update(dietaryRestrictions)
                .set({
                    is_active: isActive,
                    deactivated_at: isActive ? null : new Date(),
                    deactivated_by: isActive ? null : (session.user?.githubUsername ?? null),
                })
                .where(eq(dietaryRestrictions.id, id))
                .returning();

            if (!updated) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Dietary restriction not found",
                });
            }

            const options = await listDietaryRestrictionsWithUsage();
            const option = options.find(item => item.id === id);

            if (!option) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Dietary restriction not found",
                });
            }

            revalidateOptionsPage();
            return success(option);
        } catch (error) {
            logError("Error updating dietary restriction status", error);
            return failure({
                code: "UPDATE_FAILED",
                message: "Failed to update dietary restriction status",
            });
        }
    },
);

export const deleteDietaryRestriction = protectedAction(
    async (session, id: string): Promise<ActionResult<void>> => {
        try {
            const options = await listDietaryRestrictionsWithUsage();
            const option = options.find(item => item.id === id);

            if (!option) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Dietary restriction not found",
                });
            }

            if (option.usageCount > 0) {
                return failure({
                    code: "OPTION_IN_USE",
                    message: "Cannot delete dietary restriction that is in use by households",
                });
            }

            const anonymizedHouseholdIds = await getAnonymizedHouseholdIds();
            if (anonymizedHouseholdIds.length > 0) {
                await db
                    .delete(householdDietaryRestrictions)
                    .where(
                        and(
                            eq(householdDietaryRestrictions.dietary_restriction_id, id),
                            inArray(
                                householdDietaryRestrictions.household_id,
                                anonymizedHouseholdIds,
                            ),
                        ),
                    );
            }

            await db.delete(dietaryRestrictions).where(eq(dietaryRestrictions.id, id));

            revalidateOptionsPage();
            return success(undefined);
        } catch (error: unknown) {
            if (error instanceof Error && "code" in error && error.code === "23503") {
                return failure({
                    code: "OPTION_IN_USE",
                    message: "Cannot delete dietary restriction that is in use by households",
                });
            }
            logError("Error deleting dietary restriction", error);
            return failure({
                code: "DELETE_FAILED",
                message: "Failed to delete dietary restriction",
            });
        }
    },
);

// ============================================================================
// Pet Species
// ============================================================================

export const listPetSpecies = protectedAction(
    async (): Promise<ActionResult<OptionWithUsage[]>> => {
        try {
            return success(await listPetSpeciesWithUsage());
        } catch (error) {
            logError("Error fetching pet species", error);
            return failure({
                code: "FETCH_FAILED",
                message: "Failed to fetch pet species",
            });
        }
    },
);

export const createPetSpecies = protectedAction(
    async (session, data: CreateOptionData): Promise<ActionResult<OptionWithUsage>> => {
        try {
            if (!data.name?.trim()) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: "Name cannot be empty",
                });
            }

            const trimmedName = data.name.trim();

            const existing = await db
                .select()
                .from(petSpecies)
                .where(eq(petSpecies.name, trimmedName))
                .limit(1);

            if (existing.length > 0) {
                return failure({
                    code: "DUPLICATE_NAME",
                    message: "A pet type with this name already exists",
                });
            }

            const [newSpecies] = await db
                .insert(petSpecies)
                .values({
                    id: nanoid(8),
                    name: trimmedName,
                    color: data.color ?? null,
                })
                .returning();

            revalidateOptionsPage();
            return success({
                id: newSpecies.id,
                name: newSpecies.name,
                color: newSpecies.color,
                isActive: newSpecies.is_active,
                usageCount: 0,
                linkedHouseholds: [],
            });
        } catch (error) {
            logError("Error creating pet species", error);
            return failure({
                code: "CREATE_FAILED",
                message: "Failed to create pet type",
            });
        }
    },
);

export const updatePetSpecies = protectedAction(
    async (session, id: string, data: UpdateOptionData): Promise<ActionResult<OptionWithUsage>> => {
        try {
            if (!data.name?.trim()) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: "Name cannot be empty",
                });
            }

            const trimmedName = data.name.trim();

            const existing = await db
                .select()
                .from(petSpecies)
                .where(eq(petSpecies.name, trimmedName))
                .limit(1);

            if (existing.length > 0 && existing[0].id !== id) {
                return failure({
                    code: "DUPLICATE_NAME",
                    message: "A pet type with this name already exists",
                });
            }

            const [updated] = await db
                .update(petSpecies)
                .set({ name: trimmedName, color: data.color ?? null })
                .where(eq(petSpecies.id, id))
                .returning();

            if (!updated) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Pet type not found",
                });
            }

            const options = await listPetSpeciesWithUsage();
            const option = options.find(item => item.id === id);

            if (!option) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Pet type not found",
                });
            }

            revalidateOptionsPage();
            return success(option);
        } catch (error) {
            logError("Error updating pet species", error);
            return failure({
                code: "UPDATE_FAILED",
                message: "Failed to update pet type",
            });
        }
    },
);

export const setPetSpeciesActiveStatus = protectedAction(
    async (session, id: string, isActive: boolean): Promise<ActionResult<OptionWithUsage>> => {
        try {
            const [updated] = await db
                .update(petSpecies)
                .set({
                    is_active: isActive,
                    deactivated_at: isActive ? null : new Date(),
                    deactivated_by: isActive ? null : (session.user?.githubUsername ?? null),
                })
                .where(eq(petSpecies.id, id))
                .returning();

            if (!updated) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Pet type not found",
                });
            }

            const options = await listPetSpeciesWithUsage();
            const option = options.find(item => item.id === id);

            if (!option) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Pet type not found",
                });
            }

            revalidateOptionsPage();
            return success(option);
        } catch (error) {
            logError("Error updating pet species status", error);
            return failure({
                code: "UPDATE_FAILED",
                message: "Failed to update pet type status",
            });
        }
    },
);

export const deletePetSpecies = protectedAction(
    async (session, id: string): Promise<ActionResult<void>> => {
        try {
            const options = await listPetSpeciesWithUsage();
            const option = options.find(item => item.id === id);

            if (!option) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Pet type not found",
                });
            }

            if (option.usageCount > 0) {
                return failure({
                    code: "OPTION_IN_USE",
                    message: "Cannot delete pet type that is in use by households",
                });
            }

            const anonymizedHouseholdIds = await getAnonymizedHouseholdIds();
            if (anonymizedHouseholdIds.length > 0) {
                await db
                    .delete(pets)
                    .where(
                        and(
                            eq(pets.pet_species_id, id),
                            inArray(pets.household_id, anonymizedHouseholdIds),
                        ),
                    );
            }

            await db.delete(petSpecies).where(eq(petSpecies.id, id));

            revalidateOptionsPage();
            return success(undefined);
        } catch (error: unknown) {
            if (error instanceof Error && "code" in error && error.code === "23503") {
                return failure({
                    code: "OPTION_IN_USE",
                    message: "Cannot delete pet type that is in use by households",
                });
            }
            logError("Error deleting pet species", error);
            return failure({
                code: "DELETE_FAILED",
                message: "Failed to delete pet type",
            });
        }
    },
);

// ============================================================================
// Additional Needs
// ============================================================================

export const listAdditionalNeeds = protectedAction(
    async (): Promise<ActionResult<OptionWithUsage[]>> => {
        try {
            return success(await listAdditionalNeedsWithUsage());
        } catch (error) {
            logError("Error fetching additional needs", error);
            return failure({
                code: "FETCH_FAILED",
                message: "Failed to fetch additional needs",
            });
        }
    },
);

export const createAdditionalNeed = protectedAction(
    async (session, data: CreateOptionData): Promise<ActionResult<OptionWithUsage>> => {
        try {
            if (!data.name?.trim()) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: "Name cannot be empty",
                });
            }

            const trimmedName = data.name.trim();

            const existing = await db
                .select()
                .from(additionalNeeds)
                .where(eq(additionalNeeds.need, trimmedName))
                .limit(1);

            if (existing.length > 0) {
                return failure({
                    code: "DUPLICATE_NAME",
                    message: "An additional need with this name already exists",
                });
            }

            const [newNeed] = await db
                .insert(additionalNeeds)
                .values({
                    id: nanoid(8),
                    need: trimmedName,
                    color: data.color ?? null,
                })
                .returning();

            revalidateOptionsPage();
            return success({
                id: newNeed.id,
                name: newNeed.need,
                color: newNeed.color,
                isActive: newNeed.is_active,
                usageCount: 0,
                linkedHouseholds: [],
            });
        } catch (error) {
            logError("Error creating additional need", error);
            return failure({
                code: "CREATE_FAILED",
                message: "Failed to create additional need",
            });
        }
    },
);

export const updateAdditionalNeed = protectedAction(
    async (session, id: string, data: UpdateOptionData): Promise<ActionResult<OptionWithUsage>> => {
        try {
            if (!data.name?.trim()) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: "Name cannot be empty",
                });
            }

            const trimmedName = data.name.trim();

            const existing = await db
                .select()
                .from(additionalNeeds)
                .where(eq(additionalNeeds.need, trimmedName))
                .limit(1);

            if (existing.length > 0 && existing[0].id !== id) {
                return failure({
                    code: "DUPLICATE_NAME",
                    message: "An additional need with this name already exists",
                });
            }

            const [updated] = await db
                .update(additionalNeeds)
                .set({ need: trimmedName, color: data.color ?? null })
                .where(eq(additionalNeeds.id, id))
                .returning();

            if (!updated) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Additional need not found",
                });
            }

            const options = await listAdditionalNeedsWithUsage();
            const option = options.find(item => item.id === id);

            if (!option) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Additional need not found",
                });
            }

            revalidateOptionsPage();
            return success(option);
        } catch (error) {
            logError("Error updating additional need", error);
            return failure({
                code: "UPDATE_FAILED",
                message: "Failed to update additional need",
            });
        }
    },
);

export const setAdditionalNeedActiveStatus = protectedAction(
    async (session, id: string, isActive: boolean): Promise<ActionResult<OptionWithUsage>> => {
        try {
            const [updated] = await db
                .update(additionalNeeds)
                .set({
                    is_active: isActive,
                    deactivated_at: isActive ? null : new Date(),
                    deactivated_by: isActive ? null : (session.user?.githubUsername ?? null),
                })
                .where(eq(additionalNeeds.id, id))
                .returning();

            if (!updated) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Additional need not found",
                });
            }

            const options = await listAdditionalNeedsWithUsage();
            const option = options.find(item => item.id === id);

            if (!option) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Additional need not found",
                });
            }

            revalidateOptionsPage();
            return success(option);
        } catch (error) {
            logError("Error updating additional need status", error);
            return failure({
                code: "UPDATE_FAILED",
                message: "Failed to update additional need status",
            });
        }
    },
);

export const deleteAdditionalNeed = protectedAction(
    async (session, id: string): Promise<ActionResult<void>> => {
        try {
            const options = await listAdditionalNeedsWithUsage();
            const option = options.find(item => item.id === id);

            if (!option) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Additional need not found",
                });
            }

            if (option.usageCount > 0) {
                return failure({
                    code: "OPTION_IN_USE",
                    message: "Cannot delete additional need that is in use by households",
                });
            }

            const anonymizedHouseholdIds = await getAnonymizedHouseholdIds();
            if (anonymizedHouseholdIds.length > 0) {
                await db
                    .delete(householdAdditionalNeeds)
                    .where(
                        and(
                            eq(householdAdditionalNeeds.additional_need_id, id),
                            inArray(householdAdditionalNeeds.household_id, anonymizedHouseholdIds),
                        ),
                    );
            }

            await db.delete(additionalNeeds).where(eq(additionalNeeds.id, id));

            revalidateOptionsPage();
            return success(undefined);
        } catch (error: unknown) {
            if (error instanceof Error && "code" in error && error.code === "23503") {
                return failure({
                    code: "OPTION_IN_USE",
                    message: "Cannot delete additional need that is in use by households",
                });
            }
            logError("Error deleting additional need", error);
            return failure({
                code: "DELETE_FAILED",
                message: "Failed to delete additional need",
            });
        }
    },
);
