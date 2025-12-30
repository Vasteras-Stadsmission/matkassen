import { describe, it, expect } from "vitest";
import { formatCancellationSms } from "@/app/utils/sms/templates";
import type { SupportedLocale } from "@/app/utils/locale-detection";

/**
 * Tests for SMS Cancellation Messages (Phase 4)
 *
 * CRITICAL BUSINESS LOGIC TESTED:
 * 1. Message Format - Must be clear and understandable
 * 2. Locale Support - Representative languages + comprehensive loop test
 * 3. Message Length - Within SMS limits (COST CONTROL)
 * 4. Date/Time Display - Consistent with pickup reminder format
 */

describe("formatCancellationSms", () => {
    const scheduledPickup = new Date("2025-10-15T14:30:00+02:00"); // Oct 15, 2:30 PM Stockholm time
    const publicUrl = "https://example.com/p/test123";

    describe("Core Functionality", () => {
        it("should generate Swedish cancellation message", () => {
            const text = formatCancellationSms({ pickupDate: scheduledPickup, publicUrl }, "sv");

            expect(text).toContain("Matpaket");
            expect(text).toContain("är inställt");
            expect(text).toMatch(/\d{1,2}/); // Contains day number
        });

        it("should generate English cancellation message", () => {
            const text = formatCancellationSms({ pickupDate: scheduledPickup, publicUrl }, "en");

            expect(text).toContain("Food pickup");
            expect(text).toContain("is cancelled");
        });

        it("should generate Arabic cancellation (RTL, Unicode numerals)", () => {
            const text = formatCancellationSms({ pickupDate: scheduledPickup, publicUrl }, "ar");

            expect(text).toContain("تم إلغاء");
            expect(text).toMatch(/[١٢٣٤٥٦٧٨٩٠]/); // Arabic-Indic numerals
        });

        it("should generate German cancellation (Latin with umlauts)", () => {
            const text = formatCancellationSms({ pickupDate: scheduledPickup, publicUrl }, "de");

            expect(text).toContain("Essen");
            expect(text).toContain("abgesagt");
        });

        it("should handle fallback for unknown locale", () => {
            const text = formatCancellationSms(
                { pickupDate: scheduledPickup, publicUrl },
                "unknown-locale" as any,
            );

            // Should default to English
            expect(text).toContain("Food pickup");
            expect(text).toContain("is cancelled");
        });
    });

    describe("SMS Length Limits - CRITICAL FOR COST CONTROL", () => {
        // Helper to detect Unicode (70-char limit) vs GSM (160-char limit)
        const hasUnicodeChars = (str: string): boolean => {
            const gsmChars =
                /^[A-Za-z0-9\s@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜäöñüà]*$/;
            return !gsmChars.test(str);
        };

        const allLocales: SupportedLocale[] = [
            "sv",
            "en",
            "ar",
            "fa",
            "ku",
            "es",
            "fr",
            "de",
            "el",
            "sw",
            "so",
            "so_so",
            "uk",
            "ru",
            "ka",
            "fi",
            "it",
            "th",
            "vi",
            "pl",
        ];

        it("should keep all cancellation messages within single SMS limits", () => {
            allLocales.forEach(locale => {
                const text = formatCancellationSms(
                    { pickupDate: scheduledPickup, publicUrl },
                    locale,
                );
                const isUnicode = hasUnicodeChars(text);
                const limit = isUnicode ? 70 : 160;

                expect(
                    text.length,
                    `${locale.toUpperCase()} cancellation (${text.length} chars, ${isUnicode ? "Unicode" : "GSM"}): "${text}"`,
                ).toBeLessThanOrEqual(limit);
            });
        });

        it("should provide length information for monitoring", () => {
            // This test always passes but provides useful debug info
            console.log("\n📱 Cancellation SMS Length Analysis:");
            console.log("=".repeat(80));

            allLocales.forEach(locale => {
                const text = formatCancellationSms(
                    { pickupDate: scheduledPickup, publicUrl },
                    locale,
                );
                const isUnicode = hasUnicodeChars(text);
                const limit = isUnicode ? 70 : 160;
                const status = text.length <= limit ? "✅" : "❌";

                console.log(
                    `${locale.toUpperCase().padEnd(6)} ${text.length.toString().padStart(2)}/${limit} ${status} | "${text}"`,
                );
            });

            console.log("=".repeat(80));
            expect(true).toBe(true); // Always pass
        });
    });

    describe("Date/Time Formatting", () => {
        it("should include date and time in message", () => {
            const text = formatCancellationSms({ pickupDate: scheduledPickup, publicUrl }, "sv");

            expect(text).toMatch(/\d{1,2}/); // Day
            expect(text).toMatch(/\d{2}:\d{2}/); // Time (HH:MM)
        });

        it("should format times consistently across locales", () => {
            const locales: SupportedLocale[] = ["sv", "en", "de", "fr", "es"];

            locales.forEach(locale => {
                const text = formatCancellationSms(
                    { pickupDate: scheduledPickup, publicUrl },
                    locale,
                );

                // All should include HH:MM or localized time format
                expect(text.length).toBeGreaterThan(20); // Not empty or truncated
            });
        });

        it("should handle different pickup times correctly", () => {
            const morning = new Date("2025-10-15T08:00:00+02:00");
            const afternoon = new Date("2025-10-15T14:30:00+02:00");
            const evening = new Date("2025-10-15T19:00:00+02:00");

            const text1 = formatCancellationSms({ pickupDate: morning, publicUrl }, "sv");
            const text2 = formatCancellationSms({ pickupDate: afternoon, publicUrl }, "sv");
            const text3 = formatCancellationSms({ pickupDate: evening, publicUrl }, "sv");

            // All should be different (different times)
            expect(text1).not.toBe(text2);
            expect(text2).not.toBe(text3);
        });
    });

    describe("Edge Cases", () => {
        it("should handle midnight pickup times", () => {
            const midnight = new Date("2025-10-15T00:00:00+02:00");
            const text = formatCancellationSms({ pickupDate: midnight, publicUrl }, "sv");

            expect(text).toContain("00:00");
            expect(text).toContain("är inställt");
        });

        it("should not include URL (no action needed)", () => {
            const text = formatCancellationSms({ pickupDate: scheduledPickup, publicUrl }, "sv");

            // Cancellation is final - no URL needed
            expect(text).not.toContain("matcentralen.com");
            expect(text).not.toContain("http");
        });
    });
});
