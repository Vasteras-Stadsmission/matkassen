import { describe, expect, it } from "vitest";
import {
    containsSuspiciousNameContent,
    normalizePersonName,
    normalizePersonNameForComparison,
    normalizePersonNameForDisplay,
} from "@/app/utils/person-name";

describe("person-name normalization", () => {
    it("trims and collapses whitespace", () => {
        expect(normalizePersonNameForDisplay("  Abd\t\tAlmohammad  ")).toBe("Abd Almohammad");
    });

    it("normalizes Unicode to NFC", () => {
        expect(normalizePersonNameForDisplay("Agne\u0301")).toBe("Agn\u00e9");
    });

    it("preserves case and name punctuation", () => {
        expect(normalizePersonNameForDisplay("  de Souza-O'Neill Jr.  ")).toBe(
            "de Souza-O'Neill Jr.",
        );
    });

    it("rejects empty names after normalization", () => {
        expect(normalizePersonName(" \t\n ")).toEqual({ success: false, reason: "empty" });
    });

    it("rejects invisible format characters", () => {
        expect(normalizePersonName("Anna\u200BSvensson")).toEqual({
            success: false,
            reason: "invalid_characters",
        });
    });

    it("normalizes names for comparison", () => {
        expect(normalizePersonNameForComparison("  ERIKSSON ")).toBe("eriksson");
    });

    it("flags digits as suspicious without rejecting them", () => {
        expect(containsSuspiciousNameContent("Akbarzada 0763479824")).toBe(true);
        expect(normalizePersonName("Akbarzada 0763479824")).toEqual({
            success: true,
            value: "Akbarzada 0763479824",
        });
    });
});
