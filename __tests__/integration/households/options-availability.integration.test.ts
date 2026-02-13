import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    resetHouseholdCounter,
    resetLocationCounter,
} from "../../factories";
import { dietaryRestrictions, householdDietaryRestrictions, households } from "@/app/db/schema";
import type { HouseholdCreateData, FormData } from "@/app/[locale]/households/enroll/types";
import { stripSwedishPrefix } from "@/app/utils/validation/phone-validation";

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

vi.mock("@/app/utils/user-agreement", () => ({
    getCurrentAgreement: vi.fn(async () => null),
    getUserIdByGithubUsername: vi.fn(async () => null),
    hasUserAcceptedAgreement: vi.fn(async () => true),
}));

type EnrollActionsModule = typeof import("@/app/[locale]/households/enroll/actions");
type EditActionsModule = typeof import("@/app/[locale]/households/[id]/edit/actions");

let enrollHousehold: EnrollActionsModule["enrollHousehold"];
let getHouseholdFormData: EditActionsModule["getHouseholdFormData"];
let updateHousehold: EditActionsModule["updateHousehold"];

let optionCounter = 0;
function uniqueOptionName(prefix: string): string {
    optionCounter += 1;
    return `${prefix}-${optionCounter}`;
}

function buildEnrollmentData(
    pickupLocationId: string,
    phoneNumber: string,
    restrictions: Array<{ id: string; name: string }> = [],
): HouseholdCreateData {
    return {
        headOfHousehold: {
            firstName: "Test",
            lastName: "Enrollment",
            phoneNumber,
            locale: "sv",
        },
        smsConsent: false,
        members: [],
        dietaryRestrictions: restrictions,
        additionalNeeds: [],
        pets: [],
        foodParcels: {
            pickupLocationId,
            parcels: [],
        },
        comments: [],
    };
}

describe("Household option availability guards - integration", () => {
    beforeAll(async () => {
        const enrollActions = await import("@/app/[locale]/households/enroll/actions");
        enrollHousehold = enrollActions.enrollHousehold;

        const editActions = await import("@/app/[locale]/households/[id]/edit/actions");
        getHouseholdFormData = editActions.getHouseholdFormData;
        updateHousehold = editActions.updateHousehold;
    });

    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
    });

    it("rejects enrollment when a disabled option is selected and returns i18n key", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule();
        const phoneInput = "0701112233";

        const [disabledOption] = await db
            .insert(dietaryRestrictions)
            .values({
                name: uniqueOptionName("disabled-enroll"),
                is_active: false,
            })
            .returning();

        const result = await enrollHousehold(
            buildEnrollmentData(location.id, phoneInput, [
                { id: disabledOption.id, name: disabledOption.name },
            ]),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("OPTION_NOT_AVAILABLE");
            expect(result.error.message).toBe("error.optionNotAvailable");
        }

        const created = await db
            .select()
            .from(households)
            .where(eq(households.phone_number, "+46701112233"));
        expect(created).toHaveLength(0);
    });

    it("allows keeping disabled existing options on edit but blocks adding new disabled options", async () => {
        const db = await getTestDb();
        const household = await createTestHousehold();

        const [keepDisabled] = await db
            .insert(dietaryRestrictions)
            .values({
                name: uniqueOptionName("keep-disabled"),
            })
            .returning();
        const [addDisabled] = await db
            .insert(dietaryRestrictions)
            .values({
                name: uniqueOptionName("new-disabled"),
                is_active: false,
            })
            .returning();

        await db.insert(householdDietaryRestrictions).values({
            household_id: household.id,
            dietary_restriction_id: keepDisabled.id,
        });

        await db
            .update(dietaryRestrictions)
            .set({ is_active: false })
            .where(eq(dietaryRestrictions.id, keepDisabled.id));

        const formResult = await getHouseholdFormData(household.id);
        expect(formResult.success).toBe(true);
        if (!formResult.success) return;

        const keepOnlyData: FormData = {
            ...formResult.data,
            household: {
                ...formResult.data.household,
                phone_number: stripSwedishPrefix(formResult.data.household.phone_number),
            },
            dietaryRestrictions: [...formResult.data.dietaryRestrictions],
        };

        const keepOnlyUpdate = await updateHousehold(household.id, keepOnlyData);
        expect(keepOnlyUpdate.success).toBe(true);

        const addDisabledData: FormData = {
            ...keepOnlyData,
            dietaryRestrictions: [
                ...formResult.data.dietaryRestrictions,
                { id: addDisabled.id, name: addDisabled.name },
            ],
        };

        const addDisabledUpdate = await updateHousehold(household.id, addDisabledData);
        expect(addDisabledUpdate.success).toBe(false);
        if (!addDisabledUpdate.success) {
            expect(addDisabledUpdate.error.code).toBe("OPTION_NOT_AVAILABLE");
            expect(addDisabledUpdate.error.message).toBe("error.optionNotAvailable");
        }
    });
});
