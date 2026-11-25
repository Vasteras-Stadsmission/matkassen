/**
 * Integration tests for getHouseholdDetails, the server action behind the
 * household details page. It is callable from the browser by handout staff too,
 * so what it returns is what staff can read.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    createTestHouseholdWithMembers,
    createTestPickedUpParcel,
    createTestPickupLocation,
    createTestUser,
    resetHouseholdCounter,
    resetLocationCounter,
    resetUserCounter,
} from "../../factories";
import { getTestDb } from "../../db/test-db";
import { TEST_NOW } from "../../test-time";
import { removeHousehold } from "@/app/utils/anonymization/anonymize-household";
import { logError } from "@/app/utils/logger";

// Auth is not under test: run the action as handout staff.
vi.mock("@/app/utils/auth/protected-action", () => ({
    protectedAgreementAction: (fn: (...args: unknown[]) => unknown) => fn,
    protectedAdminAction: (fn: (...args: unknown[]) => unknown) => fn,
    protectedAdminAgreementReadAction: (fn: (...args: unknown[]) => unknown) => fn,
    protectedAgreementReadAction:
        (fn: (...args: unknown[]) => unknown) =>
        (...args: unknown[]) =>
            fn({ user: { githubUsername: "staff-user", role: "handout_staff" } }, ...args),
}));

vi.mock("@/app/utils/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    logError: vi.fn(),
}));

describe("getHouseholdDetails", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetUserCounter();
        vi.mocked(logError).mockClear();
    });

    it("returns none of an anonymized household's remaining data", async () => {
        const location = await createTestPickupLocation();
        const household = await createTestHouseholdWithMembers({}, [{ age: 34, sex: "female" }]);
        await createTestPickedUpParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: new Date(TEST_NOW.getTime() - 7 * 24 * 60 * 60 * 1000),
        });
        const admin = await createTestUser();
        await expect(removeHousehold(household.id, admin.github_username)).resolves.toMatchObject({
            method: "anonymized",
        });

        const { getHouseholdDetails } = await import("@/app/[locale]/households/actions");
        const details = await getHouseholdDetails(household.id);

        expect(details?.household.anonymized_at).toBeInstanceOf(Date);
        expect(details?.members).toEqual([]);
        expect(details?.foodParcels.parcels).toEqual([]);
        expect(details?.pickupLocation).toBeNull();
    });

    it("returns null for a household that doesn't exist", async () => {
        const { getHouseholdDetails } = await import("@/app/[locale]/households/actions");

        await expect(getHouseholdDetails("missing1")).resolves.toBeNull();
    });

    it("fails with the database error instead of reporting the household as missing", async () => {
        const db = await getTestDb();
        const dbError = new Error("connection terminated");
        vi.spyOn(db, "select").mockImplementationOnce(() => {
            throw dbError;
        });

        const { getHouseholdDetails } = await import("@/app/[locale]/households/actions");

        await expect(getHouseholdDetails("h1")).rejects.toBe(dbError);
        expect(logError).toHaveBeenCalledWith(
            "Error fetching household details",
            dbError,
            expect.objectContaining({ householdId: "h1" }),
        );
    });
});
