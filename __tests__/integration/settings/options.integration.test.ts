import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    resetHouseholdCounter,
    resetLocationCounter,
} from "../../factories";
import { TEST_NOW, daysFromTestNow } from "../../test-time";
import { dietaryRestrictions, householdDietaryRestrictions, households } from "@/app/db/schema";
import { removeHousehold } from "@/app/utils/anonymization/anonymize-household";

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

vi.mock("@/app/utils/auth/server-action-auth", () => ({
    verifyServerActionAuth: vi.fn(async () => ({
        success: true,
        data: {
            user: {
                id: "test-admin-id",
                githubUsername: "test-admin",
            },
        },
    })),
    verifyHouseholdAccess: vi.fn(async (householdId: string) => ({
        success: true,
        data: {
            id: householdId,
            first_name: "Test",
            last_name: "User",
        },
    })),
}));

type OptionsActionsModule = typeof import("@/app/[locale]/settings/options/actions");

let listDietaryRestrictions: OptionsActionsModule["listDietaryRestrictions"];
let createDietaryRestriction: OptionsActionsModule["createDietaryRestriction"];
let deleteDietaryRestriction: OptionsActionsModule["deleteDietaryRestriction"];
let setDietaryRestrictionActiveStatus: OptionsActionsModule["setDietaryRestrictionActiveStatus"];

let optionCounter = 0;
function uniqueOptionName(prefix: string): string {
    optionCounter += 1;
    return `${prefix}-${optionCounter}`;
}

async function createRestrictionViaAction(
    name: string,
): Promise<typeof dietaryRestrictions.$inferSelect> {
    const result = await createDietaryRestriction({ name });
    if (!result.success) {
        throw new Error(`Failed creating test restriction: ${result.error.code}`);
    }

    const db = await getTestDb();
    const [option] = await db
        .select()
        .from(dietaryRestrictions)
        .where(eq(dietaryRestrictions.id, result.data.id));

    if (!option) {
        throw new Error("Created option not found in database");
    }

    return option;
}

describe("Settings options actions - integration", () => {
    beforeAll(async () => {
        const actions = await import("@/app/[locale]/settings/options/actions");
        listDietaryRestrictions = actions.listDietaryRestrictions;
        createDietaryRestriction = actions.createDietaryRestriction;
        deleteDietaryRestriction = actions.deleteDietaryRestriction;
        setDietaryRestrictionActiveStatus = actions.setDietaryRestrictionActiveStatus;
    });

    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
    });

    it("validates empty names when creating options", async () => {
        const result = await createDietaryRestriction({ name: "   " });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
    });

    it("trims names before persisting new options", async () => {
        const rawName = `  ${uniqueOptionName("trim-check")}  `;

        const created = await createDietaryRestriction({ name: rawName });
        expect(created.success).toBe(true);

        if (created.success) {
            const db = await getTestDb();
            const [saved] = await db
                .select()
                .from(dietaryRestrictions)
                .where(eq(dietaryRestrictions.id, created.data.id));

            expect(saved?.name).toBe(rawName.trim());
        }
    });

    it("rejects duplicate option names", async () => {
        const name = uniqueOptionName("duplicate-check");
        await createRestrictionViaAction(name);

        const duplicate = await createDietaryRestriction({ name });
        expect(duplicate.success).toBe(false);

        if (!duplicate.success) {
            expect(duplicate.error.code).toBe("DUPLICATE_NAME");
        }
    });

    it("shows linked active households and excludes anonymized households", async () => {
        const db = await getTestDb();
        const option = await createRestrictionViaAction(uniqueOptionName("linked-households"));
        const activeHousehold = await createTestHousehold({
            first_name: "Active",
            last_name: "Household",
        });
        const anonymizedHousehold = await createTestHousehold({
            first_name: "Anon",
            last_name: "Household",
        });

        await db.insert(householdDietaryRestrictions).values([
            {
                household_id: activeHousehold.id,
                dietary_restriction_id: option.id,
            },
            {
                household_id: anonymizedHousehold.id,
                dietary_restriction_id: option.id,
            },
        ]);

        await db
            .update(households)
            .set({
                anonymized_at: TEST_NOW,
                anonymized_by: "test-admin",
            })
            .where(eq(households.id, anonymizedHousehold.id));

        const listed = await listDietaryRestrictions();
        expect(listed.success).toBe(true);

        if (listed.success) {
            const listedOption = listed.data.find(item => item.id === option.id);
            expect(listedOption).toBeDefined();
            expect(listedOption?.usageCount).toBe(1);
            expect(listedOption?.linkedHouseholds).toHaveLength(1);
            expect(listedOption?.linkedHouseholds[0].id).toBe(activeHousehold.id);
            expect(listedOption?.linkedHouseholds[0].name).toBe("Active Household");
        }
    });

    it("blocks delete when an active household still uses the option", async () => {
        const db = await getTestDb();
        const option = await createRestrictionViaAction(uniqueOptionName("in-use"));
        const household = await createTestHousehold();

        await db.insert(householdDietaryRestrictions).values({
            household_id: household.id,
            dietary_restriction_id: option.id,
        });

        const deleted = await deleteDietaryRestriction(option.id);
        expect(deleted.success).toBe(false);

        if (!deleted.success) {
            expect(deleted.error.code).toBe("OPTION_IN_USE");
        }
    });

    it("allows pruning options linked only to anonymized households", async () => {
        const db = await getTestDb();
        const option = await createRestrictionViaAction(uniqueOptionName("anonymized-only"));
        const household = await createTestHousehold();
        const { location } = await createTestLocationWithSchedule();

        await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: daysFromTestNow(-2),
            pickup_date_time_latest: new Date(daysFromTestNow(-2).getTime() + 30 * 60 * 1000),
        });

        await db.insert(householdDietaryRestrictions).values({
            household_id: household.id,
            dietary_restriction_id: option.id,
        });

        const removal = await removeHousehold(household.id, "test-admin");
        expect(removal.method).toBe("anonymized");

        const deleted = await deleteDietaryRestriction(option.id);
        expect(deleted.success).toBe(true);

        const [stillThere] = await db
            .select()
            .from(dietaryRestrictions)
            .where(eq(dietaryRestrictions.id, option.id));
        expect(stillThere).toBeUndefined();
    });

    it("toggles active state and writes deactivation metadata", async () => {
        const db = await getTestDb();
        const option = await createRestrictionViaAction(uniqueOptionName("toggle"));

        const disabled = await setDietaryRestrictionActiveStatus(option.id, false);
        expect(disabled.success).toBe(true);

        const [disabledRow] = await db
            .select()
            .from(dietaryRestrictions)
            .where(eq(dietaryRestrictions.id, option.id));
        expect(disabledRow?.is_active).toBe(false);
        expect(disabledRow?.deactivated_by).toBe("test-admin");
        expect(disabledRow?.deactivated_at).toBeInstanceOf(Date);

        const reenabled = await setDietaryRestrictionActiveStatus(option.id, true);
        expect(reenabled.success).toBe(true);

        const [reenabledRow] = await db
            .select()
            .from(dietaryRestrictions)
            .where(eq(dietaryRestrictions.id, option.id));
        expect(reenabledRow?.is_active).toBe(true);
        expect(reenabledRow?.deactivated_by).toBeNull();
        expect(reenabledRow?.deactivated_at).toBeNull();
    });
});
