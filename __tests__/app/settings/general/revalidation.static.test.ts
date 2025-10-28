/**
 * Regression Tests: Revalidation Static Analysis
 *
 * CRITICAL: Verifies the revalidation pattern is correctly implemented.
 * Prevents the bug where revalidatePath used bracket placeholders "/[locale]/..."
 * instead of looping through actual locales.
 *
 * If this test fails, cache will not be invalidated and users will see stale data.
 *
 * This is a STATIC analysis test - it reads the source code to verify patterns.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Revalidation Pattern - Static Analysis", () => {
    const actionsPath = path.join(process.cwd(), "app/[locale]/settings/general/actions.ts");
    const source = fs.readFileSync(actionsPath, "utf-8");

    it("should have revalidateSettingsPage helper function", () => {
        // Helper should exist and iterate over locales
        expect(source).toContain("function revalidateSettingsPage()");
        expect(source).toContain("routing.locales.forEach");
        expect(source).toContain("revalidatePath");
    });

    it("should NOT use bracket placeholder in revalidation", () => {
        // Should NEVER call revalidatePath with [locale] placeholder
        expect(source).not.toContain('revalidatePath("/[locale]/settings/general"');
        expect(source).not.toContain("revalidatePath(`/[locale]/settings/general`");
    });

    it("should use locale variable in template literal", () => {
        // Should use ${locale} in template literal for dynamic paths
        expect(source).toMatch(/revalidatePath\(`\/\$\{locale\}\/settings\/general`/);
    });

    it("should call helper in all mutation actions", () => {
        // All 4 actions should call the helper
        const createSection = source.substring(
            source.indexOf("export const createVerificationQuestion"),
            source.indexOf("export const updateVerificationQuestion"),
        );
        const updateSection = source.substring(
            source.indexOf("export const updateVerificationQuestion"),
            source.indexOf("export const deleteVerificationQuestion"),
        );
        const deleteSection = source.substring(
            source.indexOf("export const deleteVerificationQuestion"),
            source.indexOf("export const reorderVerificationQuestions"),
        );
        const reorderSection = source.substring(
            source.indexOf("export const reorderVerificationQuestions"),
        );

        expect(createSection).toContain("revalidateSettingsPage()");
        expect(updateSection).toContain("revalidateSettingsPage()");
        expect(deleteSection).toContain("revalidateSettingsPage()");
        expect(reorderSection).toContain("revalidateSettingsPage()");
    });

    it("should import routing from i18n config", () => {
        // Must import routing to get locale list
        expect(source).toContain('from "@/app/i18n/routing"');
        expect(source).toContain("routing");
    });
});
