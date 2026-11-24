import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({ pingHealthcheck: vi.fn() }));
vi.mock("@/app/utils/notifications/healthchecks", () => ({
    pingHealthcheck: mocks.pingHealthcheck,
}));

import { runSiteCheck } from "@/app/utils/scheduler";

describe("runSiteCheck", () => {
    const fetchMock = vi.fn();

    function answer(httpStatus: number, body: unknown) {
        fetchMock.mockResolvedValue({
            status: httpStatus,
            json: async () => body,
        });
    }

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal("fetch", fetchMock);
        vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://example.test");
        vi.stubEnv("HEALTHCHECKS_PING_KEY", "key123");
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it("pings the site check when the public /api/health is healthy", async () => {
        answer(200, { status: "healthy" });

        await runSiteCheck();

        expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/api/health");
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
        expect(mocks.pingHealthcheck).toHaveBeenCalledExactlyOnceWith("site");
    });

    it("sends nothing when /api/health is unhealthy", async () => {
        answer(503, { status: "unhealthy" });

        await runSiteCheck();

        expect(mocks.pingHealthcheck).not.toHaveBeenCalled();
    });

    it("sends nothing when the site is unreachable or answers with non-JSON", async () => {
        fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
        await runSiteCheck();

        fetchMock.mockResolvedValueOnce({
            status: 502,
            json: async () => {
                throw new SyntaxError("Unexpected token <");
            },
        });
        await runSiteCheck();

        expect(mocks.pingHealthcheck).not.toHaveBeenCalled();
    });

    it("does nothing without a ping key (dev, staging)", async () => {
        vi.stubEnv("HEALTHCHECKS_PING_KEY", "");

        await runSiteCheck();

        expect(fetchMock).not.toHaveBeenCalled();
    });
});
