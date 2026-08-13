import { describe, expect, it } from "vitest";
import {
    getSmsStatusDisplay,
    shouldShowSmsIntentLabels,
    type SmsStatusDisplayRecord,
} from "@/components/sms-status-display";

const NOW = new Date("2026-08-06T12:00:00.000Z").getTime();

function sentRecord(overrides: Partial<SmsStatusDisplayRecord> = {}): SmsStatusDisplayRecord {
    return {
        status: "sent",
        intent: "pickup_reminder",
        sentAt: "2026-08-06T11:00:00.000Z",
        providerStatus: null,
        ...overrides,
    };
}

describe("getSmsStatusDisplay", () => {
    it("keeps a recent unconfirmed SMS neutral", () => {
        expect(getSmsStatusDisplay(sentRecord(), NOW)).toEqual({
            source: "provider",
            key: "awaiting",
            color: "gray",
        });
    });

    it("keeps an SMS sent exactly 24 hours ago awaiting confirmation", () => {
        const sentAt = new Date(NOW - 24 * 60 * 60 * 1000).toISOString();

        expect(getSmsStatusDisplay(sentRecord({ sentAt }), NOW).key).toBe("awaiting");
    });

    it.each([null, "waiting"] as const)(
        "marks an old %s provider status as stale",
        providerStatus => {
            const sentAt = new Date(NOW - 24 * 60 * 60 * 1000 - 1).toISOString();

            expect(getSmsStatusDisplay(sentRecord({ sentAt, providerStatus }), NOW)).toEqual({
                source: "provider",
                key: "stale",
                color: "orange",
            });
        },
    );

    it.each([
        ["delivered", "delivered", "green"],
        ["failed", "failed", "red"],
        ["not delivered", "notDelivered", "orange"],
        ["waiting", "waiting", "yellow"],
        ["expired", "expired", "red"],
        ["out_of_credits", "outOfCredits", "red"],
        ["received", "unexpected", "orange"],
    ] as const)("maps %s to an explicit provider outcome", (providerStatus, key, color) => {
        expect(getSmsStatusDisplay(sentRecord({ providerStatus }), NOW)).toEqual({
            source: "provider",
            key,
            color,
        });
    });

    it.each([
        ["queued", "blue"],
        ["sending", "gray"],
        ["retrying", "gray"],
        ["failed", "red"],
        ["cancelled", "gray"],
    ] as const)("maps the %s internal status", (status, color) => {
        expect(
            getSmsStatusDisplay(
                sentRecord({ status, sentAt: undefined, providerStatus: null }),
                NOW,
            ),
        ).toEqual({
            source: "internal",
            key: status,
            color,
        });
    });

    it("keeps a malformed sent record without a sent time awaiting confirmation", () => {
        expect(getSmsStatusDisplay(sentRecord({ sentAt: undefined }), NOW).key).toBe("awaiting");
    });

    it("warns about an unknown provider status instead of showing it as awaiting", () => {
        expect(getSmsStatusDisplay(sentRecord({ providerStatus: "future_status" }), NOW)).toEqual({
            source: "provider",
            key: "unexpected",
            color: "orange",
        });
    });
});

describe("shouldShowSmsIntentLabels", () => {
    it("hides a redundant label for one pickup reminder", () => {
        expect(shouldShowSmsIntentLabels([{ intent: "pickup_reminder" }])).toBe(false);
    });

    it("shows labels when the history contains multiple reminders", () => {
        expect(
            shouldShowSmsIntentLabels([
                { intent: "pickup_reminder" },
                { intent: "pickup_reminder" },
            ]),
        ).toBe(true);
    });

    it("shows a label for one exceptional SMS", () => {
        expect(shouldShowSmsIntentLabels([{ intent: "pickup_cancelled" }])).toBe(true);
    });

    it("shows labels for a mixed history", () => {
        expect(
            shouldShowSmsIntentLabels([
                { intent: "pickup_reminder" },
                { intent: "pickup_cancelled" },
            ]),
        ).toBe(true);
    });
});
