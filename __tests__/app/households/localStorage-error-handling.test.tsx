/**
 * Tests for localStorage error handling in HouseholdsTable
 *
 * REGRESSION TESTS for:
 * - Try/catch protection for JSON.parse
 * - Graceful fallback to defaults on malformed data
 * - Forward compatibility with saved preferences
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useState, useEffect } from "react";

// Extract the localStorage initialization logic from HouseholdsTable
// This matches the actual implementation in HouseholdsTable.tsx:67-98
type ColumnKey =
    | "first_name"
    | "last_name"
    | "phone_number"
    | "locale"
    | "postal_code"
    | "created_by"
    | "firstParcelDate"
    | "lastParcelDate"
    | "nextParcelDate";

function useColumnVisibilityWithStorage() {
    return useState<Record<ColumnKey, boolean>>(() => {
        // Default visibility (matches HouseholdsTable.tsx:69-79)
        const defaultColumns = {
            first_name: true,
            last_name: true,
            phone_number: true,
            locale: true,
            postal_code: true,
            created_by: false, // Hidden by default
            firstParcelDate: true,
            lastParcelDate: true,
            nextParcelDate: true,
        };

        // This is the ACTUAL logic from HouseholdsTable.tsx:81-95
        if (typeof window !== "undefined") {
            try {
                const saved = localStorage.getItem("householdsTableColumns");
                if (saved) {
                    const parsed = JSON.parse(saved);
                    // Validate that parsed value is a plain object (not array, not null)
                    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
                        return { ...defaultColumns, ...parsed };
                    }
                }
            } catch (error) {
                // Storage access error (Safari private mode) or invalid JSON
                console.warn("Failed to load column preferences from localStorage", error);
            }
        }

        return defaultColumns;
    });
}

describe("HouseholdsTable localStorage error handling", () => {
    let mockLocalStorage: { [key: string]: string };
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        // Reset mock localStorage
        mockLocalStorage = {};

        // Mock window.localStorage
        Object.defineProperty(window, "localStorage", {
            value: {
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
                length: Object.keys(mockLocalStorage).length,
            },
            writable: true,
            configurable: true,
        });

        consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        consoleWarnSpy.mockRestore();
        vi.clearAllMocks();
    });

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

    describe("JSON.parse error handling", () => {
        it("REGRESSION: should handle malformed JSON gracefully", () => {
            // Simulate malformed JSON in localStorage
            mockLocalStorage["householdsTableColumns"] = "{ invalid json ~~";

            const { result } = renderHook(() => useColumnVisibilityWithStorage());
            const [visibleColumns] = result.current;

            // Should fall back to defaults without throwing
            expect(visibleColumns).toEqual(defaultColumns);
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                "Failed to load column preferences from localStorage",
                expect.any(Error),
            );
        });

        it("should handle null value from localStorage", () => {
            // No value in localStorage - getItem returns null
            const { result } = renderHook(() => useColumnVisibilityWithStorage());
            const [visibleColumns] = result.current;

            // Should use defaults
            expect(visibleColumns).toEqual(defaultColumns);
        });

        it("should handle non-object JSON values", () => {
            // Simulate storing a string instead of object
            mockLocalStorage["householdsTableColumns"] = JSON.stringify("not an object");

            const { result } = renderHook(() => useColumnVisibilityWithStorage());
            const [visibleColumns] = result.current;

            // Should fall back to defaults because parsed is not an object
            expect(visibleColumns).toEqual(defaultColumns);
        });

        it("should handle array instead of object", () => {
            // Simulate storing an array
            mockLocalStorage["householdsTableColumns"] = JSON.stringify([true, false]);

            const { result } = renderHook(() => useColumnVisibilityWithStorage());
            const [visibleColumns] = result.current;

            // Should fall back to defaults (arrays are filtered by !Array.isArray check)
            expect(visibleColumns).toEqual(defaultColumns);
        });

        it("should handle JSON null value", () => {
            // Simulate storing JSON null
            mockLocalStorage["householdsTableColumns"] = JSON.stringify(null);

            const { result } = renderHook(() => useColumnVisibilityWithStorage());
            const [visibleColumns] = result.current;

            // Should fall back to defaults (null is filtered out)
            expect(visibleColumns).toEqual(defaultColumns);
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

            const { result } = renderHook(() => useColumnVisibilityWithStorage());
            const [visibleColumns] = result.current;

            // Should keep saved preferences AND add new defaults
            expect(visibleColumns).toEqual({
                first_name: true, // From saved
                last_name: false, // From saved (overrides default)
                phone_number: true, // From defaults (new column)
                locale: true,
                postal_code: true,
                created_by: false, // From defaults (new column)
                firstParcelDate: true,
                lastParcelDate: true,
                nextParcelDate: true,
            });
        });

        it("should handle extra keys in saved state gracefully", () => {
            // Saved state with a column that no longer exists
            const savedWithExtra = {
                first_name: true,
                old_column_removed: true, // This column was removed
            };

            mockLocalStorage["householdsTableColumns"] = JSON.stringify(savedWithExtra);

            const { result } = renderHook(() => useColumnVisibilityWithStorage());
            const [visibleColumns] = result.current;

            // Should have all defaults plus the extra key (harmless)
            expect(visibleColumns.first_name).toBe(true);
            expect(visibleColumns.last_name).toBe(true);
            expect((visibleColumns as any).old_column_removed).toBe(true);
        });

        it("should use valid saved preferences when localStorage is accessible", () => {
            const savedPreferences = {
                first_name: false,
                last_name: true,
                phone_number: false,
                locale: true,
                postal_code: false,
                created_by: true, // User enabled this column
                firstParcelDate: false,
                lastParcelDate: true,
                nextParcelDate: false,
            };

            mockLocalStorage["householdsTableColumns"] = JSON.stringify(savedPreferences);

            const { result } = renderHook(() => useColumnVisibilityWithStorage());
            const [visibleColumns] = result.current;

            expect(visibleColumns).toEqual(savedPreferences);
        });
    });

    describe("User/DevTools tampering", () => {
        it("should handle manually set non-JSON value", () => {
            // User manually sets a non-JSON value via DevTools
            mockLocalStorage["householdsTableColumns"] = "true";

            const { result } = renderHook(() => useColumnVisibilityWithStorage());
            const [visibleColumns] = result.current;

            // JSON.parse("true") returns boolean true, which is not an object
            // So it falls back to defaults (without throwing, so no console.warn)
            expect(visibleColumns).toEqual(defaultColumns);
        });

        it("should not crash on any localStorage corruption", () => {
            // Worst case: completely corrupted data
            const corruptedValues = ["undefined", "NaN", "Infinity", "{{}", "}{", '{"a":}'];

            corruptedValues.forEach(corrupted => {
                mockLocalStorage["householdsTableColumns"] = corrupted;

                // Should not throw
                const { result } = renderHook(() => useColumnVisibilityWithStorage());
                const [visibleColumns] = result.current;

                // Should always return valid defaults
                expect(visibleColumns).toEqual(defaultColumns);
            });
        });
    });
});
