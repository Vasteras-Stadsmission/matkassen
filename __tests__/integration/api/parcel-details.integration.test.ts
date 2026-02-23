/**
 * Integration tests for GET /api/admin/parcel/[parcelId]/details route handler.
 *
 * Tests that the parcel details endpoint returns dietary restrictions
 * with severity color information (required/preference).
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    resetHouseholdCounter,
    resetLocationCounter,
} from "../../factories";
import { dietaryRestrictions, householdDietaryRestrictions } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import type { ParcelDetails } from "@/app/api/admin/parcel/[parcelId]/details/route";

vi.mock("@/app/utils/auth/api-auth", () => ({
    authenticateAdminRequest: vi.fn(() =>
        Promise.resolve({
            success: true,
            session: {
                user: {
                    id: "test-admin-id",
                    role: "admin",
                    githubUsername: "test-admin",
                },
            },
        }),
    ),
}));

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let detailsGET: typeof import("@/app/api/admin/parcel/[parcelId]/details/route").GET;

function makeRequest(url: string): NextRequest {
    return new Request(url) as unknown as NextRequest;
}

describe("Parcel details - dietary restriction severity", () => {
    beforeAll(async () => {
        ({ GET: detailsGET } = await import("@/app/api/admin/parcel/[parcelId]/details/route"));
    });

    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
    });

    it("should return dietary restrictions with color field", async () => {
        const db = await getTestDb();

        // Set specific colors on seeded dietary restrictions
        await db
            .update(dietaryRestrictions)
            .set({ color: "required" })
            .where(eq(dietaryRestrictions.name, "Gluten"));
        await db
            .update(dietaryRestrictions)
            .set({ color: "preference" })
            .where(eq(dietaryRestrictions.name, "Vegetarian"));

        // Look up the restriction IDs
        const glutenRow = await db
            .select({ id: dietaryRestrictions.id })
            .from(dietaryRestrictions)
            .where(eq(dietaryRestrictions.name, "Gluten"));
        const vegetarianRow = await db
            .select({ id: dietaryRestrictions.id })
            .from(dietaryRestrictions)
            .where(eq(dietaryRestrictions.name, "Vegetarian"));

        const household = await createTestHousehold();
        const { location } = await createTestLocationWithSchedule();
        const parcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
        });

        // Link both dietary restrictions to the household
        await db.insert(householdDietaryRestrictions).values([
            { household_id: household.id, dietary_restriction_id: glutenRow[0].id },
            { household_id: household.id, dietary_restriction_id: vegetarianRow[0].id },
        ]);

        const response = await detailsGET(
            makeRequest(`http://localhost/api/admin/parcel/${parcel.id}/details`),
            { params: Promise.resolve({ parcelId: parcel.id }) },
        );

        expect(response.status).toBe(200);
        const data: ParcelDetails = await response.json();

        // Verify restrictions are returned as objects with name and color
        expect(data.household.dietaryRestrictions).toHaveLength(2);

        const gluten = data.household.dietaryRestrictions.find(r => r.name === "Gluten");
        const vegetarian = data.household.dietaryRestrictions.find(r => r.name === "Vegetarian");

        expect(gluten).toEqual({ name: "Gluten", color: "required" });
        expect(vegetarian).toEqual({ name: "Vegetarian", color: "preference" });
    });

    it("should return null color for restrictions without severity set", async () => {
        const db = await getTestDb();

        // Ensure Laktos has no color (null) - reset it in case another test changed it
        await db
            .update(dietaryRestrictions)
            .set({ color: null })
            .where(eq(dietaryRestrictions.name, "Laktos"));

        const laktosRow = await db
            .select({ id: dietaryRestrictions.id })
            .from(dietaryRestrictions)
            .where(eq(dietaryRestrictions.name, "Laktos"));

        const household = await createTestHousehold();
        const { location } = await createTestLocationWithSchedule();
        const parcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
        });

        await db
            .insert(householdDietaryRestrictions)
            .values([{ household_id: household.id, dietary_restriction_id: laktosRow[0].id }]);

        const response = await detailsGET(
            makeRequest(`http://localhost/api/admin/parcel/${parcel.id}/details`),
            { params: Promise.resolve({ parcelId: parcel.id }) },
        );

        expect(response.status).toBe(200);
        const data: ParcelDetails = await response.json();

        const laktos = data.household.dietaryRestrictions.find(r => r.name === "Laktos");
        expect(laktos).toEqual({ name: "Laktos", color: null });
    });

    it("should return empty array when household has no dietary restrictions", async () => {
        const household = await createTestHousehold();
        const { location } = await createTestLocationWithSchedule();
        const parcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
        });

        const response = await detailsGET(
            makeRequest(`http://localhost/api/admin/parcel/${parcel.id}/details`),
            { params: Promise.resolve({ parcelId: parcel.id }) },
        );

        expect(response.status).toBe(200);
        const data: ParcelDetails = await response.json();

        expect(data.household.dietaryRestrictions).toEqual([]);
    });
});
