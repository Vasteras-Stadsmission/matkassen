/**
 * Regression Tests: Unique Constraints on Household Options
 *
 * CRITICAL: Ensures database-level unique constraints exist to prevent
 * duplicate option names even under race conditions.
 *
 * Background: The application has application-level duplicate checking,
 * but without database constraints, two concurrent requests could both
 * pass the check and create duplicates.
 *
 * If these tests fail, the database is vulnerable to duplicate entries.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Household Options - Database Unique Constraints", () => {
    const schemaPath = join(process.cwd(), "app/db/schema.ts");
    const schemaSource = readFileSync(schemaPath, "utf-8");

    describe("dietary_restrictions table", () => {
        it("should have unique constraint on name column", () => {
            // Extract the dietaryRestrictions table definition
            const tableMatch = schemaSource.match(
                /export const dietaryRestrictions = pgTable\("dietary_restrictions"[\s\S]*?\}\);/,
            );
            expect(tableMatch).toBeTruthy();

            const tableDefinition = tableMatch![0];

            // Must have .unique() on name column to prevent race condition duplicates
            expect(tableDefinition).toMatch(/name:\s*text\("name"\)\.notNull\(\)\.unique\(\)/);
        });
    });

    describe("pet_species_types table", () => {
        it("should have unique constraint on name column", () => {
            // Extract the petSpecies table definition
            const tableMatch = schemaSource.match(
                /export const petSpecies = pgTable\("pet_species_types"[\s\S]*?\}\);/,
            );
            expect(tableMatch).toBeTruthy();

            const tableDefinition = tableMatch![0];

            // Must have .unique() on name column
            expect(tableDefinition).toMatch(/name:\s*text\("name"\)\.notNull\(\)\.unique\(\)/);
        });
    });

    describe("additional_needs table", () => {
        it("should have unique constraint on need column", () => {
            // Extract the additionalNeeds table definition
            const tableMatch = schemaSource.match(
                /export const additionalNeeds = pgTable\("additional_needs"[\s\S]*?\}\);/,
            );
            expect(tableMatch).toBeTruthy();

            const tableDefinition = tableMatch![0];

            // Must have .unique() on need column to prevent race condition duplicates
            expect(tableDefinition).toMatch(/need:\s*text\("need"\)\.notNull\(\)\.unique\(\)/);
        });
    });

    describe("foreign key protection", () => {
        it("dietary restrictions should use onDelete restrict", () => {
            // Extract the householdDietaryRestrictions junction table
            const junctionMatch = schemaSource.match(
                /export const householdDietaryRestrictions[\s\S]*?dietary_restriction_id[\s\S]*?onDelete:\s*"(\w+)"/,
            );
            expect(junctionMatch).toBeTruthy();
            expect(junctionMatch![1]).toBe("restrict");
        });

        it("pet species should use onDelete restrict", () => {
            // Extract the pets table reference to pet_species_id
            const petsMatch = schemaSource.match(
                /pet_species_id[\s\S]*?\.references\(\(\)\s*=>\s*petSpecies\.id[\s\S]*?onDelete:\s*"(\w+)"/,
            );
            expect(petsMatch).toBeTruthy();
            expect(petsMatch![1]).toBe("restrict");
        });

        it("additional needs should use onDelete restrict", () => {
            // Extract the householdAdditionalNeeds junction table
            const junctionMatch = schemaSource.match(
                /export const householdAdditionalNeeds[\s\S]*?additional_need_id[\s\S]*?onDelete:\s*"(\w+)"/,
            );
            expect(junctionMatch).toBeTruthy();
            expect(junctionMatch![1]).toBe("restrict");
        });
    });
});
