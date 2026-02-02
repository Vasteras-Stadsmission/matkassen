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
    nanoid,
} from "@/app/db/schema";
import { eq, asc, sql } from "drizzle-orm";
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

export interface OptionWithUsage {
    id: string;
    name: string;
    usageCount: number;
}

export interface CreateOptionData {
    name: string;
}

export interface UpdateOptionData {
    name: string;
}

// ============================================================================
// Dietary Restrictions
// ============================================================================

export const listDietaryRestrictions = protectedAction(
    async (): Promise<ActionResult<OptionWithUsage[]>> => {
        try {
            const restrictions = await db
                .select({
                    id: dietaryRestrictions.id,
                    name: dietaryRestrictions.name,
                    usageCount: sql<number>`count(${householdDietaryRestrictions.household_id})::int`,
                })
                .from(dietaryRestrictions)
                .leftJoin(
                    householdDietaryRestrictions,
                    eq(dietaryRestrictions.id, householdDietaryRestrictions.dietary_restriction_id),
                )
                .groupBy(dietaryRestrictions.id, dietaryRestrictions.name)
                .orderBy(asc(dietaryRestrictions.name));

            return success(restrictions);
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

            // Check for duplicate name
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
                })
                .returning();

            revalidateOptionsPage();
            return success({ ...newRestriction, usageCount: 0 });
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

            // Check for duplicate name (excluding current item)
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
                .set({ name: trimmedName })
                .where(eq(dietaryRestrictions.id, id))
                .returning();

            if (!updated) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Dietary restriction not found",
                });
            }

            // Get usage count
            const [usage] = await db
                .select({
                    count: sql<number>`count(*)::int`,
                })
                .from(householdDietaryRestrictions)
                .where(eq(householdDietaryRestrictions.dietary_restriction_id, id));

            revalidateOptionsPage();
            return success({ ...updated, usageCount: usage?.count ?? 0 });
        } catch (error) {
            logError("Error updating dietary restriction", error);
            return failure({
                code: "UPDATE_FAILED",
                message: "Failed to update dietary restriction",
            });
        }
    },
);

export const deleteDietaryRestriction = protectedAction(
    async (session, id: string): Promise<ActionResult<void>> => {
        try {
            await db.delete(dietaryRestrictions).where(eq(dietaryRestrictions.id, id));

            revalidateOptionsPage();
            return success(undefined);
        } catch (error: unknown) {
            // PostgreSQL foreign key violation
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
            const species = await db
                .select({
                    id: petSpecies.id,
                    name: petSpecies.name,
                    usageCount: sql<number>`count(distinct ${pets.household_id})::int`,
                })
                .from(petSpecies)
                .leftJoin(pets, eq(petSpecies.id, pets.pet_species_id))
                .groupBy(petSpecies.id, petSpecies.name)
                .orderBy(asc(petSpecies.name));

            return success(species);
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

            // Check for duplicate name
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
                })
                .returning();

            revalidateOptionsPage();
            return success({ ...newSpecies, usageCount: 0 });
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

            // Check for duplicate name (excluding current item)
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
                .set({ name: trimmedName })
                .where(eq(petSpecies.id, id))
                .returning();

            if (!updated) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Pet type not found",
                });
            }

            // Get usage count
            const [usage] = await db
                .select({
                    count: sql<number>`count(*)::int`,
                })
                .from(pets)
                .where(eq(pets.pet_species_id, id));

            revalidateOptionsPage();
            return success({ ...updated, usageCount: usage?.count ?? 0 });
        } catch (error) {
            logError("Error updating pet species", error);
            return failure({
                code: "UPDATE_FAILED",
                message: "Failed to update pet type",
            });
        }
    },
);

export const deletePetSpecies = protectedAction(
    async (session, id: string): Promise<ActionResult<void>> => {
        try {
            await db.delete(petSpecies).where(eq(petSpecies.id, id));

            revalidateOptionsPage();
            return success(undefined);
        } catch (error: unknown) {
            // PostgreSQL foreign key violation
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
            const needs = await db
                .select({
                    id: additionalNeeds.id,
                    name: additionalNeeds.need,
                    usageCount: sql<number>`count(${householdAdditionalNeeds.household_id})::int`,
                })
                .from(additionalNeeds)
                .leftJoin(
                    householdAdditionalNeeds,
                    eq(additionalNeeds.id, householdAdditionalNeeds.additional_need_id),
                )
                .groupBy(additionalNeeds.id, additionalNeeds.need)
                .orderBy(asc(additionalNeeds.need));

            return success(needs);
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

            // Check for duplicate name
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
                })
                .returning();

            revalidateOptionsPage();
            return success({ id: newNeed.id, name: newNeed.need, usageCount: 0 });
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

            // Check for duplicate name (excluding current item)
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
                .set({ need: trimmedName })
                .where(eq(additionalNeeds.id, id))
                .returning();

            if (!updated) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Additional need not found",
                });
            }

            // Get usage count
            const [usage] = await db
                .select({
                    count: sql<number>`count(*)::int`,
                })
                .from(householdAdditionalNeeds)
                .where(eq(householdAdditionalNeeds.additional_need_id, id));

            revalidateOptionsPage();
            return success({ id: updated.id, name: updated.need, usageCount: usage?.count ?? 0 });
        } catch (error) {
            logError("Error updating additional need", error);
            return failure({
                code: "UPDATE_FAILED",
                message: "Failed to update additional need",
            });
        }
    },
);

export const deleteAdditionalNeed = protectedAction(
    async (session, id: string): Promise<ActionResult<void>> => {
        try {
            await db.delete(additionalNeeds).where(eq(additionalNeeds.id, id));

            revalidateOptionsPage();
            return success(undefined);
        } catch (error: unknown) {
            // PostgreSQL foreign key violation
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
