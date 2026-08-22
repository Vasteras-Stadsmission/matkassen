import { describe, expect, it } from "vitest";
import { getDailyCapacityState } from "@/app/utils/capacity/daily-capacity";

describe("getDailyCapacityState", () => {
    it("distinguishes available, exactly full, and over-capacity dates", () => {
        expect(getDailyCapacityState(19, 20)).toEqual({
            isLimited: true,
            isFull: false,
            isOverCapacity: false,
            excess: 0,
            remaining: 1,
        });
        expect(getDailyCapacityState(20, 20)).toEqual({
            isLimited: true,
            isFull: true,
            isOverCapacity: false,
            excess: 0,
            remaining: 0,
        });
        expect(getDailyCapacityState(23, 20)).toEqual({
            isLimited: true,
            isFull: true,
            isOverCapacity: true,
            excess: 3,
            remaining: 0,
        });
    });

    it("never marks an unlimited date as full or over capacity", () => {
        expect(getDailyCapacityState(500, null)).toEqual({
            isLimited: false,
            isFull: false,
            isOverCapacity: false,
            excess: 0,
            remaining: null,
        });
    });
});
