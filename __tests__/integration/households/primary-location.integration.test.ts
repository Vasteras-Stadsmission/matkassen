/**
 * Integration tests for primary handout location feature.
 *
 * Tests the ACTUAL database behavior:
 * 1. Household creation with a primary location persists correctly
 * 2. Household update can set/change/clear primary location
 * 3. FK constraint with onDelete: "set null" works when location is deleted
 * 4. Listing households resolves primary location name via JOIN
 * 5. Household detail page returns primary location info
 * 6. Today's parcels query resolves primary location for visiting households
 * 7. Invalid location ID is rejected by server-side validation
 *
 * Note: Auth is mocked since we're testing DB behavior, not auth.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import {
    createTestHousehold,
    createTestPickupLocation,
    createTestParcelForToday,
    resetHouseholdCounter,
    resetLocationCounter,
} from "../../factories";
import { getTestDb } from "../../db/test-db";
import { households, pickupLocations } from "@/app/db/schema";

// Mock auth to always succeed - we're testing DB behavior, not auth
vi.mock("@/app/utils/auth/protected-action", () => ({
    protectedAgreementAction: (fn: any) => {
        return async (...args: any[]) => {
            const mockSession = {
                user: { githubUsername: "test-user", name: "Test User" },
            };
            return fn(mockSession, ...args);
        };
    },
    protectedReadAction: (fn: any) => {
        return async (...args: any[]) => {
            const mockSession = {
                user: { githubUsername: "test-user", name: "Test User" },
            };
            return fn(mockSession, ...args);
        };
    },
    protectedAgreementHouseholdAction: (fn: any) => {
        return async (householdId: string, ...args: any[]) => {
            const mockSession = {
                user: { githubUsername: "test-user", name: "Test User" },
            };
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

// Mock next/cache since it's not available in test environment
vi.mock("next/cache", () => ({
    unstable_cache: (fn: any) => fn,
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
}));

// Mock logger to avoid noise
vi.mock("@/app/utils/logger", () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
    logError: vi.fn(),
}));

// Mock SMS service
vi.mock("@/app/utils/sms/sms-service", () => ({
    createSmsRecord: vi.fn(),
}));

beforeEach(() => {
    resetHouseholdCounter();
    resetLocationCounter();
});

describe("Primary handout location - Schema and persistence", () => {
    it("should persist primary_pickup_location_id when creating a household", async () => {
        const location = await createTestPickupLocation({ name: "Stadsmissionen" });
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        // Verify the FK was stored
        const db = await getTestDb();
        const [stored] = await db
            .select({ primaryLocationId: households.primary_pickup_location_id })
            .from(households)
            .where(eq(households.id, household.id));

        expect(stored.primaryLocationId).toBe(location.id);
    });

    it("should allow null primary_pickup_location_id (optional field)", async () => {
        const household = await createTestHousehold({
            primary_pickup_location_id: null,
        });

        const db = await getTestDb();
        const [stored] = await db
            .select({ primaryLocationId: households.primary_pickup_location_id })
            .from(households)
            .where(eq(households.id, household.id));

        expect(stored.primaryLocationId).toBeNull();
    });

    it("should set primary_pickup_location_id to null when referenced location is deleted", async () => {
        const db = await getTestDb();
        const location = await createTestPickupLocation({ name: "Temporary Location" });
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        // Verify it's set
        const [before] = await db
            .select({ primaryLocationId: households.primary_pickup_location_id })
            .from(households)
            .where(eq(households.id, household.id));
        expect(before.primaryLocationId).toBe(location.id);

        // Delete the location (onDelete: "set null" should kick in)
        await db.delete(pickupLocations).where(eq(pickupLocations.id, location.id));

        // Verify onDelete: "set null" worked
        const [after] = await db
            .select({ primaryLocationId: households.primary_pickup_location_id })
            .from(households)
            .where(eq(households.id, household.id));
        expect(after.primaryLocationId).toBeNull();
    });

    it("should reject an invalid primary_pickup_location_id (FK constraint)", async () => {
        const db = await getTestDb();

        await expect(
            db
                .insert(households)
                .values({
                    first_name: "Test",
                    last_name: "User",
                    phone_number: "+46700001234",
                    locale: "sv",
                    primary_pickup_location_id: "nonexistent-id",
                })
                .returning(),
        ).rejects.toThrow();
    });
});

describe("Primary handout location - Household listing (getHouseholds)", () => {
    it("should resolve primary location name via LEFT JOIN", async () => {
        const location = await createTestPickupLocation({ name: "Klara Kyrka" });
        await createTestHousehold({
            first_name: "Anna",
            last_name: "Svensson",
            primary_pickup_location_id: location.id,
        });

        const { getHouseholds } = await import("@/app/[locale]/households/actions");
        const result = await getHouseholds();

        const anna = result.find(h => h.first_name === "Anna");
        expect(anna).toBeDefined();
        expect(anna!.primaryLocationName).toBe("Klara Kyrka");
    });

    it("should return null primaryLocationName when household has no primary location", async () => {
        await createTestHousehold({
            first_name: "Erik",
            last_name: "Johansson",
            primary_pickup_location_id: null,
        });

        const { getHouseholds } = await import("@/app/[locale]/households/actions");
        const result = await getHouseholds();

        const erik = result.find(h => h.first_name === "Erik");
        expect(erik).toBeDefined();
        expect(erik!.primaryLocationName).toBeNull();
    });

    it("should resolve different primary locations for different households", async () => {
        const locationA = await createTestPickupLocation({ name: "Plats A" });
        const locationB = await createTestPickupLocation({ name: "Plats B" });

        await createTestHousehold({
            first_name: "Household",
            last_name: "AtA",
            primary_pickup_location_id: locationA.id,
        });
        await createTestHousehold({
            first_name: "Household",
            last_name: "AtB",
            primary_pickup_location_id: locationB.id,
        });
        await createTestHousehold({
            first_name: "Household",
            last_name: "NoLoc",
            primary_pickup_location_id: null,
        });

        const { getHouseholds } = await import("@/app/[locale]/households/actions");
        const result = await getHouseholds();

        expect(result.find(h => h.last_name === "AtA")!.primaryLocationName).toBe("Plats A");
        expect(result.find(h => h.last_name === "AtB")!.primaryLocationName).toBe("Plats B");
        expect(result.find(h => h.last_name === "NoLoc")!.primaryLocationName).toBeNull();
    });
});

describe("Primary handout location - Household details (getHouseholdDetails)", () => {
    it("should return primary pickup location object with id and name", async () => {
        const location = await createTestPickupLocation({ name: "Frihamnskyrkan" });
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const { getHouseholdDetails } = await import("@/app/[locale]/households/actions");
        const details = await getHouseholdDetails(household.id);

        expect(details).not.toBeNull();
        expect(details!.primaryPickupLocation).toEqual({
            id: location.id,
            name: "Frihamnskyrkan",
        });
    });

    it("should return null primaryPickupLocation when not set", async () => {
        const household = await createTestHousehold({
            primary_pickup_location_id: null,
        });

        const { getHouseholdDetails } = await import("@/app/[locale]/households/actions");
        const details = await getHouseholdDetails(household.id);

        expect(details).not.toBeNull();
        expect(details!.primaryPickupLocation).toBeNull();
    });
});

describe("Primary handout location - Today's parcels query", () => {
    it("should include primary location info when household has one set", async () => {
        const primaryLocation = await createTestPickupLocation({ name: "Hemmaplan" });
        const parcelLocation = await createTestPickupLocation({ name: "Besöksplats" });

        const household = await createTestHousehold({
            primary_pickup_location_id: primaryLocation.id,
        });

        await createTestParcelForToday({
            household_id: household.id,
            pickup_location_id: parcelLocation.id,
        });

        const { getTodaysParcels } = await import("@/app/[locale]/schedule/actions");
        const parcels = await getTodaysParcels();

        expect(parcels.length).toBeGreaterThanOrEqual(1);
        const parcel = parcels.find(p => p.householdId === household.id);
        expect(parcel).toBeDefined();
        expect(parcel!.primaryPickupLocationId).toBe(primaryLocation.id);
        expect(parcel!.primaryPickupLocationName).toBe("Hemmaplan");
    });

    it("should return null primary location fields when household has none", async () => {
        const parcelLocation = await createTestPickupLocation({ name: "Utlämning" });
        const household = await createTestHousehold({
            primary_pickup_location_id: null,
        });

        await createTestParcelForToday({
            household_id: household.id,
            pickup_location_id: parcelLocation.id,
        });

        const { getTodaysParcels } = await import("@/app/[locale]/schedule/actions");
        const parcels = await getTodaysParcels();

        const parcel = parcels.find(p => p.householdId === household.id);
        expect(parcel).toBeDefined();
        expect(parcel!.primaryPickupLocationId).toBeNull();
        expect(parcel!.primaryPickupLocationName).toBeNull();
    });

    it("should distinguish visiting households from home-location households", async () => {
        const locationA = await createTestPickupLocation({ name: "Plats A" });
        const locationB = await createTestPickupLocation({ name: "Plats B" });

        // Household whose primary is A, picking up at A (home)
        const homeHousehold = await createTestHousehold({
            first_name: "Home",
            last_name: "Hh",
            primary_pickup_location_id: locationA.id,
        });
        await createTestParcelForToday({
            household_id: homeHousehold.id,
            pickup_location_id: locationA.id,
        });

        // Household whose primary is A, but picking up at B (visiting)
        const visitingHousehold = await createTestHousehold({
            first_name: "Visiting",
            last_name: "Vh",
            primary_pickup_location_id: locationA.id,
        });
        await createTestParcelForToday({
            household_id: visitingHousehold.id,
            pickup_location_id: locationB.id,
        });

        const { getTodaysParcels } = await import("@/app/[locale]/schedule/actions");
        const parcels = await getTodaysParcels();

        const homeParcel = parcels.find(p => p.householdId === homeHousehold.id);
        const visitingParcel = parcels.find(p => p.householdId === visitingHousehold.id);

        // Both should have primaryPickupLocationId pointing to A
        expect(homeParcel!.primaryPickupLocationId).toBe(locationA.id);
        expect(visitingParcel!.primaryPickupLocationId).toBe(locationA.id);

        // But the parcel's actual location differs
        expect(homeParcel!.pickup_location_id).toBe(locationA.id);
        expect(visitingParcel!.pickup_location_id).toBe(locationB.id);

        // This is what the UI uses to highlight "visiting from another location"
        expect(homeParcel!.primaryPickupLocationId).toBe(homeParcel!.pickup_location_id);
        expect(visitingParcel!.primaryPickupLocationId).not.toBe(
            visitingParcel!.pickup_location_id,
        );
    });
});

describe("Primary handout location - Server-side validation", () => {
    it("should reject enrollment with a nonexistent primary location ID", async () => {
        const { enrollHousehold } = await import(
            "@/app/[locale]/households/enroll/actions"
        );

        const result = await enrollHousehold({
            headOfHousehold: {
                firstName: "Test",
                lastName: "Reject",
                phoneNumber: "0701234599",
                locale: "sv",
            },
            smsConsent: false,
            primaryPickupLocationId: "nonexistent-location-id",
            members: [],
            dietaryRestrictions: [],
            additionalNeeds: [],
            pets: [],
            foodParcels: {
                pickupLocationId: "",
                parcels: [],
            },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("OPTION_NOT_AVAILABLE");
        }
    });

    it("should accept enrollment with a valid primary location ID", async () => {
        const location = await createTestPickupLocation({ name: "Valid Location" });

        const { enrollHousehold } = await import(
            "@/app/[locale]/households/enroll/actions"
        );

        const result = await enrollHousehold({
            headOfHousehold: {
                firstName: "Test",
                lastName: "Accept",
                phoneNumber: "0701234598",
                locale: "sv",
            },
            smsConsent: false,
            primaryPickupLocationId: location.id,
            members: [],
            dietaryRestrictions: [],
            additionalNeeds: [],
            pets: [],
            foodParcels: {
                pickupLocationId: "",
                parcels: [],
            },
        });

        expect(result.success).toBe(true);

        // Verify it was persisted
        if (result.success) {
            const db = await getTestDb();
            const [stored] = await db
                .select({ primaryLocationId: households.primary_pickup_location_id })
                .from(households)
                .where(eq(households.id, result.data.householdId));

            expect(stored.primaryLocationId).toBe(location.id);
        }
    });

    it("should accept enrollment with null primary location ID (optional)", async () => {
        const { enrollHousehold } = await import(
            "@/app/[locale]/households/enroll/actions"
        );

        const result = await enrollHousehold({
            headOfHousehold: {
                firstName: "Test",
                lastName: "NullLoc",
                phoneNumber: "0701234597",
                locale: "sv",
            },
            smsConsent: false,
            primaryPickupLocationId: null,
            members: [],
            dietaryRestrictions: [],
            additionalNeeds: [],
            pets: [],
            foodParcels: {
                pickupLocationId: "",
                parcels: [],
            },
        });

        expect(result.success).toBe(true);
    });

    it("should reject update with a nonexistent primary location ID", async () => {
        const household = await createTestHousehold();
        // Phone must be in stripped format (without +46) as the form would send it
        const strippedPhone = household.phone_number.replace(/^\+46/, "0");

        const { updateHousehold } = await import(
            "@/app/[locale]/households/[id]/edit/actions"
        );

        const result = await updateHousehold(household.id, {
            household: {
                first_name: household.first_name,
                last_name: household.last_name,
                phone_number: strippedPhone,
                locale: household.locale,
                postal_code: household.postal_code,
                primary_pickup_location_id: "nonexistent-location-id",
            },
            members: [],
            dietaryRestrictions: [],
            additionalNeeds: [],
            pets: [],
            foodParcels: { pickupLocationId: "", parcels: [] },
            comments: [],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("OPTION_NOT_AVAILABLE");
        }
    });

    it("should allow update to change primary location to a valid one", async () => {
        const locationA = await createTestPickupLocation({ name: "Location A" });
        const locationB = await createTestPickupLocation({ name: "Location B" });
        const household = await createTestHousehold({
            primary_pickup_location_id: locationA.id,
        });
        const strippedPhone = household.phone_number.replace(/^\+46/, "0");

        const { updateHousehold } = await import(
            "@/app/[locale]/households/[id]/edit/actions"
        );

        const result = await updateHousehold(household.id, {
            household: {
                first_name: household.first_name,
                last_name: household.last_name,
                phone_number: strippedPhone,
                locale: household.locale,
                postal_code: household.postal_code,
                primary_pickup_location_id: locationB.id,
            },
            members: [],
            dietaryRestrictions: [],
            additionalNeeds: [],
            pets: [],
            foodParcels: { pickupLocationId: "", parcels: [] },
            comments: [],
        });

        expect(result.success).toBe(true);

        // Verify it was updated in DB
        const db = await getTestDb();
        const [stored] = await db
            .select({ primaryLocationId: households.primary_pickup_location_id })
            .from(households)
            .where(eq(households.id, household.id));
        expect(stored.primaryLocationId).toBe(locationB.id);
    });

    it("should allow clearing primary location by setting to null", async () => {
        const location = await createTestPickupLocation({ name: "To Be Cleared" });
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });
        const strippedPhone = household.phone_number.replace(/^\+46/, "0");

        const { updateHousehold } = await import(
            "@/app/[locale]/households/[id]/edit/actions"
        );

        const result = await updateHousehold(household.id, {
            household: {
                first_name: household.first_name,
                last_name: household.last_name,
                phone_number: strippedPhone,
                locale: household.locale,
                postal_code: household.postal_code,
                primary_pickup_location_id: null,
            },
            members: [],
            dietaryRestrictions: [],
            additionalNeeds: [],
            pets: [],
            foodParcels: { pickupLocationId: "", parcels: [] },
            comments: [],
        });

        expect(result.success).toBe(true);

        // Verify it was cleared in DB
        const db = await getTestDb();
        const [stored] = await db
            .select({ primaryLocationId: households.primary_pickup_location_id })
            .from(households)
            .where(eq(households.id, household.id));
        expect(stored.primaryLocationId).toBeNull();
    });
});
