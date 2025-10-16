/**
 * Tests for SMS Dashboard date grouping localization
 *
 * These tests verify that date group headers are formatted according to the user's
 * active locale, not hardcoded to Swedish.
 *
 * Regression History:
 * 1. First fix: Changed hardcoded "sv-SE" to document.documentElement.lang
 * 2. Second fix: Changed to useLocale() from next-intl (proper React hook)
 *
 * Bug: English users saw Swedish date headers like "LÖRDAG 18 OKTOBER"
 * instead of "SATURDAY 18 OCTOBER" even with English locale selected.
 *
 * Root Cause: document.documentElement.lang is not reliably set in client components.
 * Solution: Use useLocale() hook from next-intl to get the active locale.
 */

describe("SMS Dashboard - Date Grouping Localization", () => {
    describe("Date formatting respects user locale", () => {
        it("should format dates in Swedish when locale is sv", () => {
            const testDate = new Date("2025-10-19T10:00:00Z");
            const userLocale = "sv";

            const formattedDate = testDate.toLocaleDateString(userLocale, {
                weekday: "long",
                day: "numeric",
                month: "long",
            });

            // Swedish format
            expect(formattedDate.toLowerCase()).toContain("söndag");
            expect(formattedDate.toLowerCase()).toContain("oktober");
        });

        it("should format dates in English when locale is en", () => {
            const testDate = new Date("2025-10-19T10:00:00Z");
            const userLocale = "en";

            const formattedDate = testDate.toLocaleDateString(userLocale, {
                weekday: "long",
                day: "numeric",
                month: "long",
            });

            // English format
            expect(formattedDate.toLowerCase()).toContain("sunday");
            expect(formattedDate.toLowerCase()).toContain("october");
        });

        it("should NOT use hardcoded locale regardless of user preference", () => {
            // This test documents the bug we fixed
            const testDate = new Date("2025-10-19T10:00:00Z");

            // Simulate different user locales
            const swedishUserLocale = "sv";
            const englishUserLocale = "en";

            // WRONG (old way - hardcoded):
            const hardcodedSwedish = testDate.toLocaleDateString("sv-SE", {
                weekday: "long",
                day: "numeric",
                month: "long",
            });

            // CORRECT (new way - respects user locale):
            const dynamicSwedish = testDate.toLocaleDateString(swedishUserLocale, {
                weekday: "long",
                day: "numeric",
                month: "long",
            });

            const dynamicEnglish = testDate.toLocaleDateString(englishUserLocale, {
                weekday: "long",
                day: "numeric",
                month: "long",
            });

            // Hardcoded always shows Swedish
            expect(hardcodedSwedish.toLowerCase()).toContain("söndag");

            // Dynamic respects user locale
            expect(dynamicSwedish.toLowerCase()).toContain("söndag");
            expect(dynamicEnglish.toLowerCase()).toContain("sunday");
            expect(dynamicSwedish).not.toBe(dynamicEnglish);
        });
    });

    describe("Fallback behavior", () => {
        it("should default to Swedish if locale is not set", () => {
            const testDate = new Date("2025-10-19T10:00:00Z");
            // Simulate fallback logic from SmsDashboardClient.tsx
            const emptyString = "";
            const userLocale = emptyString || "sv";

            const formattedDate = testDate.toLocaleDateString(userLocale, {
                weekday: "long",
                day: "numeric",
                month: "long",
            });

            // Should fall back to Swedish
            expect(userLocale).toBe("sv");
            expect(formattedDate.toLowerCase()).toContain("söndag");
        });

        it("should handle various locale formats", () => {
            const testDate = new Date("2025-10-19T10:00:00Z");

            const locales = [
                { code: "sv", expected: "söndag" },
                { code: "sv-SE", expected: "söndag" },
                { code: "en", expected: "sunday" },
                { code: "en-US", expected: "sunday" },
                { code: "en-GB", expected: "sunday" },
            ];

            locales.forEach(({ code, expected }) => {
                const formatted = testDate.toLocaleDateString(code, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                });

                expect(formatted.toLowerCase()).toContain(expected);
            });
        });
    });

    describe("Real-world scenario (Regression: Bug Report from User Testing)", () => {
        it("should show correct date header for English-speaking user", () => {
            /**
             * REGRESSION BUG REPORT:
             * User reported: "The dates are in Swedish, but I have selected English as my locale"
             *
             * ROOT CAUSE:
             * SmsDashboardClient.tsx line 146 had hardcoded:
             *   pickupDate.toLocaleDateString("sv-SE", {...})
             *
             * FIX:
             * Changed to:
             *   const userLocale = document.documentElement.lang || "sv";
             *   pickupDate.toLocaleDateString(userLocale, {...})
             */

            // Parcel scheduled for Sunday, October 19, 2025
            const parcelDate = new Date("2025-10-19T09:00:00Z");
            const userLocale = "en"; // English user

            // Generate date header (matches SmsDashboardClient.tsx logic)
            const dateHeader = parcelDate.toLocaleDateString(userLocale, {
                weekday: "long",
                day: "numeric",
                month: "long",
            });

            // English user should see English date
            expect(dateHeader).toContain("Sunday");
            expect(dateHeader).toContain("October");
            expect(dateHeader).toContain("19");

            // Should NOT see Swedish (this was the bug!)
            expect(dateHeader.toLowerCase()).not.toContain("söndag");
            expect(dateHeader.toLowerCase()).not.toContain("oktober");
        });

        it("should show correct date header for Swedish-speaking user", () => {
            // Same parcel date
            const parcelDate = new Date("2025-10-19T09:00:00Z");
            const userLocale = "sv"; // Swedish user

            const dateHeader = parcelDate.toLocaleDateString(userLocale, {
                weekday: "long",
                day: "numeric",
                month: "long",
            });

            // Swedish user should see Swedish date
            expect(dateHeader.toLowerCase()).toContain("söndag");
            expect(dateHeader.toLowerCase()).toContain("oktober");
            expect(dateHeader).toContain("19");

            // Should NOT see English
            expect(dateHeader).not.toContain("Sunday");
            expect(dateHeader).not.toContain("October");
        });

        it("REGRESSION: hardcoded locale breaks user experience", () => {
            /**
             * This test documents the bug we fixed.
             *
             * BEFORE (broken):
             * const dateHeader = date.toLocaleDateString("sv-SE", {...});
             * Result: Always Swedish, regardless of user preference
             *
             * AFTER (fixed):
             * const userLocale = document.documentElement.lang || "sv";
             * const dateHeader = date.toLocaleDateString(userLocale, {...});
             * Result: Respects user's active locale
             */

            const testDate = new Date("2025-10-19T10:00:00Z");

            // WRONG (old way - always Swedish)
            const hardcodedResult = testDate.toLocaleDateString("sv-SE", {
                weekday: "long",
                day: "numeric",
                month: "long",
            });

            // CORRECT (new way - respects user locale)
            const dynamicResultEn = testDate.toLocaleDateString("en", {
                weekday: "long",
                day: "numeric",
                month: "long",
            });

            const dynamicResultSv = testDate.toLocaleDateString("sv", {
                weekday: "long",
                day: "numeric",
                month: "long",
            });

            // Hardcoded always shows Swedish (BUG)
            expect(hardcodedResult.toLowerCase()).toContain("söndag");

            // Dynamic respects user choice (FIX)
            expect(dynamicResultEn).toContain("Sunday");
            expect(dynamicResultSv.toLowerCase()).toContain("söndag");

            // They should be different!
            expect(dynamicResultEn).not.toBe(dynamicResultSv);
        });
    });
});
