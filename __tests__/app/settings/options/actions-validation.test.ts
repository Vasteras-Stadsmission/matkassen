/**
 * Regression Tests: Household Options Action Validation
 *
 * These tests verify that the server actions properly validate input
 * and handle error cases that users might encounter.
 *
 * Real-world scenarios tested:
 * - Admin enters empty/whitespace-only name
 * - Admin enters name with leading/trailing whitespace (should be trimmed)
 * - Admin tries to create duplicate name (application-level check)
 * - Admin tries to delete option that households are using
 * - Admin tries to update non-existent option
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Household Options - Input Validation", () => {
    const actionsPath = join(process.cwd(), "app/[locale]/settings/options/actions.ts");
    const actionsSource = readFileSync(actionsPath, "utf-8");

    describe("Empty name validation", () => {
        it("should validate dietary restriction name is not empty", () => {
            const createSection = extractFunction(actionsSource, "createDietaryRestriction");

            // Must check for empty/whitespace-only name
            expect(createSection).toContain("!data.name?.trim()");
            expect(createSection).toContain('code: "VALIDATION_ERROR"');
            expect(createSection).toContain("Name cannot be empty");
        });

        it("should validate pet species name is not empty", () => {
            const createSection = extractFunction(actionsSource, "createPetSpecies");

            expect(createSection).toContain("!data.name?.trim()");
            expect(createSection).toContain('code: "VALIDATION_ERROR"');
        });

        it("should validate additional need name is not empty", () => {
            const createSection = extractFunction(actionsSource, "createAdditionalNeed");

            expect(createSection).toContain("!data.name?.trim()");
            expect(createSection).toContain('code: "VALIDATION_ERROR"');
        });
    });

    describe("Whitespace trimming", () => {
        it("should trim whitespace from dietary restriction names", () => {
            const createSection = extractFunction(actionsSource, "createDietaryRestriction");

            // Must trim before saving to database
            expect(createSection).toContain("const trimmedName = data.name.trim()");
            // Must use trimmed name in insert
            expect(createSection).toContain("name: trimmedName");
        });

        it("should trim whitespace from pet species names", () => {
            const createSection = extractFunction(actionsSource, "createPetSpecies");

            expect(createSection).toContain("const trimmedName = data.name.trim()");
            expect(createSection).toContain("name: trimmedName");
        });

        it("should trim whitespace from additional need names", () => {
            const createSection = extractFunction(actionsSource, "createAdditionalNeed");

            expect(createSection).toContain("const trimmedName = data.name.trim()");
            // Additional needs use 'need' column, not 'name'
            expect(createSection).toContain("need: trimmedName");
        });
    });

    describe("Duplicate name detection", () => {
        it("should check for existing dietary restriction before creating", () => {
            const createSection = extractFunction(actionsSource, "createDietaryRestriction");

            // Must check if name already exists
            expect(createSection).toContain("existing.length > 0");
            expect(createSection).toContain('code: "DUPLICATE_NAME"');
        });

        it("should allow updating to same name (not a duplicate of itself)", () => {
            const updateSection = extractFunction(actionsSource, "updateDietaryRestriction");

            // Must exclude current item from duplicate check
            expect(updateSection).toContain("existing[0].id !== id");
        });
    });

    describe("Delete protection for in-use options", () => {
        it("should handle foreign key violation for dietary restrictions", () => {
            const deleteSection = extractFunction(actionsSource, "deleteDietaryRestriction");

            // Must check for PostgreSQL FK violation code
            expect(deleteSection).toContain('error.code === "23503"');
            expect(deleteSection).toContain('code: "OPTION_IN_USE"');
        });

        it("should handle foreign key violation for pet species", () => {
            const deleteSection = extractFunction(actionsSource, "deletePetSpecies");

            expect(deleteSection).toContain('error.code === "23503"');
            expect(deleteSection).toContain('code: "OPTION_IN_USE"');
        });

        it("should handle foreign key violation for additional needs", () => {
            const deleteSection = extractFunction(actionsSource, "deleteAdditionalNeed");

            expect(deleteSection).toContain('error.code === "23503"');
            expect(deleteSection).toContain('code: "OPTION_IN_USE"');
        });
    });

    describe("Not found handling on update", () => {
        it("should return NOT_FOUND when updating non-existent dietary restriction", () => {
            const updateSection = extractFunction(actionsSource, "updateDietaryRestriction");

            expect(updateSection).toContain("if (!updated)");
            expect(updateSection).toContain('code: "NOT_FOUND"');
        });

        it("should return NOT_FOUND when updating non-existent pet species", () => {
            const updateSection = extractFunction(actionsSource, "updatePetSpecies");

            expect(updateSection).toContain("if (!updated)");
            expect(updateSection).toContain('code: "NOT_FOUND"');
        });

        it("should return NOT_FOUND when updating non-existent additional need", () => {
            const updateSection = extractFunction(actionsSource, "updateAdditionalNeed");

            expect(updateSection).toContain("if (!updated)");
            expect(updateSection).toContain('code: "NOT_FOUND"');
        });
    });
});

describe("Household Options - Usage Count Queries", () => {
    const actionsPath = join(process.cwd(), "app/[locale]/settings/options/actions.ts");
    const actionsSource = readFileSync(actionsPath, "utf-8");

    it("should count dietary restriction usage via LEFT JOIN", () => {
        const listSection = extractFunction(actionsSource, "listDietaryRestrictions");

        // Must use LEFT JOIN to include unused options (count = 0)
        expect(listSection).toContain(".leftJoin(");
        expect(listSection).toContain("householdDietaryRestrictions");
        // Must cast count to int for TypeScript
        expect(listSection).toContain("::int");
    });

    it("should count pet species usage via LEFT JOIN", () => {
        const listSection = extractFunction(actionsSource, "listPetSpecies");

        expect(listSection).toContain(".leftJoin(");
        expect(listSection).toContain("pets");
        expect(listSection).toContain("::int");
    });

    it("should count additional needs usage via LEFT JOIN", () => {
        const listSection = extractFunction(actionsSource, "listAdditionalNeeds");

        expect(listSection).toContain(".leftJoin(");
        expect(listSection).toContain("householdAdditionalNeeds");
        expect(listSection).toContain("::int");
    });
});

/**
 * Helper to extract a function's code from source
 */
function extractFunction(source: string, functionName: string): string {
    const startIndex = source.indexOf(`export const ${functionName}`);
    if (startIndex === -1) return "";

    // Find the next export or end of file
    const nextExportIndex = source.indexOf("export const", startIndex + 1);
    const endIndex = nextExportIndex === -1 ? source.length : nextExportIndex;

    return source.substring(startIndex, endIndex);
}
