/**
 * Integration test to verify PGlite setup works correctly.
 *
 * This test validates:
 * 1. PGlite starts successfully
 * 2. Migrations run without errors
 * 3. Tables are created
 * 4. Seed data exists in lookup tables
 * 5. pg_trgm extension works (used for fuzzy name matching)
 */

import { describe, it, expect } from "vitest";
import { getTestDb, getPgliteInstance } from "../db/test-db";
import { households, dietaryRestrictions, petSpecies } from "@/app/db/schema";

describe("PGlite Test Database Setup", () => {
    it("should initialize PGlite and run migrations", async () => {
        const db = await getTestDb();
        expect(db).toBeDefined();
    });

    it("should have created the households table", async () => {
        const db = await getTestDb();

        // Insert a test household
        const [inserted] = await db
            .insert(households)
            .values({
                first_name: "Test",
                last_name: "User",
                phone_number: "+46701234567",
                locale: "sv",
                postal_code: "72345",
            })
            .returning();

        expect(inserted).toBeDefined();
        expect(inserted.id).toBeDefined();
        expect(inserted.first_name).toBe("Test");
    });

    it("should have seed data for dietary restrictions", async () => {
        const db = await getTestDb();

        // Query dietary restrictions - should have seed data from migrations
        const restrictions = await db.select().from(dietaryRestrictions);

        expect(restrictions.length).toBeGreaterThan(0);
    });

    it("should have seed data for pet species", async () => {
        const db = await getTestDb();

        // Query pet species - should have seed data from migrations
        const species = await db.select().from(petSpecies);

        expect(species.length).toBeGreaterThan(0);
    });

    it("should support pg_trgm extension for fuzzy matching", async () => {
        const pglite = getPgliteInstance();
        expect(pglite).toBeDefined();

        // Test that similarity function works (from pg_trgm extension)
        const result = await pglite!.query<{ similarity: number }>(
            "SELECT similarity('hello', 'hallo') as similarity",
        );

        expect(result.rows.length).toBe(1);
        // Similarity should be between 0 and 1
        expect(result.rows[0].similarity).toBeGreaterThan(0);
        expect(result.rows[0].similarity).toBeLessThanOrEqual(1);
    });

    it("should enforce postal code format check constraint", async () => {
        const db = await getTestDb();

        // Try to insert a household with invalid postal code
        await expect(
            db.insert(households).values({
                first_name: "Test",
                last_name: "User",
                phone_number: "+46701234568",
                locale: "sv",
                postal_code: "1234", // Invalid - must be 5 digits
            }),
        ).rejects.toThrow();
    });

    it("should cleanup data between tests", async () => {
        const db = await getTestDb();

        // This test runs after previous tests
        // Verify that household from earlier test was cleaned up
        const allHouseholds = await db.select().from(households);

        // Should be empty due to afterEach cleanup
        expect(allHouseholds).toHaveLength(0);
    });
});
