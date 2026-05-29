import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestUser,
    resetHouseholdCounter,
    resetUserCounter,
} from "../../factories";
import { households, users } from "@/app/db/schema";
import type { FormData, HouseholdCreateData } from "@/app/[locale]/households/enroll/types";

type MockSession = { user: { githubUsername: string; name: string; role: "admin" } };
const mockSession: MockSession = {
    user: { githubUsername: "test-user", name: "Test User", role: "admin" },
};

vi.mock("@/app/utils/auth/protected-action", () => ({
    protectedAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => fn(mockSession, ...args);
    },
    protectedAdminAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => fn(mockSession, ...args);
    },
    protectedReadAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => fn(mockSession, ...args);
    },
    protectedAdminHouseholdAction: (fn: (...args: unknown[]) => unknown) => {
        return async (householdId: string, ...args: unknown[]) => {
            const db = await getTestDb();
            const [household] = await db
                .select()
                .from(households)
                .where(eq(households.id, householdId))
                .limit(1);

            return fn(mockSession, household, ...args);
        };
    },
}));

vi.mock("next/cache", () => ({
    unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
}));

vi.mock("@/app/utils/logger", () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    logError: vi.fn(),
}));

vi.mock("@/app/utils/sms/sms-service", () => ({
    createSmsRecord: vi.fn(),
}));

beforeEach(async () => {
    resetHouseholdCounter();
    resetUserCounter();
    await createTestUser({
        github_username: mockSession.user.githubUsername,
        display_name: mockSession.user.name,
    });
});

function buildEnrollmentData(responsibleUserId: string): HouseholdCreateData {
    return {
        headOfHousehold: {
            firstName: "  Marie-janette\t\t",
            lastName: "  Agne\u0301   Eriksson  ",
            phoneNumber: "0700001234",
            locale: "sv",
        },
        smsConsent: false,
        responsibleUserId,
        primaryPickupLocationId: null,
        members: [],
        dietaryRestrictions: [],
        additionalNeeds: [],
        pets: [],
        foodParcels: {
            pickupLocationId: "",
            parcels: [],
        },
    };
}

function buildUpdateData(household: typeof households.$inferSelect): FormData {
    return {
        household: {
            first_name: "  Abd\t\tAlmohammad  ",
            last_name: "  Kravchenko  ",
            phone_number: household.phone_number.replace("+46", "0"),
            locale: household.locale,
            primary_pickup_location_id: household.primary_pickup_location_id,
            responsible_user_id: household.responsible_user_id,
        },
        members: [],
        dietaryRestrictions: [],
        additionalNeeds: [],
        pets: [],
        foodParcels: {
            pickupLocationId: "",
            parcels: [],
        },
        comments: [],
    };
}

describe("person-name normalization on persisted writes", () => {
    it("normalizes household names during enrollment", async () => {
        const db = await getTestDb();
        const [responsibleUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.github_username, mockSession.user.githubUsername))
            .limit(1);

        const { enrollHousehold } = await import("@/app/[locale]/households/enroll/actions");
        const result = await enrollHousehold(buildEnrollmentData(responsibleUser.id));

        expect(result.success).toBe(true);
        if (!result.success) return;

        const [stored] = await db
            .select({
                first_name: households.first_name,
                last_name: households.last_name,
            })
            .from(households)
            .where(eq(households.id, result.data.householdId));

        expect(stored).toEqual({
            first_name: "Marie-janette",
            last_name: "Agn\u00e9 Eriksson",
        });
    });

    it("normalizes household names during edit", async () => {
        const db = await getTestDb();
        const household = await createTestHousehold({
            first_name: "Original",
            last_name: "Name",
        });

        const { updateHousehold } = await import("@/app/[locale]/households/[id]/edit/actions");
        const result = await updateHousehold(household.id, buildUpdateData(household));

        if (!result.success) {
            throw new Error(result.error.message);
        }
        expect(result.success).toBe(true);

        const [stored] = await db
            .select({
                first_name: households.first_name,
                last_name: households.last_name,
            })
            .from(households)
            .where(eq(households.id, household.id));

        expect(stored).toEqual({
            first_name: "Abd Almohammad",
            last_name: "Kravchenko",
        });
    });

    it("normalizes user profile names", async () => {
        const db = await getTestDb();
        const { saveUserProfile } = await import("@/app/utils/user-profile");

        const result = await saveUserProfile({
            first_name: "  Lena\tMaria ",
            last_name: " Lamberg\n",
        });

        expect(result.success).toBe(true);

        const [stored] = await db
            .select({
                first_name: users.first_name,
                last_name: users.last_name,
            })
            .from(users)
            .where(eq(users.github_username, mockSession.user.githubUsername));

        expect(stored).toEqual({
            first_name: "Lena Maria",
            last_name: "Lamberg",
        });
    });

    it("rejects invisible name characters before persisting", async () => {
        const db = await getTestDb();
        const before = await db.select({ id: households.id }).from(households);
        const [responsibleUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.github_username, mockSession.user.githubUsername))
            .limit(1);

        const { enrollHousehold } = await import("@/app/[locale]/households/enroll/actions");
        const data = buildEnrollmentData(responsibleUser.id);
        data.headOfHousehold.firstName = "Anna\u200BSvensson";

        const result = await enrollHousehold(data);
        const after = await db.select({ id: households.id }).from(households);

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.message).toBe("validation.firstNameInvalidCharacters");
        }
        expect(after).toHaveLength(before.length);
    });
});
