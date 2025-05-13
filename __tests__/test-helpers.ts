/**
 * Test helper functions for mocking dependencies in tests
 */

// Store mocks here so we can restore them later
const mocks = new Map<string, any>();

// Create a simplified version of vi.mock
export function mockModule(moduleName: string, factory: () => any) {
    // Store the mock for this module
    mocks.set(moduleName, factory());

    // Add to jest.mock if it exists (for compatibility)
    if (typeof jest !== "undefined" && jest.mock) {
        jest.mock(moduleName, () => mocks.get(moduleName));
    }
}

// Get a mocked module
export function getMockedModule(moduleName: string) {
    return mocks.get(moduleName) || {};
}

// Mock next-intl's useTranslations hook
export function mockTranslations() {
    mockModule("next-intl", () => ({
        useTranslations: () => (key: string) => key,
    }));
}

// Reset all mocks
export function resetMocks() {
    mocks.clear();
}
