/**
 * Regression Tests: Active Filtering Static Analysis
 *
 * CRITICAL: Verifies all database queries filter by is_active=true.
 * Prevents accidental exposure of soft-deleted questions to users.
 *
 * If this test fails, deleted questions may appear in the UI.
 *
 * This is a STATIC analysis test - it reads the source code to verify patterns.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Active Filtering Pattern - Static Analysis", () => {
    const actionsPath = path.join(process.cwd(), "app/[locale]/settings/general/actions.ts");
    const source = fs.readFileSync(actionsPath, "utf-8");

    it("listVerificationQuestions should filter by is_active", () => {
        const listSection = source.substring(
            source.indexOf("export const listVerificationQuestions"),
            source.indexOf("export const createVerificationQuestion"),
        );

        // Should filter by is_active=true with eq() function
        expect(listSection).toContain("is_active");
        expect(listSection).toContain("eq(verificationQuestions.is_active, true)");
    });

    it("updateVerificationQuestion should filter by is_active", () => {
        const updateSection = source.substring(
            source.indexOf("export const updateVerificationQuestion"),
            source.indexOf("export const deleteVerificationQuestion"),
        );

        // Should use and() with id AND is_active
        expect(updateSection).toContain("and(");
        expect(updateSection).toContain("eq(verificationQuestions.is_active, true)");
    });

    it("deleteVerificationQuestion should filter by is_active (soft delete)", () => {
        const deleteSection = source.substring(
            source.indexOf("export const deleteVerificationQuestion"),
            source.indexOf("export const reorderVerificationQuestions"),
        );

        // Should set is_active=false (soft delete)
        expect(deleteSection).toContain("is_active: false");
        // And should filter the WHERE clause by is_active=true
        expect(deleteSection).toContain("and(");
        expect(deleteSection).toContain("eq(verificationQuestions.is_active, true)");
    });

    it("reorderVerificationQuestions should filter by is_active", () => {
        const reorderSection = source.substring(
            source.indexOf("export const reorderVerificationQuestions"),
        );

        // Should filter updates by is_active=true
        expect(reorderSection).toContain("eq(verificationQuestions.is_active, true)");
    });

    it("should import eq and and from drizzle-orm", () => {
        // Must import these operators for filtering
        expect(source).toContain('from "drizzle-orm"');
        expect(source).toContain("eq");
        expect(source).toContain("and");
    });

    it("should use consistent is_active column reference", () => {
        // All references should use verificationQuestions.is_active
        const matches = source.match(/verificationQuestions\.is_active/g);
        expect(matches).toBeTruthy();
        expect(matches!.length).toBeGreaterThan(3); // At least 4 actions use it
    });
});
