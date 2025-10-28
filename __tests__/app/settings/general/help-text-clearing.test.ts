/**
 * Regression Tests: Help Text Clearing
 *
 * CRITICAL: Ensures users can clear help text by submitting empty strings.
 * Prevents the bug where empty help text becomes undefined and skips the update.
 *
 * If this test fails, users cannot remove outdated help text from questions.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("EnrollmentChecklist - Help Text Clearing", () => {
    const componentPath = join(
        process.cwd(),
        "app/[locale]/settings/general/components/EnrollmentChecklist.tsx",
    );
    const componentSource = readFileSync(componentPath, "utf-8");

    it("should NOT coerce empty help text to undefined", () => {
        // Regression: Must not use || undefined for help text fields
        // This prevents clearing help text (server skips undefined values)
        expect(componentSource).not.toContain("help_text_sv: formData.help_text_sv || undefined");
        expect(componentSource).not.toContain("help_text_en: formData.help_text_en || undefined");
    });

    it("should send help text fields directly to server", () => {
        // Find the handleSubmit function
        const handleSubmitMatch = componentSource.match(
            /const handleSubmit = async[\s\S]*?const data = \{[\s\S]*?\};/,
        );
        expect(handleSubmitMatch).toBeTruthy();

        const dataObject = handleSubmitMatch![0];

        // Should send help text fields as-is (empty strings are valid)
        expect(dataObject).toMatch(/help_text_sv:\s*formData\.help_text_sv/);
        expect(dataObject).toMatch(/help_text_en:\s*formData\.help_text_en/);
    });
});

describe("Settings Actions - Help Text Handling", () => {
    const actionsPath = join(process.cwd(), "app/[locale]/settings/general/actions.ts");
    const actionsSource = readFileSync(actionsPath, "utf-8");

    it("should convert empty help text to null in server action", () => {
        // Find the updateVerificationQuestion function
        const updateSection = actionsSource.substring(
            actionsSource.indexOf("export const updateVerificationQuestion"),
            actionsSource.indexOf("export const deleteVerificationQuestion"),
        );

        // Server should handle empty strings by converting to null
        expect(updateSection).toContain("data.help_text_sv?.trim() || null");
        expect(updateSection).toContain("data.help_text_en?.trim() || null");
    });

    it("should update help text when defined (including empty strings)", () => {
        const updateSection = actionsSource.substring(
            actionsSource.indexOf("export const updateVerificationQuestion"),
            actionsSource.indexOf("export const deleteVerificationQuestion"),
        );

        // Should check !== undefined (allows empty strings through)
        expect(updateSection).toContain("if (data.help_text_sv !== undefined)");
        expect(updateSection).toContain("if (data.help_text_en !== undefined)");
    });
});
