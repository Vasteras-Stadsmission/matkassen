import { describe, expect, it, vi } from "vitest";
import { getRescheduleErrorMessage } from "@/app/utils/schedule/reschedule-errors";

describe("getRescheduleErrorMessage terminal parcels", () => {
    it.each([
        ["ALREADY_PICKED_UP", "reschedule.alreadyPickedUpError"],
        ["ALREADY_NO_SHOW", "reschedule.alreadyNoShowError"],
    ])("maps %s to a specific translated explanation", (code, expectedKey) => {
        const t = vi.fn((key: string) => key);

        expect(getRescheduleErrorMessage(t, code, "fallback")).toBe(expectedKey);
        expect(t).toHaveBeenCalledWith(expectedKey);
    });
});
