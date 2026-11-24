import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock("@/app/utils/logger", () => ({ logError: mocks.logError }));

import { pingHealthcheck } from "@/app/utils/notifications/healthchecks";

describe("pingHealthcheck", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        fetchMock.mockResolvedValue({ ok: true, status: 200 });
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it("sends nothing without a ping key", async () => {
        vi.stubEnv("HEALTHCHECKS_PING_KEY", "");
        await pingHealthcheck("org-sync");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("pings the check's slug, with /fail for failures, and no body", async () => {
        vi.stubEnv("HEALTHCHECKS_PING_KEY", "key123");
        await pingHealthcheck("org-sync");
        await pingHealthcheck("sms-credits", "fail");

        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            "https://hc-ping.com/key123/org-sync",
            "https://hc-ping.com/key123/sms-credits/fail",
        ]);
        for (const [, init] of fetchMock.mock.calls) {
            expect(init.body).toBeUndefined();
        }
    });

    it("logs instead of throwing when healthchecks.io is unreachable", async () => {
        vi.stubEnv("HEALTHCHECKS_PING_KEY", "key123");
        fetchMock.mockRejectedValue(new Error("network down"));

        await expect(pingHealthcheck("org-sync")).resolves.toBeUndefined();
        expect(mocks.logError).toHaveBeenCalledOnce();
    });
});
