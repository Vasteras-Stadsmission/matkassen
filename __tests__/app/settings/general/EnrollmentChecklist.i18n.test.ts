/**
 * Regression Tests: i18n Coverage
 *
 * CRITICAL: Ensures no hardcoded English strings in EnrollmentChecklist component.
 * Prevents breaking multi-language UX.
 *
 * If this test fails, non-English users will see English text or broken UI.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("EnrollmentChecklist - i18n Coverage", () => {
    const componentPath = join(
        process.cwd(),
        "app/[locale]/settings/general/components/EnrollmentChecklist.tsx",
    );
    const componentSource = readFileSync(componentPath, "utf-8");

    it("should not contain hardcoded English notification titles", () => {
        // These were the regression - hardcoded "Error" and "Success"
        const hardcodedTitles = [/title:\s*["']Error["']/, /title:\s*["']Success["']/];

        hardcodedTitles.forEach(pattern => {
            expect(componentSource).not.toMatch(pattern);
        });

        // Should use translations instead
        expect(componentSource).toContain('t("notifications.error")');
        expect(componentSource).toContain('t("notifications.success")');
    });

    it("should not contain hardcoded error messages", () => {
        // These were the regression - hardcoded fallback errors
        const hardcodedErrors = [
            "Failed to load verification questions",
            "Failed to save question",
            "Failed to delete question",
            "Failed to reorder questions",
        ];

        hardcodedErrors.forEach(text => {
            // Should not appear as literal strings
            expect(componentSource).not.toContain(`"${text}"`);
            expect(componentSource).not.toContain(`'${text}'`);
        });

        // Should use translation keys instead
        expect(componentSource).toContain('t("notifications.loadError")');
        expect(componentSource).toContain('t("notifications.saveError")');
        expect(componentSource).toContain('t("notifications.deleteError")');
        expect(componentSource).toContain('t("notifications.reorderError")');
    });

    it("should not contain hardcoded example text", () => {
        // These were the regression - hardcoded example bullets
        const hardcodedExamples = [
            "They have been told about pickup times and location",
            "They understand the monthly parcel limit",
            "I have verified their identity document",
            "They have been informed about dietary restriction options",
        ];

        hardcodedExamples.forEach(text => {
            // Should not appear as literal strings
            expect(componentSource).not.toContain(text);
        });

        // Should use translation keys instead
        expect(componentSource).toContain('t("examples.item1")');
        expect(componentSource).toContain('t("examples.item2")');
        expect(componentSource).toContain('t("examples.item3")');
        expect(componentSource).toContain('t("examples.item4")');
    });

    it("should not contain hardcoded placeholder text", () => {
        // These were the regression - hardcoded textarea placeholders
        const hardcodedPlaceholders = ["Optional help text..."];

        hardcodedPlaceholders.forEach(text => {
            // Should not appear as literal strings
            expect(componentSource).not.toContain(`"${text}"`);
            expect(componentSource).not.toContain(`'${text}'`);
        });

        // Should use translation keys instead (simplified to single language)
        expect(componentSource).toContain('t("form.helpTextPlaceholder")');
    });

    it("should use useTranslations hook", () => {
        // Must have the translation hook
        expect(componentSource).toContain('useTranslations("settings.enrollmentChecklist")');
    });

    it("should not have any common hardcoded English words in JSX", () => {
        // Common words that indicate untranslated UI
        const suspiciousPatterns = [
            // Direct JSX text nodes (not in comments)
            />\s*Error\s*</,
            />\s*Success\s*</,
            />\s*Failed to\s+/,
            />\s*Loading\.\.\.\s*</,
            />\s*Delete\s+this\s+/,
            />\s*Are you sure\s+/,
        ];

        suspiciousPatterns.forEach(pattern => {
            const match = componentSource.match(pattern);
            if (match) {
                // Exclude code comments
                const context = componentSource.slice(
                    Math.max(0, (match.index ?? 0) - 50),
                    Math.min(componentSource.length, (match.index ?? 0) + 50),
                );
                if (!context.includes("//") && !context.includes("/*")) {
                    throw new Error(
                        `Found potential hardcoded English text: "${match[0]}"\nContext: ${context}`,
                    );
                }
            }
        });
    });
});
