/**
 * Every server action that reads or changes household data must refuse a user
 * who hasn't accepted the current user agreement. Server actions can be called
 * from the browser without rendering a page, so the page guard isn't enough.
 *
 * The real protected wrappers run; the database is an empty stub, so an action
 * that gets past its wrapper fails with a different error.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSession } from "../../../test-helpers";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
    auth: () => mockAuth(),
}));

vi.mock("@/app/utils/user-agreement", () => ({
    getCurrentAgreement: async () => ({ id: "agreement-1" }),
    getUserIdByGithubUsername: async () => "user-1",
    hasUserAcceptedAgreement: async () => false,
}));

vi.mock("@/app/utils/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    logError: vi.fn(),
    logCritical: vi.fn(),
}));

vi.mock("@/app/db/drizzle", () => ({ db: {} }));

const editActions = () => import("@/app/[locale]/households/[id]/edit/actions");
const householdActions = () => import("@/app/[locale]/households/actions");
const scheduleActions = () => import("@/app/[locale]/schedule/actions");

// Arguments are never looked at: the wrapper refuses before the action runs.
const mutations: Array<[string, () => Promise<unknown>]> = [
    ["updateHousehold", async () => (await editActions()).updateHousehold("h1", {} as never)],
    [
        "updateResponsibleStaff",
        async () => (await editActions()).updateResponsibleStaff("h1", {} as never),
    ],
    ["addComment", async () => (await editActions()).addComment("h1", "note")],
    [
        "updateHouseholdParcels",
        async () =>
            (await import("@/app/[locale]/households/[id]/parcels/actions")).updateHouseholdParcels(
                "h1",
                {} as never,
            ),
    ],
    [
        "enrollHousehold",
        async () =>
            (await import("@/app/[locale]/households/enroll/actions")).enrollHousehold({} as never),
    ],
    ["deleteHouseholdComment", async () => (await householdActions()).deleteHouseholdComment("c1")],
    [
        "updateFoodParcelSchedule",
        async () => (await scheduleActions()).updateFoodParcelSchedule("p1", {} as never),
    ],
    [
        "bulkRescheduleParcels",
        async () => (await scheduleActions()).bulkRescheduleParcels(["p1"], {} as never),
    ],
    [
        "softDeleteParcel",
        async () => (await import("@/app/[locale]/parcels/actions")).softDeleteParcel("p1"),
    ],
    [
        "checkHouseholdDuplicates",
        async () =>
            (
                await import("@/app/[locale]/households/check-duplicates-action")
            ).checkHouseholdDuplicates({} as never),
    ],
    [
        "removeHouseholdAction",
        async () =>
            (
                await import("@/app/[locale]/households/[id]/actions/remove-household")
            ).removeHouseholdAction({} as never),
    ],
];

// The household options page lists, per dietary restriction, pet species and
// additional need, the households that have it.
const optionsActions = () => import("@/app/[locale]/settings/options/actions");
const optionLists = [
    ["DietaryRestriction", "DietaryRestrictions"],
    ["PetSpecies", "PetSpecies"],
    ["AdditionalNeed", "AdditionalNeeds"],
].flatMap(
    ([one, many]): Array<[string, () => Promise<unknown>]> => [
        [`list${many}`, async () => (await optionsActions())[`list${many}` as "listPetSpecies"]()],
        [
            `update${one}`,
            async () =>
                (await optionsActions())[`update${one}` as "updatePetSpecies"]("o1", { name: "x" }),
        ],
        [
            `set${one}ActiveStatus`,
            async () =>
                (await optionsActions())[`set${one}ActiveStatus` as "setPetSpeciesActiveStatus"](
                    "o1",
                    false,
                ),
        ],
        [
            `delete${one}`,
            async () => (await optionsActions())[`delete${one}` as "deletePetSpecies"]("o1"),
        ],
    ],
);
mutations.push(...optionLists);

const reads: Array<[string, () => Promise<unknown>]> = [
    ["getParcelById", async () => (await scheduleActions()).getParcelById("p1")],
    ["getTodaysParcels", async () => (await scheduleActions()).getTodaysParcels()],
    [
        "getOutsideHoursParcelsForLocation",
        async () => (await scheduleActions()).getOutsideHoursParcelsForLocation("loc1"),
    ],
];

describe("Household data actions without an accepted agreement", () => {
    beforeEach(() => {
        mockAuth.mockResolvedValue(createMockSession());
    });

    it.each(mutations)("%s refuses an admin", async (_name, call) => {
        await expect(call()).resolves.toMatchObject({
            success: false,
            error: { code: "AGREEMENT_REQUIRED" },
        });
    });

    it.each(reads)("%s refuses the user", async (_name, call) => {
        await expect(call()).rejects.toThrow(
            "You must accept the current agreement before performing this action",
        );
    });
});
