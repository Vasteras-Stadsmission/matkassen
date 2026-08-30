import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    client: vi.fn(),
    schedulerHealthCheck: vi.fn(),
    startScheduler: vi.fn(),
    sendSmsHealthAlert: vi.fn(),
    sendDatabaseHealthAlert: vi.fn(),
    sendDiskSpaceHealthAlert: vi.fn(),
    checkRateLimit: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    logError: vi.fn(),
}));

vi.mock("@/app/db/drizzle", () => ({
    client: mocks.client,
}));

vi.mock("@/app/utils/scheduler", () => ({
    schedulerHealthCheck: mocks.schedulerHealthCheck,
    startScheduler: mocks.startScheduler,
}));

vi.mock("@/app/utils/notifications/slack", () => ({
    sendSmsHealthAlert: mocks.sendSmsHealthAlert,
    sendDatabaseHealthAlert: mocks.sendDatabaseHealthAlert,
    sendDiskSpaceHealthAlert: mocks.sendDiskSpaceHealthAlert,
}));

vi.mock("@/app/utils/rate-limit", () => ({
    checkRateLimit: mocks.checkRateLimit,
}));

vi.mock("@/app/utils/logger", () => ({
    logger: {
        info: mocks.info,
        warn: mocks.warn,
    },
    logError: mocks.logError,
}));

const healthySchedulerDetails = {
    schedulerRunning: true,
    smsSchedulerRunning: true,
    anonymizationSchedulerRunning: true,
    smsReportSchedulerRunning: true,
    orgSyncSchedulerRunning: true,
    smsReconciliationRunning: true,
    smsTestMode: false,
    lastAnonymizationRun: "2026-08-27T10:00:00.000Z",
    lastAnonymizationStatus: "success",
    timestamp: "2026-08-27T10:00:00.000Z",
};

function createRequest(ip = "192.0.2.10"): NextRequest {
    return new NextRequest("https://matcentralen.com/api/health", {
        headers: { "x-real-ip": ip },
    });
}

async function importProductionRoute() {
    vi.stubEnv("NODE_ENV", "production");
    return import("@/app/api/health/route");
}

describe("public health route", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mocks.client.mockResolvedValue([{ health_check: 1 }]);
        mocks.schedulerHealthCheck.mockResolvedValue({
            status: "healthy",
            details: { ...healthySchedulerDetails },
        });
        mocks.startScheduler.mockReturnValue(undefined);
        mocks.sendSmsHealthAlert.mockResolvedValue(undefined);
        mocks.sendDatabaseHealthAlert.mockResolvedValue(undefined);
        mocks.sendDiskSpaceHealthAlert.mockResolvedValue(undefined);
        mocks.checkRateLimit.mockReturnValue({
            allowed: true,
            remaining: 119,
            resetTime: Date.now() + 60_000,
        });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("preserves the public deployment and monitoring contract", async () => {
        const { GET } = await importProductionRoute();

        const response = await GET(createRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("no-store, no-cache, must-revalidate");
        expect(body.status).toBe("healthy");
        expect(body.checks).toMatchObject({
            webServer: "ok",
            database: "ok",
            scheduler: "healthy",
            diskSpace: "ok",
        });
        expect(body.checks.schedulerDetails).toMatchObject({
            schedulerRunning: true,
            smsSchedulerRunning: true,
            anonymizationSchedulerRunning: true,
            smsTestMode: false,
            orgSyncSchedulerRunning: true,
            lastAnonymizationRun: "2026-08-27T10:00:00.000Z",
        });
    });

    it("redacts raw database errors from production responses", async () => {
        mocks.client.mockRejectedValue(
            new Error("connect ECONNREFUSED private-db.internal.example:5432"),
        );
        const { GET } = await importProductionRoute();

        const response = await GET(createRequest());
        const body = await response.json();

        expect(response.status).toBe(503);
        expect(body.checks.database).toBe("error");
        expect(body.checks).not.toHaveProperty("databaseError");
        expect(JSON.stringify(body)).not.toContain("private-db.internal.example");
    });

    it("redacts scheduler exception text while preserving operational fields", async () => {
        mocks.schedulerHealthCheck.mockResolvedValue({
            status: "unhealthy",
            details: {
                ...healthySchedulerDetails,
                anonymizationSchedulerRunning: false,
                error: "SENTINEL_SCHEDULER_ERROR",
                recoveryError: "SENTINEL_RECOVERY_ERROR",
            },
        });
        const { GET } = await importProductionRoute();

        const response = await GET(createRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.status).toBe("degraded");
        expect(body.checks.schedulerDetails).toMatchObject({
            schedulerRunning: true,
            smsTestMode: false,
            orgSyncSchedulerRunning: true,
        });
        expect(JSON.stringify(body)).not.toContain("SENTINEL_SCHEDULER_ERROR");
        expect(JSON.stringify(body)).not.toContain("SENTINEL_RECOVERY_ERROR");
    });

    it("rate limits abusive callers before running deep checks", async () => {
        mocks.checkRateLimit.mockReturnValue({
            allowed: false,
            remaining: 0,
            resetTime: Date.now() + 30_000,
            error: "Rate limit exceeded",
        });
        const { GET } = await importProductionRoute();

        const response = await GET(createRequest());

        expect(response.status).toBe(429);
        expect(response.headers.get("Retry-After")).toBeTruthy();
        expect(mocks.client).not.toHaveBeenCalled();
        expect(mocks.schedulerHealthCheck).not.toHaveBeenCalled();
    });

    it("reuses a production health result for a short burst", async () => {
        const { GET } = await importProductionRoute();

        const first = await GET(createRequest("192.0.2.20"));
        const second = await GET(createRequest("192.0.2.21"));

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(mocks.client).toHaveBeenCalledTimes(1);
        expect(mocks.schedulerHealthCheck).toHaveBeenCalledTimes(1);
    });
});
