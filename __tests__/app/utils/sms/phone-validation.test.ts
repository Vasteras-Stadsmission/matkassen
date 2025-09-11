import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizePhoneToE164, isValidE164 } from "../../../../app/utils/sms/hello-sms";

describe("SMS Phone Number Validation", () => {
    describe("normalizePhoneToE164", () => {
        it("should normalize Swedish phone numbers correctly", () => {
            expect(normalizePhoneToE164("070-123 45 67", "+46")).toBe("+46701234567");
            expect(normalizePhoneToE164("0701234567", "+46")).toBe("+46701234567");
            expect(normalizePhoneToE164("46701234567", "+46")).toBe("+46701234567");
            expect(normalizePhoneToE164("+46701234567", "+46")).toBe("+46701234567");
        });

        it("should handle different Swedish mobile prefixes", () => {
            expect(normalizePhoneToE164("070-123 45 67", "+46")).toBe("+46701234567");
            expect(normalizePhoneToE164("072-123 45 67", "+46")).toBe("+46721234567");
            expect(normalizePhoneToE164("073-123 45 67", "+46")).toBe("+46731234567");
            expect(normalizePhoneToE164("076-123 45 67", "+46")).toBe("+46761234567");
        });

        it("should handle US phone numbers", () => {
            expect(normalizePhoneToE164("(555) 123-4567", "+1")).toBe("+15551234567");
            expect(normalizePhoneToE164("555-123-4567", "+1")).toBe("+15551234567");
            expect(normalizePhoneToE164("5551234567", "+1")).toBe("+15551234567");
            expect(normalizePhoneToE164("+1 555 123 4567", "+1")).toBe("+15551234567");
        });

        it("should preserve already valid E.164 numbers", () => {
            expect(normalizePhoneToE164("+46701234567", "+46")).toBe("+46701234567");
            expect(normalizePhoneToE164("+15551234567", "+1")).toBe("+15551234567");
            expect(normalizePhoneToE164("+4474123456789", "+44")).toBe("+4474123456789");
        });

        it("should handle special characters and whitespace", () => {
            expect(normalizePhoneToE164("070 - 123 45 67", "+46")).toBe("+46701234567");
            expect(normalizePhoneToE164("(070) 123-45-67", "+46")).toBe("+46701234567");
            expect(normalizePhoneToE164("070.123.45.67", "+46")).toBe("+46701234567");
        });

        it("should use default Swedish country code when none specified", () => {
            expect(normalizePhoneToE164("070-123 45 67")).toBe("+46701234567");
            expect(normalizePhoneToE164("0701234567")).toBe("+46701234567");
        });

        it("should handle edge cases gracefully", () => {
            // Function extracts digits and normalizes to E.164 format, even for incomplete inputs
            expect(normalizePhoneToE164("123", "+46")).toBe("+46123");
            expect(normalizePhoneToE164("abc123def", "+46")).toBe("+46123"); // Extracts digits only
            expect(normalizePhoneToE164("", "+46")).toBe("+46"); // Just country code
            expect(normalizePhoneToE164("!@#$%", "+46")).toBe("+46"); // No digits found
        });
    });

    describe("isValidE164", () => {
        it("should validate correct E.164 numbers", () => {
            expect(isValidE164("+46701234567")).toBe(true);
            expect(isValidE164("+15551234567")).toBe(true);
            expect(isValidE164("+4474123456789")).toBe(true);
            expect(isValidE164("+861234567890")).toBe(true);
            expect(isValidE164("+46")).toBe(true); // Minimal valid E.164
            expect(isValidE164("+123456789012345")).toBe(true); // Max length (15 digits total)
        });

        it("should reject invalid E.164 numbers", () => {
            expect(isValidE164("46701234567")).toBe(false); // Missing +
            expect(isValidE164("+0701234567")).toBe(false); // Can't start with 0 after +
            expect(isValidE164("+4670123456789012")).toBe(false); // Too long (16 digits total)
            expect(isValidE164("+46-70-123-45-67")).toBe(false); // Contains dashes
            expect(isValidE164("+46 70 123 45 67")).toBe(false); // Contains spaces
            expect(isValidE164("")).toBe(false); // Empty
            expect(isValidE164("+")).toBe(false); // Just plus
            expect(isValidE164("+abc")).toBe(false); // Contains letters
        });
    });
});
