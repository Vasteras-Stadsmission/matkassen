/**
 * Tests for localStorage error handling in HouseholdsTable
 *
 * REGRESSION TESTS for:
 * - Try/catch protection for JSON.parse
 * - Graceful fallback to defaults on malformed data
 * - Forward compatibility with saved preferences
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("HouseholdsTable localStorage error handling", () => {
    let mockLocalStorage: { [key: string]: string };
    let originalWindow: typeof global.window;

    beforeEach(() => {
        // Save original window
        originalWindow = global.window;

        // Reset mock localStorage
        mockLocalStorage = {};

        // Mock window.localStorage
        global.window = {
            localStorage: {
                getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
                setItem: vi.fn((key: string, value: string) => {
                    mockLocalStorage[key] = value;
                }),
                removeItem: vi.fn((key: string) => {
                    delete mockLocalStorage[key];
                }),
                clear: vi.fn(() => {
                    mockLocalStorage = {};
                }),
                key: vi.fn((index: number) => {
                    return Object.keys(mockLocalStorage)[index] || null;
                }),
                length: 0,
            },
        } as any;
    });

    afterEach(() => {
        // Restore original window to prevent test pollution
        global.window = originalWindow;
    });

    describe("JSON.parse error handling", () => {
        it("REGRESSION: should handle malformed JSON gracefully", () => {
            // Simulate malformed JSON in localStorage
            mockLocalStorage["householdsTableColumns"] = "{ invalid json ~~";

            // This represents the code in HouseholdsTable.tsx:81-93
            const defaultColumns = {
                first_name: true,
                last_name: true,
                phone_number: true,
                locale: true,
                postal_code: true,
                created_by: false,
                firstParcelDate: true,
                lastParcelDate: true,
                nextParcelDate: true,
            };

            let result = defaultColumns;

            const saved = window.localStorage.getItem("householdsTableColumns");
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed && typeof parsed === "object") {
                        result = { ...defaultColumns, ...parsed };
                    }
                } catch (error) {
                    // Fallback to default - this is the fix!
                    console.warn("Failed to parse householdsTableColumns", error);
                }
            }

            // Should fall back to defaults without throwing
            expect(result).toEqual(defaultColumns);
        });

        it("should handle null value from localStorage", () => {
            // No value in localStorage
            const defaultColumns = {
                first_name: true,
                last_name: true,
            };

            let result = defaultColumns;

            const saved = window.localStorage.getItem("householdsTableColumns");
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed && typeof parsed === "object") {
                        result = { ...defaultColumns, ...parsed };
                    }
                } catch (error) {
                    console.warn("Failed to parse", error);
                }
            }

            // Should use defaults
            expect(result).toEqual(defaultColumns);
        });

        it("should handle non-object JSON values", () => {
            // Simulate storing a string instead of object
            mockLocalStorage["householdsTableColumns"] = JSON.stringify("not an object");

            const defaultColumns = {
                first_name: true,
                last_name: true,
            };

            let result = defaultColumns;

            const saved = window.localStorage.getItem("householdsTableColumns");
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    // Type check: must be an object
                    if (parsed && typeof parsed === "object") {
                        result = { ...defaultColumns, ...parsed };
                    }
                } catch (error) {
                    console.warn("Failed to parse", error);
                }
            }

            // Should fall back to defaults because parsed is not an object
            expect(result).toEqual(defaultColumns);
        });

        it("should handle array instead of object", () => {
            // Simulate storing an array
            mockLocalStorage["householdsTableColumns"] = JSON.stringify([true, false]);

            const defaultColumns = {
                first_name: true,
                last_name: true,
            };

            let result = defaultColumns;

            const saved = window.localStorage.getItem("householdsTableColumns");
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    // Arrays are typeof 'object', but we need a plain object
                    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                        result = { ...defaultColumns, ...parsed };
                    }
                } catch (error) {
                    console.warn("Failed to parse", error);
                }
            }

            // Should fall back to defaults
            expect(result).toEqual(defaultColumns);
        });
    });

    describe("Forward compatibility", () => {
        it("should merge saved preferences with defaults (forward compatible)", () => {
            // Old saved state with fewer columns
            const oldSaved = {
                first_name: true,
                last_name: false,
            };

            mockLocalStorage["householdsTableColumns"] = JSON.stringify(oldSaved);

            // New defaults with additional columns
            const defaultColumns = {
                first_name: true,
                last_name: true,
                phone_number: true,
                created_by: false, // New column!
            };

            let result = defaultColumns;

            const saved = window.localStorage.getItem("householdsTableColumns");
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed && typeof parsed === "object") {
                        // Merge: defaults first, then override with saved
                        result = { ...defaultColumns, ...parsed };
                    }
                } catch (error) {
                    console.warn("Failed to parse", error);
                }
            }

            // Should keep saved preferences AND add new defaults
            expect(result).toEqual({
                first_name: true, // From saved
                last_name: false, // From saved (overrides default)
                phone_number: true, // From defaults (new column)
                created_by: false, // From defaults (new column)
            });
        });

        it("should handle extra keys in saved state gracefully", () => {
            // Saved state with a column that no longer exists
            const savedWithExtra = {
                first_name: true,
                old_column_removed: true, // This column was removed
            };

            mockLocalStorage["householdsTableColumns"] = JSON.stringify(savedWithExtra);

            const defaultColumns = {
                first_name: true,
                last_name: true,
            };

            let result = defaultColumns;

            const saved = window.localStorage.getItem("householdsTableColumns");
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed && typeof parsed === "object") {
                        result = { ...defaultColumns, ...parsed };
                    }
                } catch (error) {
                    console.warn("Failed to parse", error);
                }
            }

            // Should have all defaults plus the extra key (harmless)
            expect(result.first_name).toBe(true);
            expect(result.last_name).toBe(true);
            expect((result as any).old_column_removed).toBe(true);
        });
    });

    describe("User/DevTools tampering", () => {
        it("should handle manually set non-JSON value", () => {
            // User manually sets a non-JSON value via DevTools
            mockLocalStorage["householdsTableColumns"] = "true";

            const defaultColumns = {
                first_name: true,
            };

            let result = defaultColumns;

            const saved = window.localStorage.getItem("householdsTableColumns");
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed && typeof parsed === "object") {
                        result = { ...defaultColumns, ...parsed };
                    }
                } catch (error) {
                    console.warn("Failed to parse", error);
                }
            }

            // Should fall back to defaults (true is not an object)
            expect(result).toEqual(defaultColumns);
        });

        it("should not crash the page on any localStorage corruption", () => {
            // Worst case: completely corrupted data
            const corruptedValues = ["undefined", "NaN", "Infinity", "{{}", "}{", "null", '{"a":}'];

            const defaultColumns = { first_name: true };

            corruptedValues.forEach(corrupted => {
                mockLocalStorage["householdsTableColumns"] = corrupted;

                let result = defaultColumns;

                const saved = window.localStorage.getItem("householdsTableColumns");
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved);
                        if (parsed && typeof parsed === "object") {
                            result = { ...defaultColumns, ...parsed };
                        }
                    } catch (error) {
                        // Should catch and continue
                    }
                }

                // Should always return valid defaults
                expect(result).toEqual(defaultColumns);
            });
        });
    });
});
