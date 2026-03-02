import { describe, it, expect } from "vitest";
import { filterParcelsByQuery } from "../../../../app/[locale]/schedule/utils/parcel-search";
import type { FoodParcel } from "../../../../app/[locale]/schedule/types";

const makeParcel = (overrides: Partial<FoodParcel>): FoodParcel => ({
    id: "1",
    householdId: "h1",
    householdName: "Test Household",
    pickupDate: new Date(),
    pickupEarliestTime: new Date(),
    pickupLatestTime: new Date(),
    isPickedUp: false,
    phoneNumber: null,
    ...overrides,
});

const ANNA = makeParcel({ id: "1", householdName: "Anna Svensson", phoneNumber: "+46701234567" });
const BJÖRN = makeParcel({ id: "2", householdName: "Björn Karlsson", phoneNumber: "+46739999999" });
const NO_PHONE = makeParcel({ id: "3", householdName: "Carl Nilsson", phoneNumber: null });

const ALL = [ANNA, BJÖRN, NO_PHONE];

describe("filterParcelsByQuery", () => {
    it("returns all parcels when query is empty", () => {
        expect(filterParcelsByQuery(ALL, "")).toEqual(ALL);
        expect(filterParcelsByQuery(ALL, "   ")).toEqual(ALL);
    });

    describe("name search", () => {
        it("matches on first name", () => {
            expect(filterParcelsByQuery(ALL, "anna")).toEqual([ANNA]);
        });

        it("matches on surname", () => {
            expect(filterParcelsByQuery(ALL, "karlsson")).toEqual([BJÖRN]);
        });

        it("is case-insensitive", () => {
            expect(filterParcelsByQuery(ALL, "ANNA")).toEqual([ANNA]);
        });

        it("matches partial name", () => {
            expect(filterParcelsByQuery(ALL, "svens")).toEqual([ANNA]);
        });

        it("returns nothing when no name matches", () => {
            expect(filterParcelsByQuery(ALL, "xyz")).toEqual([]);
        });
    });

    describe("phone search — Swedish local format (07xx...)", () => {
        it("matches on full local number", () => {
            expect(filterParcelsByQuery(ALL, "0701234567")).toEqual([ANNA]);
        });

        it("matches on partial local number with 1 digit", () => {
            // Single digit "7" matches both numbers that contain 7
            expect(filterParcelsByQuery(ALL, "7")).toEqual([ANNA, BJÖRN]);
        });

        it("matches on 2-digit prefix", () => {
            expect(filterParcelsByQuery(ALL, "07")).toEqual([ANNA, BJÖRN]);
        });

        it("matches on 3-digit prefix", () => {
            expect(filterParcelsByQuery(ALL, "070")).toEqual([ANNA]);
        });

        it("matches mid-number digits", () => {
            expect(filterParcelsByQuery(ALL, "12345")).toEqual([ANNA]);
        });

        it("does not match parcel without phone number", () => {
            expect(filterParcelsByQuery(ALL, "070")).not.toContain(NO_PHONE);
        });
    });

    describe("phone search — E.164 format (+467xx...)", () => {
        it("matches on full E.164 number", () => {
            expect(filterParcelsByQuery(ALL, "+46701234567")).toEqual([ANNA]);
        });

        it("matches on partial E.164 number", () => {
            expect(filterParcelsByQuery(ALL, "+4670")).toEqual([ANNA]);
        });

        it("matches digits-only E.164 prefix", () => {
            expect(filterParcelsByQuery(ALL, "4670")).toEqual([ANNA]);
        });
    });
});
