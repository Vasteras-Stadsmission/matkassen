// Health check endpoint for deployment verification
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { client } from "@/app/db/drizzle";
import { smsHealthCheck } from "@/app/utils/sms/scheduler";
import {
    sendSmsHealthAlert,
    sendDatabaseHealthAlert,
    sendDiskSpaceHealthAlert,
} from "@/app/utils/notifications/slack";
import { promises as fs } from "fs";
import { join } from "path";

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
            console.error("Database health check failed:", error);
        }

        // Send Slack alert for database issues (with state tracking)
        if (process.env.NODE_ENV === "production") {
            sendDatabaseHealthAlert(dbStatus === "ok", dbError || undefined).catch(console.error);
        }

        // Test SMS service health
        let smsStatus = "unknown";
        let smsDetails = null;

        try {
            const smsHealth = await smsHealthCheck();
            smsStatus = smsHealth.status;
            smsDetails = smsHealth.details;
        } catch (error) {
            smsStatus = "error";
            smsDetails = {
                error: error instanceof Error ? error.message : "SMS health check failed",
            };
            console.error("SMS health check failed:", error);
        }

        // Send Slack alert for SMS issues (with state tracking)
        if (process.env.NODE_ENV === "production") {
            const smsIsHealthy = smsStatus === "ok";
            sendSmsHealthAlert(smsIsHealthy, smsDetails || {}).catch(console.error);
        }

        // Test disk space
        let diskStatus = "unknown";
        let diskDetails = null;

        try {
            // Simple disk space check: try to write a small temp file
            const tempFile = join(process.cwd(), "temp_health_check.txt");
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
            console.error("Disk space check failed:", error);
        }

        // Send Slack alert for disk space issues (with state tracking)
        if (process.env.NODE_ENV === "production") {
            const diskIsHealthy = diskStatus === "ok";
            sendDiskSpaceHealthAlert(diskIsHealthy).catch(console.error);
        }

        // Determine overall health status
        // Database failure = unhealthy (critical)
        // SMS failure = degraded (non-critical - web still works)
        // Disk failure = degraded (non-critical but concerning)
        const isCriticallyHealthy = dbStatus === "ok";
        const isDegraded =
            smsStatus === "unhealthy" || smsStatus === "error" || diskStatus === "error";

        const status = !isCriticallyHealthy ? "unhealthy" : isDegraded ? "degraded" : "healthy";
        const httpStatus = !isCriticallyHealthy ? 503 : 200; // Always return 200 if web+DB works

        const response = {
            status,
            timestamp,
            service: "matkassen-web",
            checks: {
                webServer: "ok",
                database: dbStatus,
                smsService: smsStatus,
                diskSpace: diskStatus,
                ...(dbError && { databaseError: dbError }),
                ...(smsDetails && { smsDetails }),
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
        console.error("Health check failed:", error);

        return NextResponse.json(
            {
                status: "unhealthy",
                error: errorMessage,
                timestamp,
                service: "matkassen-web",
                checks: {
                    webServer: "error",
                    database: "unknown",
                    smsService: "unknown",
                    diskSpace: "unknown",
                },
            },
            { status: 500 },
        );
    }
}
