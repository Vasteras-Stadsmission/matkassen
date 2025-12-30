import { describe, it, expect } from "vitest";
import {
    normalizePhoneToE164,
    isValidE164,
    formatPhoneForDisplay,
    validatePhoneInput,
    stripSwedishPrefix,
    formatPhoneInputWithSpaces,
} from "../../../../app/utils/validation/phone-validation";

describe("Phone Validation Utilities", () => {
    describe("normalizePhoneToE164", () => {
        describe("Swedish numbers with leading 0", () => {
            it("should convert 0701234567 to +46701234567", () => {
                expect(normalizePhoneToE164("0701234567")).toBe("+46701234567");
            });

            it("should handle different mobile prefixes", () => {
                expect(normalizePhoneToE164("0721234567")).toBe("+46721234567");
                expect(normalizePhoneToE164("0731234567")).toBe("+46731234567");
                expect(normalizePhoneToE164("0761234567")).toBe("+46761234567");
            });

            it("should handle landline numbers", () => {
                expect(normalizePhoneToE164("081234567")).toBe("+4681234567");
            });

            it("should strip formatting characters", () => {
                expect(normalizePhoneToE164("070-123 45 67")).toBe("+46701234567");
                expect(normalizePhoneToE164("070 123 45 67")).toBe("+46701234567");
                expect(normalizePhoneToE164("(070) 123-45-67")).toBe("+46701234567");
            });
        });

        describe("Swedish numbers starting with 46", () => {
            it("should add + prefix to numbers starting with 46", () => {
                expect(normalizePhoneToE164("46701234567")).toBe("+46701234567");
            });

            it("should handle formatted input", () => {
                expect(normalizePhoneToE164("46 70 123 45 67")).toBe("+46701234567");
            });
        });

        describe("Already E.164 formatted numbers", () => {
            it("should preserve +46 numbers", () => {
                expect(normalizePhoneToE164("+46701234567")).toBe("+46701234567");
            });

            it("should handle +46 with stripped non-digits", () => {
                // The + is stripped by replace(/\D/g, ""), leaving 46...
                // which then gets + prepended
                expect(normalizePhoneToE164("+46 70 123 45 67")).toBe("+46701234567");
            });
        });

        describe("Numbers without country code (8-10 digits)", () => {
            it("should assume Swedish for 9-digit numbers", () => {
                expect(normalizePhoneToE164("701234567")).toBe("+46701234567");
            });

            it("should assume Swedish for 8-digit numbers", () => {
                expect(normalizePhoneToE164("81234567")).toBe("+4681234567");
            });

            it("should assume Swedish for 10-digit numbers without leading 0", () => {
                expect(normalizePhoneToE164("7012345678")).toBe("+467012345678");
            });
        });

        describe("Edge cases", () => {
            it("should handle empty string", () => {
                expect(normalizePhoneToE164("")).toBe("+46");
            });

            it("should handle very short numbers", () => {
                expect(normalizePhoneToE164("123")).toBe("+46123");
            });
        });
    });

    describe("isValidE164", () => {
        describe("Valid E.164 numbers", () => {
            it("should accept standard Swedish mobile numbers", () => {
                expect(isValidE164("+46701234567")).toBe(true);
            });

            it("should accept Swedish landline numbers", () => {
                expect(isValidE164("+4681234567")).toBe(true);
            });

            it("should accept other country codes", () => {
                expect(isValidE164("+15551234567")).toBe(true);
                expect(isValidE164("+4474123456789")).toBe(true);
            });

            it("should accept minimum valid length", () => {
                expect(isValidE164("+1")).toBe(true);
            });

            it("should accept maximum valid length (15 digits)", () => {
                expect(isValidE164("+123456789012345")).toBe(true);
            });
        });

        describe("Invalid E.164 numbers", () => {
            it("should reject numbers without + prefix", () => {
                expect(isValidE164("46701234567")).toBe(false);
            });

            it("should reject numbers starting with +0", () => {
                expect(isValidE164("+0701234567")).toBe(false);
            });

            it("should reject numbers exceeding 15 digits", () => {
                expect(isValidE164("+1234567890123456")).toBe(false);
            });

            it("should reject numbers with spaces", () => {
                expect(isValidE164("+46 70 123 45 67")).toBe(false);
            });

            it("should reject numbers with dashes", () => {
                expect(isValidE164("+46-70-123-45-67")).toBe(false);
            });

            it("should reject empty string", () => {
                expect(isValidE164("")).toBe(false);
            });

            it("should reject just + sign", () => {
                expect(isValidE164("+")).toBe(false);
            });

            it("should reject letters", () => {
                expect(isValidE164("+46abc")).toBe(false);
            });
        });
    });

    describe("formatPhoneForDisplay", () => {
        describe("Swedish mobile numbers (9 digits after +46)", () => {
            it("should format as +46 XX XXX XX XX", () => {
                expect(formatPhoneForDisplay("+46701234567")).toBe("+46 70 123 45 67");
            });

            it("should handle different prefixes", () => {
                expect(formatPhoneForDisplay("+46721234567")).toBe("+46 72 123 45 67");
                expect(formatPhoneForDisplay("+46761234567")).toBe("+46 76 123 45 67");
            });
        });

        describe("Swedish landline numbers (8 digits after +46)", () => {
            it("should format Stockholm landline as +46 X XXXX XXX", () => {
                // Stockholm: 08-123 45 67 → +4681234567 (7 digits after +46)
                // Falls through to default formatting
                expect(formatPhoneForDisplay("+4681234567")).toBe("+46 8 1234 567");
            });
        });

        describe("Non-Swedish numbers", () => {
            it("should return non-Swedish numbers unchanged", () => {
                expect(formatPhoneForDisplay("+15551234567")).toBe("+15551234567");
                expect(formatPhoneForDisplay("+4474123456789")).toBe("+4474123456789");
            });
        });

        describe("Edge cases", () => {
            it("should handle other lengths by adding space after country code", () => {
                expect(formatPhoneForDisplay("+461234")).toBe("+46 1234");
            });

            it("should return empty string for empty input", () => {
                expect(formatPhoneForDisplay("")).toBe("");
            });

            it("should normalize local numbers without +46 prefix", () => {
                expect(formatPhoneForDisplay("701234567")).toBe("+46 70 123 45 67");
                expect(formatPhoneForDisplay("0701234567")).toBe("+46 70 123 45 67");
            });
        });
    });

    describe("validatePhoneInput", () => {
        describe("Valid Swedish mobile numbers (9-10 digits)", () => {
            it("should accept 9-digit numbers (mobile without leading 0)", () => {
                expect(validatePhoneInput("701234567")).toBeNull();
            });

            it("should accept 10-digit numbers (mobile with leading 0)", () => {
                expect(validatePhoneInput("0701234567")).toBeNull();
            });

            it("should accept formatted input with spaces/dashes", () => {
                expect(validatePhoneInput("070-123 45 67")).toBeNull();
                expect(validatePhoneInput("70 123 45 67")).toBeNull();
                expect(validatePhoneInput("0712 34 56 78")).toBeNull();
                expect(validatePhoneInput("712 34 56 78")).toBeNull();
            });
        });

        describe("Invalid inputs - international prefixes", () => {
            it("should reject numbers starting with +", () => {
                expect(validatePhoneInput("+46701234567")).toBe("validation.swedishNumbersOnly");
            });

            it("should reject numbers starting with + and spaces", () => {
                expect(validatePhoneInput("+46 70 123 45 67")).toBe(
                    "validation.swedishNumbersOnly",
                );
            });

            it("should reject numbers starting with 00", () => {
                expect(validatePhoneInput("0046701234567")).toBe("validation.swedishNumbersOnly");
            });

            it("should reject other international prefixes", () => {
                expect(validatePhoneInput("+15551234567")).toBe("validation.swedishNumbersOnly");
                expect(validatePhoneInput("00491234567890")).toBe("validation.swedishNumbersOnly");
            });
        });

        describe("Invalid inputs - wrong length or format", () => {
            it("should reject numbers with fewer than 9 digits", () => {
                expect(validatePhoneInput("12345678")).toBe("validation.phoneNumberFormat");
            });

            it("should reject numbers with more than 10 digits", () => {
                expect(validatePhoneInput("12345678901")).toBe("validation.phoneNumberFormat");
            });

            it("should reject very short numbers", () => {
                expect(validatePhoneInput("123")).toBe("validation.phoneNumberFormat");
            });

            it("should reject 10-digit numbers not starting with 0", () => {
                expect(validatePhoneInput("7012345678")).toBe("validation.phoneNumberFormat");
            });

            it("should reject 9-digit numbers starting with 0", () => {
                expect(validatePhoneInput("012345678")).toBe("validation.phoneNumberFormat");
            });
        });
    });

    describe("stripSwedishPrefix", () => {
        describe("Stripping +46 prefix", () => {
            it("should strip +46 prefix from E.164 number", () => {
                expect(stripSwedishPrefix("+46701234567")).toBe("701234567");
            });

            it("should strip 46 prefix without +", () => {
                expect(stripSwedishPrefix("46701234567")).toBe("701234567");
            });

            it("should return local numbers unchanged", () => {
                expect(stripSwedishPrefix("701234567")).toBe("701234567");
                expect(stripSwedishPrefix("0701234567")).toBe("0701234567");
            });

            it("should handle empty string", () => {
                expect(stripSwedishPrefix("")).toBe("");
            });

            it("should handle short numbers starting with 46 (not a prefix)", () => {
                // 461234567 is 9 digits, could be a local number starting with 46
                expect(stripSwedishPrefix("461234567")).toBe("461234567");
            });
        });
    });

    describe("formatPhoneInputWithSpaces", () => {
        describe("Numbers with leading 0 (format: 0712 34 56 78)", () => {
            it("should format partial input progressively", () => {
                expect(formatPhoneInputWithSpaces("07")).toBe("07");
                expect(formatPhoneInputWithSpaces("071")).toBe("071");
                expect(formatPhoneInputWithSpaces("0712")).toBe("0712");
                expect(formatPhoneInputWithSpaces("07123")).toBe("0712 3");
                expect(formatPhoneInputWithSpaces("071234")).toBe("0712 34");
                expect(formatPhoneInputWithSpaces("0712345")).toBe("0712 34 5");
                expect(formatPhoneInputWithSpaces("07123456")).toBe("0712 34 56");
                expect(formatPhoneInputWithSpaces("071234567")).toBe("0712 34 56 7");
                expect(formatPhoneInputWithSpaces("0712345678")).toBe("0712 34 56 78");
            });

            it("should handle input with existing spaces", () => {
                expect(formatPhoneInputWithSpaces("0712 34")).toBe("0712 34");
                expect(formatPhoneInputWithSpaces("0712 34 56 78")).toBe("0712 34 56 78");
            });

            it("should strip non-digit characters", () => {
                expect(formatPhoneInputWithSpaces("0712-34-56-78")).toBe("0712 34 56 78");
            });
        });

        describe("Numbers without leading 0 (format: 712 34 56 78)", () => {
            it("should format partial input progressively", () => {
                expect(formatPhoneInputWithSpaces("7")).toBe("7");
                expect(formatPhoneInputWithSpaces("71")).toBe("71");
                expect(formatPhoneInputWithSpaces("712")).toBe("712");
                expect(formatPhoneInputWithSpaces("7123")).toBe("712 3");
                expect(formatPhoneInputWithSpaces("71234")).toBe("712 34");
                expect(formatPhoneInputWithSpaces("712345")).toBe("712 34 5");
                expect(formatPhoneInputWithSpaces("7123456")).toBe("712 34 56");
                expect(formatPhoneInputWithSpaces("71234567")).toBe("712 34 56 7");
                expect(formatPhoneInputWithSpaces("712345678")).toBe("712 34 56 78");
            });
        });

        describe("Edge cases", () => {
            it("should handle empty input", () => {
                expect(formatPhoneInputWithSpaces("")).toBe("");
            });

            it("should limit to 10 digits", () => {
                expect(formatPhoneInputWithSpaces("07123456789999")).toBe("0712 34 56 78");
            });
        });
    });
});
