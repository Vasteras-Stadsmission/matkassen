import { describe, it, expect } from "vitest";
import {
    filterParcelsByQuery,
    sortTodaysParcels,
} from "../../../../app/[locale]/schedule/utils/parcel-search";
import type { FoodParcel, ParcelDisplayStatus } from "../../../../app/[locale]/schedule/types";

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

const makeTodayParcel = (
    id: string,
    householdName: string,
    status: ParcelDisplayStatus,
    pickupTime: string,
) => ({
    ...makeParcel({
        id,
        householdName,
        pickupEarliestTime: new Date(pickupTime),
    }),
    status,
});

describe("sortTodaysParcels", () => {
    it("keeps actionable parcels ahead of no-shows and picked-up parcels", () => {
        const pickedUp = makeTodayParcel(
            "picked",
            "Adam Andersson",
            "pickedUp",
            "2026-09-04T10:00:00Z",
        );
        const noShow = makeTodayParcel(
            "no-show",
            "Anna Andersson",
            "noShow",
            "2026-09-04T11:00:00Z",
        );
        const upcoming = makeTodayParcel(
            "upcoming",
            "Zara Andersson",
            "upcoming",
            "2026-09-04T12:00:00Z",
        );

        expect(sortTodaysParcels([pickedUp, noShow, upcoming])).toEqual([
            upcoming,
            noShow,
            pickedUp,
        ]);
    });

    it("sorts by pickup time before name when multiple start times exist", () => {
        const laterAnna = makeTodayParcel(
            "later",
            "Anna Andersson",
            "upcoming",
            "2026-09-04T13:00:00Z",
        );
        const earlierZara = makeTodayParcel(
            "earlier",
            "Zara Andersson",
            "upcoming",
            "2026-09-04T12:00:00Z",
        );

        expect(sortTodaysParcels([laterAnna, earlierZara])).toEqual([earlierZara, laterAnna]);
    });

    it("sorts by the displayed first name when pickup times match", () => {
        const pickupTime = "2026-09-04T12:00:00Z";
        const zara = makeTodayParcel("zara", "Zara Andersson", "upcoming", pickupTime);
        const anna = makeTodayParcel("anna", "Anna Svensson", "upcoming", pickupTime);
        const bjorn = makeTodayParcel("bjorn", "Björn Karlsson", "upcoming", pickupTime);
        const parcels = [zara, anna, bjorn];

        expect(sortTodaysParcels(parcels)).toEqual([anna, bjorn, zara]);
        expect(parcels).toEqual([zara, anna, bjorn]);
    });
});

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
