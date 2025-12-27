import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatEnrolmentSms } from "@/app/utils/sms/templates";
import type { SupportedLocale } from "@/app/utils/locale-detection";

// Mock the branding config
vi.mock("@/app/config/branding", () => ({
    BRAND_NAME: "TestOrg",
    generateUrl: (path: string) => `https://example.com${path}`,
}));

describe("formatEnrolmentSms", () => {
    it("should generate Swedish welcome message with privacy policy link", () => {
        const result = formatEnrolmentSms("sv");

        expect(result).toContain("Välkommen till TestOrg");
        expect(result).toContain("https://example.com/privacy?lang=sv");
    });

    it("should generate English welcome message with privacy policy link", () => {
        const result = formatEnrolmentSms("en");

        expect(result).toContain("Welcome to TestOrg");
        expect(result).toContain("https://example.com/privacy?lang=en");
    });

    it("should generate Arabic welcome message with privacy policy link", () => {
        const result = formatEnrolmentSms("ar");

        expect(result).toContain("مرحبًا بك في TestOrg");
        expect(result).toContain("https://example.com/privacy?lang=ar");
    });

    it("should include privacy policy URL for all supported locales", () => {
        const locales: SupportedLocale[] = [
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

        for (const locale of locales) {
            const result = formatEnrolmentSms(locale);
            expect(result).toContain(`https://example.com/privacy?lang=${locale}`);
            expect(result).toContain("TestOrg");
            // Message should be reasonably short for SMS
            expect(result.length).toBeLessThan(160);
        }
    });

    it("should handle Somali variant so_so the same as so", () => {
        const soResult = formatEnrolmentSms("so");
        const soSoResult = formatEnrolmentSms("so_so");

        // Both should contain Somali welcome text
        expect(soResult).toContain("Ku soo dhawow TestOrg");
        expect(soSoResult).toContain("Ku soo dhawow TestOrg");
    });

    it("should generate messages under SMS character limit", () => {
        const locales: SupportedLocale[] = ["sv", "en", "ar", "fa", "ru", "uk"];

        for (const locale of locales) {
            const result = formatEnrolmentSms(locale);
            // Standard SMS limit is 160 characters for GSM-7, but with Unicode it's 70
            // Our messages should be under 160 even with the URL
            expect(result.length).toBeLessThan(160);
        }
    });
});
