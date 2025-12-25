import { getTestDb } from "../db/test-db";
import { households, householdMembers, pets, householdDietaryRestrictions } from "@/app/db/schema";

let householdCounter = 0;

/**
 * Reset the household counter. Call this in beforeEach if needed.
 */
export function resetHouseholdCounter() {
    householdCounter = 0;
}

/**
 * Create a test household with default values.
 * Phone numbers are auto-generated to be unique.
 */
export async function createTestHousehold(
    overrides: Partial<typeof households.$inferInsert> = {},
) {
    const db = await getTestDb();
    householdCounter++;

    const defaults: typeof households.$inferInsert = {
        first_name: `Test${householdCounter}`,
        last_name: `User${householdCounter}`,
        phone_number: `+4670000${String(householdCounter).padStart(4, "0")}`,
        locale: "sv",
        postal_code: "72345",
    };

    const [household] = await db
        .insert(households)
        .values({ ...defaults, ...overrides })
        .returning();

    return household;
}

/**
 * Create a household with members.
 */
export async function createTestHouseholdWithMembers(
    householdOverrides: Partial<typeof households.$inferInsert> = {},
    members: Array<{ age: number; sex: "male" | "female" | "other" }> = [],
) {
    const household = await createTestHousehold(householdOverrides);
    const db = await getTestDb();

    if (members.length > 0) {
        await db.insert(householdMembers).values(
            members.map(m => ({
                household_id: household.id,
                age: m.age,
                sex: m.sex,
            })),
        );
    }

    return household;
}

/**
 * Create a household with pets.
 * Requires pet species to exist (seeded by migrations).
 */
export async function createTestHouseholdWithPets(
    householdOverrides: Partial<typeof households.$inferInsert> = {},
    petSpeciesIds: string[] = [],
) {
    const household = await createTestHousehold(householdOverrides);
    const db = await getTestDb();

    if (petSpeciesIds.length > 0) {
        await db.insert(pets).values(
            petSpeciesIds.map(speciesId => ({
                household_id: household.id,
                pet_species_id: speciesId,
            })),
        );
    }

    return household;
}

/**
 * Create a household with dietary restrictions.
 * Requires dietary restrictions to exist (seeded by migrations).
 */
export async function createTestHouseholdWithDietaryRestrictions(
    householdOverrides: Partial<typeof households.$inferInsert> = {},
    dietaryRestrictionIds: string[] = [],
) {
    const household = await createTestHousehold(householdOverrides);
    const db = await getTestDb();

    if (dietaryRestrictionIds.length > 0) {
        await db.insert(householdDietaryRestrictions).values(
            dietaryRestrictionIds.map(restrictionId => ({
                household_id: household.id,
                dietary_restriction_id: restrictionId,
            })),
        );
    }

    return household;
}
