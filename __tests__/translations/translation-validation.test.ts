/**
 * Translation validation tests
 * Ensures all translation files have valid JSON syntax and complete key coverage
 */

import { describe, test, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Configuration
const MESSAGES_DIR = join(process.cwd(), "messages");
const BASE_LOCALE = "en";
const LOCALES = ["sv", "en"];

/**
 * Recursively flattens a nested object into dot-notation keys
 */
function flattenKeys(obj: Record<string, any>, prefix = ""): string[] {
    const keys: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            keys.push(...flattenKeys(value, fullKey));
        } else {
            keys.push(fullKey);
        }
    }

    return keys;
}

/**
 * Loads and parses a JSON translation file
 */
function loadTranslationFile(locale: string): Record<string, any> | null {
    const filePath = join(MESSAGES_DIR, `${locale}.json`);

    if (!existsSync(filePath)) {
        return null;
    }

    const content = readFileSync(filePath, "utf8");
    return JSON.parse(content);
}

/**
 * Validates JSON syntax of a translation file
 */
function validateJsonSyntax(locale: string): { valid: boolean; error?: string } {
    const filePath = join(MESSAGES_DIR, `${locale}.json`);

    if (!existsSync(filePath)) {
        return { valid: false, error: `Translation file ${locale}.json not found` };
    }

    try {
        const content = readFileSync(filePath, "utf8");
        JSON.parse(content);
        return { valid: true };
    } catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : String(error) };
    }
}

describe("Translation Files", () => {
    describe("JSON Syntax Validation", () => {
        LOCALES.forEach(locale => {
            test(`${locale}.json should have valid JSON syntax`, () => {
                const result = validateJsonSyntax(locale);
                expect(result.valid).toBe(true);
                if (!result.valid) {
                    throw new Error(`Invalid JSON in ${locale}.json: ${result.error}`);
                }
            });
        });

        test("All required translation files should exist", () => {
            LOCALES.forEach(locale => {
                const filePath = join(MESSAGES_DIR, `${locale}.json`);
                expect(existsSync(filePath)).toBe(true);
            });
        });
    });

    describe("Translation Key Completeness", () => {
        test("All locales should have the same translation keys as base locale", () => {
            const baseTranslations = loadTranslationFile(BASE_LOCALE);
            expect(baseTranslations).not.toBeNull();

            const baseKeys = flattenKeys(baseTranslations!).sort();
            expect(baseKeys.length).toBeGreaterThan(0);

            const targetLocales = LOCALES.filter(locale => locale !== BASE_LOCALE);

            targetLocales.forEach(locale => {
                const translations = loadTranslationFile(locale);
                expect(translations).not.toBeNull();

                const localeKeys = flattenKeys(translations!).sort();

                // Find missing keys (in base but not in target)
                const missingKeys = baseKeys.filter(key => !localeKeys.includes(key));

                // Report missing keys with detailed error message
                if (missingKeys.length > 0) {
                    const errorMessage = [
                        `Missing ${missingKeys.length} translation keys in ${locale}.json:`,
                        ...missingKeys.map(key => `  - ${key}`),
                        "",
                        `Base locale (${BASE_LOCALE}) has ${baseKeys.length} keys, ${locale} has ${localeKeys.length} keys`,
                    ].join("\n");

                    throw new Error(errorMessage);
                }

                // Find extra keys (in target but not in base) - these are warnings, not failures
                const extraKeys = localeKeys.filter(key => !baseKeys.includes(key));
                if (extraKeys.length > 0) {
                    console.warn(
                        `Warning: ${locale}.json has ${extraKeys.length} extra keys:`,
                        extraKeys.map(key => `  + ${key}`).join("\n"),
                    );
                }
            });
        });

        test("Base locale should have reasonable number of translation keys", () => {
            const baseTranslations = loadTranslationFile(BASE_LOCALE);
            expect(baseTranslations).not.toBeNull();

            const baseKeys = flattenKeys(baseTranslations!);

            // Expect at least 100 translation keys (adjust based on your app's needs)
            expect(baseKeys.length).toBeGreaterThan(100);

            // Expect no duplicate keys (this should always pass with our flattening logic)
            const uniqueKeys = [...new Set(baseKeys)];
            expect(uniqueKeys.length).toBe(baseKeys.length);
        });

        test("All translation values should be non-empty strings", () => {
            LOCALES.forEach(locale => {
                const translations = loadTranslationFile(locale);
                expect(translations).not.toBeNull();

                const checkValues = (obj: Record<string, any>, path = ""): void => {
                    for (const [key, value] of Object.entries(obj)) {
                        const fullPath = path ? `${path}.${key}` : key;

                        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                            checkValues(value, fullPath);
                        } else if (typeof value === "string") {
                            expect(value.trim()).not.toBe("");
                            if (value.trim() === "") {
                                throw new Error(
                                    `Empty translation value at ${fullPath} in ${locale}.json`,
                                );
                            }
                        } else {
                            throw new Error(
                                `Invalid translation value type at ${fullPath} in ${locale}.json: expected string, got ${typeof value}`,
                            );
                        }
                    }
                };

                checkValues(translations!);
            });
        });
    });

    describe("Translation Structure Validation", () => {
        test("All translation files should have consistent structure", () => {
            const baseTranslations = loadTranslationFile(BASE_LOCALE);
            expect(baseTranslations).not.toBeNull();

            // Get the top-level keys (main sections) from base locale
            const baseTopLevelKeys = Object.keys(baseTranslations!).sort();

            const targetLocales = LOCALES.filter(locale => locale !== BASE_LOCALE);

            targetLocales.forEach(locale => {
                const translations = loadTranslationFile(locale);
                expect(translations).not.toBeNull();

                const localeTopLevelKeys = Object.keys(translations!).sort();

                // Check that all top-level sections exist
                const missingTopLevel = baseTopLevelKeys.filter(
                    key => !localeTopLevelKeys.includes(key),
                );

                if (missingTopLevel.length > 0) {
                    throw new Error(
                        `Missing top-level sections in ${locale}.json: ${missingTopLevel.join(", ")}`,
                    );
                }
            });
        });

        test("No translation keys should contain placeholder patterns without values", () => {
            LOCALES.forEach(locale => {
                const translations = loadTranslationFile(locale);
                expect(translations).not.toBeNull();

                const checkForMalformedPlaceholders = (
                    obj: Record<string, any>,
                    path = "",
                ): void => {
                    for (const [key, value] of Object.entries(obj)) {
                        const fullPath = path ? `${path}.${key}` : key;

                        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                            checkForMalformedPlaceholders(value, fullPath);
                        } else if (typeof value === "string") {
                            // Check for common placeholder patterns that might indicate missing translations
                            const suspiciousPatterns = [
                                /\{\{\s*\}\}/, // Empty {{ }}
                                /\{\s*\}/, // Empty { }
                                /\[.*missing.*\]/i, // [missing] indicators
                                /TODO/i, // TODO markers
                                /FIXME/i, // FIXME markers
                            ];

                            suspiciousPatterns.forEach(pattern => {
                                if (pattern.test(value)) {
                                    throw new Error(
                                        `Suspicious placeholder pattern found at ${fullPath} in ${locale}.json: "${value}"`,
                                    );
                                }
                            });
                        }
                    }
                };

                checkForMalformedPlaceholders(translations!);
            });
        });
    });
});
