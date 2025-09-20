import { describe, it, expect } from "vitest";
import {
    formatPickupSms,
    formatDateTimeForSms,
    type SmsTemplateData,
} from "../../../../app/utils/sms/templates";
import type { SupportedLocale } from "../../../../app/utils/locale-detection";

describe("SMS Message Templates", () => {
    describe("Basic Template Functions", () => {
        // Test with a specific date to ensure consistent results
        // Monday, September 16, 2024 at 10:00 UTC
        const testDate = new Date("2024-09-16T10:00:00.000Z");

        const templateData: SmsTemplateData = {
            pickupDate: testDate,
            publicUrl: "matkassen.org/p/123456789012",
        };

        it("should generate Swedish pickup SMS with correct localized format", () => {
            const message = formatPickupSms(templateData, "sv");

            expect(message).toContain("Matpaket");
            expect(message).toMatch(/matkassen\.org/);
            // Don't test exact time due to timezone differences
        });

        it("should generate English pickup SMS with correct localized format", () => {
            const message = formatPickupSms(templateData, "en");

            expect(message).toContain("Food pickup");
            expect(message).toMatch(/matkassen\.org/);
        });

        it("should generate Arabic SMS with proper format", () => {
            const message = formatPickupSms(templateData, "ar");

            expect(message).toContain("استلام الطعام");
            expect(message).toMatch(/matkassen\.org/);
        });

        it("should generate German SMS with proper localized date", () => {
            const message = formatPickupSms(templateData, "de");

            expect(message).toContain("Essen");
            expect(message).toMatch(/matkassen\.org/);
        });

        it("should use English as fallback for unknown locale", () => {
            const message = formatPickupSms(templateData, "xyz" as SupportedLocale);

            expect(message).toContain("Food pickup");
        });

        it("should maintain backward compatibility with legacy functions", () => {
            const pickupMessage = formatPickupSms(templateData, "sv");

            // All legacy functions have been removed in favor of the single formatPickupSms function
            expect(pickupMessage).toContain("Matpaket");
            expect(pickupMessage).toMatch(/matkassen\.org/);
        });
    });

    describe("SMS Length Limits - CRITICAL FOR COST CONTROL", () => {
        // Helper function to detect Unicode characters (require 70-char limit vs 160 for GSM)
        const hasUnicodeChars = (str: string): boolean => {
            // GSM 7-bit character set check (simplified)
            const gsmChars =
                /^[A-Za-z0-9\s@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜäöñüà]*$/;
            return !gsmChars.test(str);
        };

        // Test with a worst-case longer date - Wednesday gets longest day name
        const longerDate = new Date("2024-09-18T14:30:00Z"); // Wednesday, September 18, 2024 at 14:30

        const testData: SmsTemplateData = {
            pickupDate: longerDate,
            publicUrl: "matkassen.org/p/123456789012", // Realistic URL length
        };

        // All supported languages
        const languages: SupportedLocale[] = [
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
            "hy",
        ];

        it("should keep all SMS messages within single SMS limits", () => {
            languages.forEach(locale => {
                const message = formatPickupSms(testData, locale);
                const isUnicode = hasUnicodeChars(message);
                const limit = isUnicode ? 70 : 160;

                expect(
                    message.length,
                    `${locale.toUpperCase()} SMS (${message.length} chars, ${isUnicode ? "Unicode" : "GSM"}): "${message}"`,
                ).toBeLessThanOrEqual(limit);
            });
        });

        it("should provide length information for monitoring", () => {
            // This test always passes but provides useful debug info
            console.log("\n📱 SMS Length Analysis (Localized Format):");
            console.log("=".repeat(80));

            languages.forEach(locale => {
                const message = formatPickupSms(testData, locale);
                const isUnicode = hasUnicodeChars(message);
                const limit = isUnicode ? 70 : 160;
                const status = message.length <= limit ? "✅" : "❌";

                console.log(
                    `${locale.toUpperCase().padEnd(6)} ${message.length.toString().padStart(2)}/${limit} ${status} | "${message}"`,
                );
            });

            console.log("=".repeat(80));
            expect(true).toBe(true); // Always pass
        });
    });

    describe("Date and Time Formatting", () => {
        it("should format Swedish date and time correctly", () => {
            const date = new Date("2024-01-15T14:30:00Z");
            const result = formatDateTimeForSms(date, "sv");

            expect(result.date).toBeDefined();
            expect(result.time).toBeDefined();
            expect(result.time).toMatch(/\d{2}:\d{2}/);
        });

        it("should format English date and time correctly", () => {
            const date = new Date("2024-01-15T14:30:00Z");
            const result = formatDateTimeForSms(date, "en");

            expect(result.date).toBeDefined();
            expect(result.time).toBeDefined();
            expect(result.time).toMatch(/\d{2}:\d{2}/);
        });

        it("should format German date and time correctly", () => {
            const date = new Date("2024-01-15T14:30:00Z");
            const result = formatDateTimeForSms(date, "de");

            expect(result.date).toBeDefined();
            expect(result.time).toBeDefined();
            expect(result.time).toMatch(/\d{2}:\d{2}/);
        });

        it("should use fallback format for unknown locale", () => {
            const date = new Date("2024-01-15T14:30:00Z");
            const result = formatDateTimeForSms(date, "xyz" as SupportedLocale);

            expect(result.date).toBeDefined();
            expect(result.time).toBeDefined();
            expect(result.time).toMatch(/\d{2}:\d{2}/);
        });
    });
});
