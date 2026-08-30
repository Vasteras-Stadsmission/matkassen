// Health check endpoint for deployment verification
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { client } from "@/app/db/drizzle";
import { schedulerHealthCheck } from "@/app/utils/scheduler";
import {
    sendSmsHealthAlert,
    sendDatabaseHealthAlert,
    sendDiskSpaceHealthAlert,
} from "@/app/utils/notifications/slack";
import { promises as fs } from "fs";
import { join } from "path";
import { logger, logError } from "@/app/utils/logger";
import { checkRateLimit } from "@/app/utils/rate-limit";

const HEALTH_RATE_LIMIT = { maxRequests: 120, windowMs: 60 * 1000 };
const HEALTH_CACHE_TTL_MS = 2_000;

interface HealthResult {
    body: Record<string, unknown>;
    status: number;
}

let cachedHealthResult: (HealthResult & { expiresAt: number }) | null = null;
let healthCheckInFlight: Promise<HealthResult> | null = null;

function createHealthResponse(result: HealthResult): NextResponse {
    return new NextResponse(JSON.stringify(result.body), {
        status: result.status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate",
        },
    });
}

function sanitizePublicDetails(details: Record<string, unknown>): Record<string, unknown> {
    if (process.env.NODE_ENV !== "production") return details;

    // Preserve the intentional operational contract while keeping raw
    // exception messages in server logs where they belong.
    const publicDetails = { ...details };
    delete publicDetails.error;
    delete publicDetails.recoveryError;
    return publicDetails;
}

export async function GET(request: NextRequest) {
    const ip = request.headers.get("x-real-ip") ?? "unknown";
    const rateLimit = checkRateLimit(`health:${ip}`, HEALTH_RATE_LIMIT);

    if (!rateLimit.allowed) {
        return NextResponse.json(
            { status: "rate_limited", timestamp: new Date().toISOString() },
            {
                status: 429,
                headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate",
                    "Retry-After": Math.max(
                        1,
                        Math.ceil((rateLimit.resetTime - Date.now()) / 1000),
                    ).toString(),
                },
            },
        );
    }

    // Keep development and tests request-specific. Production responses do
    // not contain request metadata and can safely share a short-lived result.
    if (process.env.NODE_ENV !== "production") {
        return createHealthResponse(await runHealthCheck(request));
    }

    const now = Date.now();
    if (cachedHealthResult && cachedHealthResult.expiresAt > now) {
        return createHealthResponse(cachedHealthResult);
    }

    if (!healthCheckInFlight) {
        healthCheckInFlight = runHealthCheck(request);
    }

    const currentCheck = healthCheckInFlight;
    try {
        const result = await currentCheck;
        cachedHealthResult = {
            ...result,
            expiresAt: Date.now() + HEALTH_CACHE_TTL_MS,
        };
        return createHealthResponse(result);
    } finally {
        if (healthCheckInFlight === currentCheck) {
            healthCheckInFlight = null;
        }
    }
}

