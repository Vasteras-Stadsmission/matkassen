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

export async function GET(request: NextRequest) {
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
            return new NextResponse(JSON.stringify(body), {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-store, no-cache, must-revalidate",
                },
            });
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

                    // Update status to healthy since we just started it
                    schedulerStatus = "healthy";
                    schedulerDetails = {
                        ...schedulerDetails,
                        schedulerRunning: true,
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
                ...(dbError && { databaseError: dbError }),
                ...(schedulerDetails && { schedulerDetails }),
                ...(diskDetails && { diskDetails }),
            },
            ...(process.env.NODE_ENV !== "production" && {
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

        return new NextResponse(JSON.stringify(response), {
            status: httpStatus,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-store, no-cache, must-revalidate",
            },
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logError("Health check failed", error);

        return NextResponse.json(
            {
                status: "unhealthy",
                error: errorMessage,
                timestamp,
                service: "matkassen-web",
                checks: {
                    webServer: "error",
                    database: "unknown",
                    scheduler: "unknown",
                    diskSpace: "unknown",
                },
            },
            { status: 500 },
        );
    }
}
