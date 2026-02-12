import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    resetHouseholdCounter,
    resetLocationCounter,
} from "../../factories";
import { daysFromTestNow } from "../../test-time";
import {
    additionalNeeds,
    dietaryRestrictions,
    householdAdditionalNeeds,
    householdDietaryRestrictions,
    households,
    pets,
    petSpecies,
} from "@/app/db/schema";
import { removeHousehold } from "@/app/utils/anonymization/anonymize-household";

let optionCounter = 0;
function uniqueName(prefix: string): string {
    optionCounter += 1;
    return `${prefix}-${optionCounter}`;
}

describe("anonymize household option unlink - integration", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
    });

    it("removes option links during anonymization so options can be pruned", async () => {
        const db = await getTestDb();
        const household = await createTestHousehold();
        const { location } = await createTestLocationWithSchedule();

        await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: daysFromTestNow(-3),
            pickup_date_time_latest: new Date(daysFromTestNow(-3).getTime() + 30 * 60 * 1000),
        });

        const [restriction] = await db
            .insert(dietaryRestrictions)
            .values({ name: uniqueName("anonymize-diet") })
            .returning();
        const [need] = await db
            .insert(additionalNeeds)
            .values({ need: uniqueName("anonymize-need") })
            .returning();
        const [petType] = await db
            .insert(petSpecies)
            .values({ name: uniqueName("anonymize-pet") })
            .returning();

        await db.insert(householdDietaryRestrictions).values({
            household_id: household.id,
            dietary_restriction_id: restriction.id,
        });
        await db.insert(householdAdditionalNeeds).values({
            household_id: household.id,
            additional_need_id: need.id,
        });
        await db.insert(pets).values({
            household_id: household.id,
            pet_species_id: petType.id,
        });

        const result = await removeHousehold(household.id, "test-admin");
        expect(result.method).toBe("anonymized");

        const remainingDietLinks = await db
            .select()
            .from(householdDietaryRestrictions)
            .where(eq(householdDietaryRestrictions.household_id, household.id));
        const remainingNeedLinks = await db
            .select()
            .from(householdAdditionalNeeds)
            .where(eq(householdAdditionalNeeds.household_id, household.id));
        const remainingPets = await db
            .select()
            .from(pets)
            .where(eq(pets.household_id, household.id));

        expect(remainingDietLinks).toHaveLength(0);
        expect(remainingNeedLinks).toHaveLength(0);
        expect(remainingPets).toHaveLength(0);

        const [anonymizedHousehold] = await db
            .select()
            .from(households)
            .where(eq(households.id, household.id));
        expect(anonymizedHousehold).toBeDefined();
        expect(anonymizedHousehold?.anonymized_at).toBeInstanceOf(Date);

        const [deletedRestriction] = await db
            .delete(dietaryRestrictions)
            .where(eq(dietaryRestrictions.id, restriction.id))
            .returning({ id: dietaryRestrictions.id });
        const [deletedNeed] = await db
            .delete(additionalNeeds)
            .where(eq(additionalNeeds.id, need.id))
            .returning({ id: additionalNeeds.id });
        const [deletedPetType] = await db
            .delete(petSpecies)
            .where(eq(petSpecies.id, petType.id))
            .returning({ id: petSpecies.id });

        expect(deletedRestriction?.id).toBe(restriction.id);
        expect(deletedNeed?.id).toBe(need.id);
        expect(deletedPetType?.id).toBe(petType.id);
    });
});
