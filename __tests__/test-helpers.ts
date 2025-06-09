import { vi } from "vitest";

/**
 * Test helper functions for mocking dependencies in tests
 */

// Create a simplified version of vi.mock for dynamic mocking
export function mockModule(moduleName: string, factory: () => any) {
    // For Vitest, use vi.mock
    if (typeof vi !== "undefined" && vi.mock) {
        vi.mock(moduleName, factory);
    }
}

// Mock next-intl's useTranslations hook directly
export function mockTranslations() {
    if (typeof vi !== "undefined" && vi.mock) {
        vi.mock("next-intl", () => ({
            useTranslations: () => (key: string) => key,
        }));
    }
}
