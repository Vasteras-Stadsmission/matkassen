/**
 * Regression Tests: Batch Update Performance
 *
 * CRITICAL: Ensures reorder uses efficient batch update with CASE statement.
 * Prevents regression back to N sequential updates in a loop.
 *
 * If this test fails, reordering will perform poorly with many checklist items.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("ReorderVerificationQuestions - Performance Pattern", () => {
    const actionsPath = join(process.cwd(), "app/[locale]/settings/general/actions.ts");
    const source = readFileSync(actionsPath, "utf-8");

    const reorderSection = source.substring(
        source.indexOf("export const reorderVerificationQuestions"),
    );

    it("should NOT use a for loop for updates", () => {
        // Regression: Must not loop through IDs with sequential updates
        expect(reorderSection).not.toMatch(/for\s*\(/);
        expect(reorderSection).not.toMatch(/\.forEach\s*\(/);
        expect(reorderSection).not.toMatch(/\.map\s*\([^)]*await/); // Avoid awaiting in map
    });

    it("should use SQL CASE statement for batch update", () => {
        // Must use CASE expression for efficient batch update
        expect(reorderSection).toContain("sql`CASE");
        expect(reorderSection).toContain("WHEN");
        expect(reorderSection).toContain("THEN");
    });

    it("should use sql.join for building CASE statements", () => {
        // Must use sql.join to safely combine case statements
        expect(reorderSection).toContain("sql.join");
        expect(reorderSection).toContain("caseStatements");
    });

    it("should use inArray for WHERE IN clause", () => {
        // Must use Drizzle's inArray helper (not raw SQL IN)
        expect(reorderSection).toContain("inArray");
        expect(reorderSection).toContain("inArray(verificationQuestions.id, questionIds)");
    });

    it("should import required SQL helpers", () => {
        // Must import sql and inArray
        expect(source).toContain('from "drizzle-orm"');
        expect(source).toContain("sql");
        expect(source).toContain("inArray");
    });

    it("should handle empty array edge case", () => {
        // Must check for empty array before attempting batch update
        expect(reorderSection).toMatch(/if\s*\([^)]*length\s*===\s*0/);
        expect(reorderSection).toContain("return success(undefined)");
    });

    it("should perform single UPDATE in transaction", () => {
        // Should have only ONE call to update() or execute()
        const updateCalls = (reorderSection.match(/\.update\(/g) || []).length;
        expect(updateCalls).toBe(1);
    });
});
