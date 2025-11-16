/**
 * Integration tests for HouseholdsTable localStorage functionality
 *
 * These tests actually render the HouseholdsTable component and verify
 * that localStorage error handling works in the real component.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MantineProvider } from "@mantine/core";

// Mock next-intl
vi.mock("next-intl", () => ({
    useTranslations: () => (key: string) => key,
    useLocale: () => "sv",
}));

// Mock navigation
vi.mock("@/app/i18n/navigation", () => ({
    useRouter: () => ({
        push: vi.fn(),
    }),
}));

// Mock Mantine DataTable to avoid complex rendering
vi.mock("mantine-datatable", () => ({
    DataTable: ({ columns, records }: any) => (
        <div data-testid="data-table">
            <div data-testid="column-count">{columns?.length || 0}</div>
            <div data-testid="record-count">{records?.length || 0}</div>
        </div>
    ),
}));

// Import the actual component
import HouseholdsTable from "@/app/[locale]/households/components/HouseholdsTable";

// Helper to render with Mantine Provider
const renderWithMantine = (component: React.ReactElement) => {
    return render(<MantineProvider>{component}</MantineProvider>);
};

describe("HouseholdsTable - localStorage Integration Tests", () => {
    let mockLocalStorage: { [key: string]: string };
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    const mockHouseholds = [
        {
            id: "1",
            first_name: "Test",
            last_name: "User",
            phone_number: "0701234567",
            locale: "sv",
            postal_code: "12345",
            created_by: "testuser",
            firstParcelDate: new Date("2025-01-01"),
            lastParcelDate: new Date("2025-12-31"),
            nextParcelDate: new Date("2025-06-15"),
            nextParcelEarliestTime: new Date("2025-06-15T10:00:00"),
        },
    ];

    beforeEach(() => {
        mockLocalStorage = {};

        // Mock localStorage
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
                key: vi.fn((index: number) => Object.keys(mockLocalStorage)[index] || null),
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

    describe("Real component localStorage error handling", () => {
        it("REGRESSION: should render with malformed JSON in localStorage", async () => {
            // Set malformed JSON
            mockLocalStorage["householdsTableColumns"] = "{ invalid json ~~";

            // This should NOT throw - component should gracefully fall back to defaults
            const { container } = renderWithMantine(<HouseholdsTable households={mockHouseholds} />);

            // Wait for component to stabilize
            await waitFor(() => {
                expect(container.querySelector('[data-testid="data-table"]')).toBeTruthy();
            });

            // Verify console.warn was called
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                "Failed to load column preferences from localStorage",
                expect.any(Error),
            );

            // Verify component renders (doesn't crash)
            expect(screen.getByTestId("data-table")).toBeTruthy();
        });

        it("should render with valid localStorage data", async () => {
            // Set valid localStorage data
            const savedColumns = {
                first_name: false,
                last_name: true,
                phone_number: true,
                locale: false,
                postal_code: true,
                created_by: true,
                firstParcelDate: true,
                lastParcelDate: false,
                nextParcelDate: true,
            };

            mockLocalStorage["householdsTableColumns"] = JSON.stringify(savedColumns);

            const { container} = renderWithMantine(<HouseholdsTable households={mockHouseholds} />);

            await waitFor(() => {
                expect(container.querySelector('[data-testid="data-table"]')).toBeTruthy();
            });

            // No console warnings should be logged
            expect(consoleWarnSpy).not.toHaveBeenCalled();

            // Component renders successfully
            expect(screen.getByTestId("data-table")).toBeTruthy();
        });

        it("should handle non-object JSON values gracefully", async () => {
            // localStorage contains a string instead of object
            mockLocalStorage["householdsTableColumns"] = JSON.stringify("not an object");

            const { container} = renderWithMantine(<HouseholdsTable households={mockHouseholds} />);

            await waitFor(() => {
                expect(container.querySelector('[data-testid="data-table"]')).toBeTruthy();
            });

            // Should not crash, falls back to defaults (no warning because JSON parses successfully)
            expect(screen.getByTestId("data-table")).toBeTruthy();
        });

        it("should handle array instead of object gracefully", async () => {
            mockLocalStorage["householdsTableColumns"] = JSON.stringify([true, false, true]);

            const { container} = renderWithMantine(<HouseholdsTable households={mockHouseholds} />);

            await waitFor(() => {
                expect(container.querySelector('[data-testid="data-table"]')).toBeTruthy();
            });

            // Should render without crashing
            expect(screen.getByTestId("data-table")).toBeTruthy();
        });

        it("should handle null JSON value gracefully", async () => {
            mockLocalStorage["householdsTableColumns"] = JSON.stringify(null);

            const { container} = renderWithMantine(<HouseholdsTable households={mockHouseholds} />);

            await waitFor(() => {
                expect(container.querySelector('[data-testid="data-table"]')).toBeTruthy();
            });

            expect(screen.getByTestId("data-table")).toBeTruthy();
        });

        it("should handle completely corrupted data without crashing", async () => {
            const corruptedValues = ["{{}", "}{", '{"a":}', "undefined", "NaN"];

            for (const corrupted of corruptedValues) {
                mockLocalStorage["householdsTableColumns"] = corrupted;

                // Clear previous render
                document.body.innerHTML = "";

                const { container} = renderWithMantine(<HouseholdsTable households={mockHouseholds} />);

                await waitFor(() => {
                    expect(container.querySelector('[data-testid="data-table"]')).toBeTruthy();
                });

                // Should render despite corruption
                expect(screen.getByTestId("data-table")).toBeTruthy();
            }
        });
    });

    describe("Forward compatibility", () => {
        it("should merge saved preferences with defaults (forward compatible)", async () => {
            // Old saved state with fewer columns
            const oldSaved = {
                first_name: true,
                last_name: false,
            };

            mockLocalStorage["householdsTableColumns"] = JSON.stringify(oldSaved);

            const { container} = renderWithMantine(<HouseholdsTable households={mockHouseholds} />);

            await waitFor(() => {
                expect(container.querySelector('[data-testid="data-table"]')).toBeTruthy();
            });

            // After component stabilizes, check that localStorage was updated with merged data
            await waitFor(() => {
                const savedData = mockLocalStorage["householdsTableColumns"];
                if (savedData) {
                    const parsed = JSON.parse(savedData);
                    // Should have old preferences plus new defaults
                    expect(parsed.first_name).toBe(true); // From old save
                    expect(parsed.last_name).toBe(false); // From old save (overrides default)
                    expect(parsed.phone_number).toBeDefined(); // From defaults
                }
            });
        });
    });

    describe("Component lifecycle", () => {
        it("should save column visibility changes to localStorage", async () => {
            const { container} = renderWithMantine(<HouseholdsTable households={mockHouseholds} />);

            await waitFor(() => {
                expect(container.querySelector('[data-testid="data-table"]')).toBeTruthy();
            });

            // Wait for useEffect to save initial state
            await waitFor(() => {
                expect(mockLocalStorage["householdsTableColumns"]).toBeDefined();
            });

            // Verify saved data is valid JSON object
            const saved = JSON.parse(mockLocalStorage["householdsTableColumns"]);
            expect(typeof saved).toBe("object");
            expect(Array.isArray(saved)).toBe(false);
        });
    });
});
