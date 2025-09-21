import { describe, it, expect } from "vitest";
import { generateAdminUrl } from "../../../app/utils/public-parcel-data";

describe("generateAdminUrl", () => {
    it("should generate locale-agnostic admin URL without hardcoded locale", () => {
        const url = generateAdminUrl("abc123");

        // Should not contain hardcoded locales
        expect(url).not.toContain("/sv/");
        expect(url).not.toContain("/en/");

        // Should contain the parcel parameter
        expect(url).toContain("?parcel=abc123");

        // Should point to schedule endpoint
        expect(url).toContain("/schedule?parcel=");

        // Should be a valid URL format
        expect(url).toMatch(/^https?:\/\/.+\/schedule\?parcel=.+$/);
    });

    it("should handle various parcel ID formats", () => {
        const shortId = generateAdminUrl("123");
        const longId = generateAdminUrl("abcdefghijklmnop");
        const mixedId = generateAdminUrl("A1b2C3d4E5");

        // All should be locale-agnostic
        [shortId, longId, mixedId].forEach(url => {
            expect(url).not.toContain("/sv/");
            expect(url).not.toContain("/en/");
            expect(url).toContain("/schedule?parcel=");
        });

        // Should contain the correct parcel IDs
        expect(shortId).toContain("?parcel=123");
        expect(longId).toContain("?parcel=abcdefghijklmnop");
        expect(mixedId).toContain("?parcel=A1b2C3d4E5");
    });
});
