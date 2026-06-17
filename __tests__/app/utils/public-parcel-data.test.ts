import { afterEach, describe, it, expect } from "vitest";
import {
    generateAdminUrl,
    getParcelStatus,
    type PublicParcelData,
} from "../../../app/utils/public-parcel-data";
import { MockTimeProvider, TimeProvider, setTimeProvider } from "../../../app/utils/time-provider";

function parcel(overrides: Partial<PublicParcelData>): PublicParcelData {
    return {
        id: "parcel-1",
        householdName: "Test Household",
        householdLocale: "sv",
        pickupDateTimeEarliest: new Date("2026-06-17T10:00:00.000Z"),
        pickupDateTimeLatest: new Date("2026-06-17T11:00:00.000Z"),
        isPickedUp: false,
        locationName: "Test Location",
        locationAddress: "Test Street 1",
        locationPostalCode: "12345",
        deletedAt: null,
        ...overrides,
    };
}

afterEach(() => {
    setTimeProvider(new TimeProvider());
});

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

describe("getParcelStatus", () => {
    it("returns cancelled before collected when a parcel is soft-deleted", () => {
        setTimeProvider(new MockTimeProvider("2026-06-17T10:30:00.000Z"));

        expect(
            getParcelStatus(
                parcel({
                    isPickedUp: true,
                    deletedAt: new Date("2026-06-17T09:00:00.000Z"),
                }),
            ),
        ).toBe("cancelled");
    });

    it("uses pickup-window status for the public recipient page", () => {
        setTimeProvider(new MockTimeProvider("2026-06-17T10:30:00.000Z"));
        expect(getParcelStatus(parcel({}))).toBe("ready");

        setTimeProvider(new MockTimeProvider("2026-06-17T12:00:00.000Z"));
        expect(getParcelStatus(parcel({}))).toBe("scheduled");

        setTimeProvider(new MockTimeProvider("2026-06-25T12:00:00.000Z"));
        expect(getParcelStatus(parcel({}))).toBe("expired");
    });

    it("returns collected for picked-up parcels regardless of pickup window", () => {
        setTimeProvider(new MockTimeProvider("2026-06-25T12:00:00.000Z"));

        expect(getParcelStatus(parcel({ isPickedUp: true }))).toBe("collected");
    });
});
