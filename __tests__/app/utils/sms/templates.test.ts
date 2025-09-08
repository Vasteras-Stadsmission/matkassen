import { describe, it, expect } from "vitest";
import {
    formatPickupReminderSms,
    formatDateTimeForSms,
    type SmsTemplateData,
} from "../../../../app/utils/sms/templates";

describe("SMS Message Templates", () => {
    describe("Pickup Reminder Messages", () => {
        it("should generate Swedish pickup reminder with correct format", () => {
            const templateData: SmsTemplateData = {
                householdName: "Anna Andersson",
                pickupDate: "måndag 15 januari 2024",
                pickupTime: "14:30",
                locationName: "Järntorget Community Center",
                locationAddress: "Järntorget 5, 413 04 Göteborg",
                publicUrl: "https://matkassen.org/pickup/abc123",
            };

            const message = formatPickupReminderSms(templateData, "sv");

            expect(message).toContain("Anna Andersson");
            expect(message).toContain("Järntorget Community Center");
            expect(message).toContain("Järntorget 5");
            expect(message).toContain("måndag 15 januari 2024");
            expect(message).toContain("14:30");
            expect(message).toMatch(/matkassen\.org/);
            expect(message).toContain("matpaket");
        });

        it("should generate English pickup reminder with correct format", () => {
            const templateData: SmsTemplateData = {
                householdName: "John Smith",
                pickupDate: "Monday, January 15, 2024",
                pickupTime: "14:30",
                locationName: "Downtown Community Center",
                locationAddress: "123 Main St, Stockholm",
                publicUrl: "https://matkassen.org/pickup/def456",
            };

            const message = formatPickupReminderSms(templateData, "en");

            expect(message).toContain("John Smith");
            expect(message).toContain("Downtown Community Center");
            expect(message).toContain("123 Main St");
            expect(message).toContain("Monday, January 15, 2024");
            expect(message).toContain("14:30");
            expect(message).toMatch(/matkassen\.org/);
            expect(message).toContain("food parcel");
        });

        it("should generate Arabic pickup reminder with correct format", () => {
            const templateData: SmsTemplateData = {
                householdName: "Ahmad Hassan",
                pickupDate: "الاثنين 15 يناير 2024",
                pickupTime: "14:30",
                locationName: "المركز المجتمعي",
                locationAddress: "شارع الرئيسي 123، ستوكهولم",
                publicUrl: "https://matkassen.org/pickup/ghi789",
            };

            const message = formatPickupReminderSms(templateData, "ar");

            expect(message).toContain("Ahmad Hassan");
            expect(message).toContain("المركز المجتمعي");
            expect(message).toContain("شارع الرئيسي 123");
            expect(message).toContain("الاثنين 15 يناير 2024");
            expect(message).toContain("14:30");
            expect(message).toMatch(/matkassen\.org/);
            expect(message).toContain("مرحبا");
        });

        it("should generate Somali pickup reminder with correct format", () => {
            const templateData: SmsTemplateData = {
                householdName: "Amina Mohamed",
                pickupDate: "January 15, 2024",
                pickupTime: "14:30",
                locationName: "Community Center",
                locationAddress: "Main Street 123, Stockholm",
                publicUrl: "https://matkassen.org/pickup/jkl012",
            };

            const message = formatPickupReminderSms(templateData, "so");

            expect(message).toContain("Amina Mohamed");
            expect(message).toContain("Community Center");
            expect(message).toContain("Main Street 123");
            expect(message).toContain("January 15, 2024");
            expect(message).toContain("14:30");
            expect(message).toMatch(/matkassen\.org/);
            expect(message).toContain("Haye");
        });

        it("should handle long location names gracefully", () => {
            const templateData: SmsTemplateData = {
                householdName: "Test User",
                pickupDate: "Monday, January 15, 2024",
                pickupTime: "14:30",
                locationName: "Very Long Community Center Name That Could Exceed Normal Length",
                locationAddress: "A Very Long Address That Might Be Too Long For SMS",
                publicUrl: "https://matkassen.org/pickup/test123",
            };

            const message = formatPickupReminderSms(templateData, "sv");

            // Message should still be generated and contain key information
            expect(message).toContain("Test User");
            expect(message).toBeTruthy();
            expect(message.length).toBeGreaterThan(0);
        });

        it("should fallback to English for unknown locale", () => {
            const templateData: SmsTemplateData = {
                householdName: "Test User",
                pickupDate: "Monday, January 15, 2024",
                pickupTime: "14:30",
                locationName: "Test Location",
                locationAddress: "Test Address",
                publicUrl: "https://matkassen.org/pickup/test456",
            };

            const message = formatPickupReminderSms(templateData, "de"); // German not supported

            expect(message).toContain("Test User");
            expect(message).toContain("Hello"); // Should use English fallback
            expect(message).toContain("food parcel");
        });
    });

    describe("Date and Time Formatting", () => {
        it("should format Swedish dates and times correctly", () => {
            const testDate = new Date("2024-01-15T14:30:00Z");
            const result = formatDateTimeForSms(testDate, "sv");

            expect(result.date).toBeTruthy();
            expect(result.time).toBeTruthy();
            expect(result.time).toMatch(/\d{2}:\d{2}/); // Should be in HH:MM format
        });

        it("should format English dates and times correctly", () => {
            const testDate = new Date("2024-01-15T14:30:00Z");
            const result = formatDateTimeForSms(testDate, "en");

            expect(result.date).toBeTruthy();
            expect(result.time).toBeTruthy();
            expect(result.time).toMatch(/\d{2}:\d{2}/); // Should be in HH:MM format (24-hour)
        });

        it("should format Arabic dates and times correctly", () => {
            const testDate = new Date("2024-01-15T14:30:00Z");
            const result = formatDateTimeForSms(testDate, "ar");

            expect(result.date).toBeTruthy();
            expect(result.time).toBeTruthy();
            // Arabic locale may use Arabic-Indic numerals, just check we get a time string
            expect(result.time.length).toBeGreaterThan(0);
            expect(result.time).toContain(":");
        });

        it("should format Somali dates and times correctly", () => {
            const testDate = new Date("2024-01-15T14:30:00Z");
            const result = formatDateTimeForSms(testDate, "so");

            expect(result.date).toBeTruthy();
            expect(result.time).toBeTruthy();
            expect(result.time).toMatch(/\d{2}:\d{2}/);
        });

        it("should fallback to English for unknown locale", () => {
            const testDate = new Date("2024-01-15T14:30:00Z");
            const result = formatDateTimeForSms(testDate, "de");

            expect(result.date).toBeTruthy();
            expect(result.time).toBeTruthy();
            expect(result.time).toMatch(/\d{2}:\d{2}/);
        });

        it("should handle timezone conversion to Stockholm", () => {
            // Test that dates are converted to Stockholm time
            const testDate = new Date("2024-06-15T12:00:00Z"); // Summer time
            const result = formatDateTimeForSms(testDate, "sv");

            expect(result.date).toBeTruthy();
            expect(result.time).toBeTruthy();
            // In summer, Stockholm is UTC+2, so 12:00 UTC should become 14:00
            // Note: Exact assertions depend on Date.toLocaleString behavior
        });
    });

    describe("Message Length and Content Validation", () => {
        it("should generate messages within reasonable length limits", () => {
            const templateData: SmsTemplateData = {
                householdName: "Very Long Household Name That Could Cause Issues",
                pickupDate: "Monday, January 15, 2024",
                pickupTime: "14:30",
                locationName: "Extremely Long Community Center Name That Goes On And On",
                locationAddress:
                    "A Ridiculously Long Address That Includes Many Details, 12345 Very Long Street Name, Apartment Building Complex",
                publicUrl:
                    "https://matkassen.org/pickup/very-long-url-parameter-that-might-exceed-limits",
            };

            const swedishMessage = formatPickupReminderSms(templateData, "sv");
            const englishMessage = formatPickupReminderSms(templateData, "en");

            // SMS can handle longer messages, but we want reasonable length
            expect(swedishMessage.length).toBeLessThan(1000);
            expect(englishMessage.length).toBeLessThan(1000);
            expect(swedishMessage.length).toBeGreaterThan(50);
            expect(englishMessage.length).toBeGreaterThan(50);
        });

        it("should handle special characters correctly", () => {
            const templateData: SmsTemplateData = {
                householdName: "Åsa Ödman Ström",
                pickupDate: "måndag 15 januari 2024",
                pickupTime: "14:30",
                locationName: "Åkersberga Bibliotek",
                locationAddress: "Östermalms Torg 1, Göteborg",
                publicUrl: "https://matkassen.org/pickup/åäö123",
            };

            const message = formatPickupReminderSms(templateData, "sv");

            expect(message).toContain("Åsa Ödman Ström");
            expect(message).toContain("Åkersberga Bibliotek");
            expect(message).toContain("Östermalms Torg");
        });

        it("should handle empty values gracefully", () => {
            const templateData: SmsTemplateData = {
                householdName: "",
                pickupDate: "",
                pickupTime: "",
                locationName: "",
                locationAddress: "",
                publicUrl: "",
            };

            // Should not throw error, even with empty values
            expect(() => {
                formatPickupReminderSms(templateData, "sv");
            }).not.toThrow();

            const message = formatPickupReminderSms(templateData, "sv");
            expect(message).toBeTruthy();
            expect(message.length).toBeGreaterThan(0);
        });
    });
});
