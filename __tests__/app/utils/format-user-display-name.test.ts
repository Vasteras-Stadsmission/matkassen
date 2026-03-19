import { describe, it, expect } from "vitest";
import { formatUserDisplayName } from "@/app/utils/format-user-display-name";

describe("formatUserDisplayName", () => {
    it("returns first + last name when both are present", () => {
        expect(
            formatUserDisplayName({
                first_name: "Anna",
                last_name: "Svensson",
                display_name: "GitHub Name",
            }),
        ).toBe("Anna Svensson");
    });

    it("falls back to display_name when first/last are missing", () => {
        expect(
            formatUserDisplayName({
                first_name: null,
                last_name: null,
                display_name: "GitHub Name",
            }),
        ).toBe("GitHub Name");
    });

    it("falls back to display_name when only first_name is set", () => {
        expect(
            formatUserDisplayName({
                first_name: "Anna",
                last_name: null,
                display_name: "GitHub Name",
            }),
        ).toBe("GitHub Name");
    });

    it("falls back to display_name when only last_name is set", () => {
        expect(
            formatUserDisplayName({
                first_name: null,
                last_name: "Svensson",
                display_name: "GitHub Name",
            }),
        ).toBe("GitHub Name");
    });

    it("uses the provided fallback when all names are null", () => {
        expect(
            formatUserDisplayName(
                { first_name: null, last_name: null, display_name: null },
                "octocat",
            ),
        ).toBe("octocat");
    });

    it("returns null when all names and fallback are null", () => {
        expect(
            formatUserDisplayName({ first_name: null, last_name: null, display_name: null }),
        ).toBeNull();
    });

    it("handles undefined fields (optional properties)", () => {
        expect(formatUserDisplayName({})).toBeNull();
        expect(formatUserDisplayName({}, "fallback")).toBe("fallback");
    });
});