async function runHealthCheck(request: NextRequest): Promise<HealthResult> {
    const timestamp = new Date().toISOString();

    try {
        // Check if we're in a test environment
        const isTestEnvironment = process.env.NODE_ENV === "test";

        if (isTestEnvironment) {
            // Skip database checks in test environment
            const body = {
                status: "healthy",
                timestamp,
                service: "matkassen-web",
                environment: "test",
                checks: {
                    webServer: "ok",
                    database: "skipped (test environment)",
                },
                debug: {
                    headers: {
                        "host": request.headers.get("host"),
                        "x-forwarded-host": request.headers.get("x-forwarded-host"),
                        "x-forwarded-port": request.headers.get("x-forwarded-port"),
                        "x-forwarded-proto": request.headers.get("x-forwarded-proto"),
                    },
                    url: request.url,
                    nextUrl: request.nextUrl.href,
                },
            };
            return {
                body,
                status: 200,
            };
        }

        // Test database connectivity
        let dbStatus = "unknown";
        let dbError = null;

        try {
            // Simple query to test database connectivity
            await client`SELECT 1 as health_check`;
            dbStatus = "ok";
        } catch (error) {
            dbStatus = "error";
            dbError = error instanceof Error ? error.message : "Database connection failed";
            logError("Database health check failed", error);
        }

        // Send Slack alert for database issues (with state tracking)
        if (process.env.NODE_ENV === "production") {
            sendDatabaseHealthAlert(dbStatus === "ok", dbError || undefined).catch(err =>
                logError("Failed to send database health alert", err),
            );
        }

        // Test unified scheduler health (SMS + Anonymization)
        let schedulerStatus = "unknown";
        let schedulerDetails = null;
        let willAttemptRecovery = false;

        try {
            const schedulerHealth = await schedulerHealthCheck();
            schedulerStatus = schedulerHealth.status;
            schedulerDetails = schedulerHealth.details;

            // Self-healing: If scheduler is not running in production, try to start it
            if (
                process.env.NODE_ENV === "production" &&
                schedulerHealth.details.schedulerRunning === false
            ) {
                willAttemptRecovery = true;
                logger.warn("Unified scheduler not running, attempting auto-recovery");

                try {
                    const { startScheduler } = await import("@/app/utils/scheduler");
                    startScheduler();
                    logger.info("Unified scheduler started via health check auto-recovery");

                    // Re-run the health check rather than assuming success.
                    // startScheduler() catches per-task failures internally
                    // (e.g. a malformed ANONYMIZATION_SCHEDULE cron string
                    // leaves anonymizationTask null without throwing) — if
                    // we hardcoded "healthy" here, the next health response
                    // would briefly lie before the next poll caught up.
                    const recheck = await schedulerHealthCheck();
                    schedulerStatus = recheck.status;
                    schedulerDetails = {
                        ...recheck.details,
                        recoveryAttempted: true,
                        autoStarted: true,
                    };
                } catch (startError) {
                    logError("Failed to auto-start unified scheduler", startError);
                    schedulerDetails = {
                        ...schedulerDetails,
                        recoveryAttempted: true,
                        recoveryError:
                            startError instanceof Error ? startError.message : "Unknown error",
                    };
                    willAttemptRecovery = false;
                }
            }
        } catch (error) {
            schedulerStatus = "error";
            schedulerDetails = {
                error: error instanceof Error ? error.message : "Scheduler health check failed",
            };
            logError("Scheduler health check failed", error);
        }

        // Send Slack alert for scheduler issues (with intelligent state tracking)
        if (process.env.NODE_ENV === "production") {
            const schedulerIsHealthy = schedulerStatus === "healthy";

            if (!willAttemptRecovery) {
                // Use SMS health alert for backward compatibility with existing Slack state tracking
                sendSmsHealthAlert(schedulerIsHealthy, schedulerDetails || {}).catch(err =>
                    logError("Failed to send scheduler health alert", err),
                );
            }
        }

        // Test disk space
        let diskStatus = "unknown";
        let diskDetails = null;

        try {
            // Simple disk space check: try to write a small temp file
            // Use /tmp which is mounted as tmpfs (writable even with read-only root filesystem)
            const tempFile = join("/tmp", "health_check_" + Date.now() + ".txt");
            const testData = "health_check_" + Date.now();

            await fs.writeFile(tempFile, testData);
            await fs.unlink(tempFile); // Clean up immediately

            diskStatus = "ok";
            diskDetails = { status: "writable" };
        } catch (error) {
            diskStatus = "error";
            diskDetails = {
                error: error instanceof Error ? error.message : "Disk space check failed",
                status: "write_failed",
            };
            logError("Disk space check failed", error);
        }

        // Send Slack alert for disk space issues (with state tracking)
        if (process.env.NODE_ENV === "production") {
            const diskIsHealthy = diskStatus === "ok";
            sendDiskSpaceHealthAlert(diskIsHealthy).catch(err =>
                logError("Failed to send disk space health alert", err),
            );
        }

        // Determine overall health status
        // Database failure = unhealthy (critical)
        // Scheduler failure = degraded (non-critical - web still works)
        // Disk failure = degraded (non-critical but concerning)
        const isCriticallyHealthy = dbStatus === "ok";
        const isDegraded =
            schedulerStatus === "unhealthy" ||
            schedulerStatus === "error" ||
            diskStatus === "error";

        const status = !isCriticallyHealthy ? "unhealthy" : isDegraded ? "degraded" : "healthy";
        const httpStatus = !isCriticallyHealthy ? 503 : 200; // Always return 200 if web+DB works

        const response = {
            status,
            timestamp,
            service: "matkassen-web",
            checks: {
                webServer: "ok",
                database: dbStatus,
                scheduler: schedulerStatus,
                diskSpace: diskStatus,
                ...(process.env.NODE_ENV !== "production" && dbError && { databaseError: dbError }),
                ...(schedulerDetails && {
                    schedulerDetails: sanitizePublicDetails(schedulerDetails),
                }),
                ...(diskDetails && { diskDetails: sanitizePublicDetails(diskDetails) }),
            },
            // Debug info only in local development (not staging or production)
            ...(process.env.NODE_ENV === "development" && {
                debug: {
                    headers: {
                        "host": request.headers.get("host"),
                        "x-forwarded-host": request.headers.get("x-forwarded-host"),
                        "x-forwarded-port": request.headers.get("x-forwarded-port"),
                        "x-forwarded-proto": request.headers.get("x-forwarded-proto"),
                    },
                    url: request.url,
                    nextUrl: request.nextUrl.href,
                },
            }),
        };

        return {
            body: response,
            status: httpStatus,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logError("Health check failed", error);

        return {
            body: {
                status: "unhealthy",
                ...(process.env.NODE_ENV !== "production" && { error: errorMessage }),
                timestamp,
                service: "matkassen-web",
                checks: {
                    webServer: "error",
                    database: "unknown",
                    scheduler: "unknown",
                    diskSpace: "unknown",
                },
            },
            status: 500,
        };
    }
}
