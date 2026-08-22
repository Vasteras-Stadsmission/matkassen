import { describe, expect, it } from "vitest";
import {
    dateKeyToStockholmDate,
    enumerateDateKeys,
    isValidDateKey,
    normalizeDateKeys,
    resolveEffectiveDailyLimit,
    stockholmDateKey,
} from "@/app/utils/capacity/daily-limits";

describe("daily parcel limit helpers", () => {
    it("uses a date override before the location default", () => {
        expect(resolveEffectiveDailyLimit(20, 12)).toBe(12);
        expect(resolveEffectiveDailyLimit(20, undefined)).toBe(20);
        expect(resolveEffectiveDailyLimit(null, 8)).toBe(8);
        expect(resolveEffectiveDailyLimit(null, undefined)).toBeNull();
    });

    it("validates real canonical calendar dates", () => {
        expect(isValidDateKey("2028-02-29")).toBe(true);
        expect(isValidDateKey("2027-02-29")).toBe(false);
        expect(isValidDateKey("2026-13-01")).toBe(false);
        expect(isValidDateKey("01-08-2026")).toBe(false);
    });

    it("deduplicates and orders selections", () => {
        expect(normalizeDateKeys(["2026-09-03", "2026-08-25", "2026-09-03"])).toEqual([
            "2026-08-25",
            "2026-09-03",
        ]);
    });

    it("enumerates ranges across month and year boundaries", () => {
        expect(enumerateDateKeys("2026-12-30", "2027-01-02")).toEqual([
            "2026-12-30",
            "2026-12-31",
            "2027-01-01",
            "2027-01-02",
        ]);
    });

    it("rejects invalid, reversed, and oversized ranges", () => {
        expect(() => enumerateDateKeys("2026-02-29", "2026-03-01")).toThrow("INVALID_DATE");
        expect(() => enumerateDateKeys("2026-03-02", "2026-03-01")).toThrow("INVALID_DATE_RANGE");
        expect(() => enumerateDateKeys("2026-01-01", "2027-01-02")).toThrow(
            "INVALID_DATE_SELECTION_SIZE",
        );
    });

    it("accepts at most 366 unique dates in one mutation", () => {
        const allowed = enumerateDateKeys("2028-01-01", "2028-12-31");
        expect(allowed).toHaveLength(366);
        expect(normalizeDateKeys([...allowed, allowed[0]])).toHaveLength(366);
        expect(() => normalizeDateKeys([])).toThrow("INVALID_DATE_SELECTION_SIZE");
    });

    it("round-trips Stockholm dates across DST transitions", () => {
        for (const dateKey of ["2026-03-29", "2026-10-25"]) {
            expect(stockholmDateKey(dateKeyToStockholmDate(dateKey))).toBe(dateKey);
        }
    });
});
