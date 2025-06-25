// Health check endpoint for deployment verification
import { NextResponse } from "next/server";
import { client } from "@/app/db/drizzle";

export async function GET() {
    const timestamp = new Date().toISOString();

    try {
        // Check if we're in a test environment
        const isTestEnvironment = process.env.NODE_ENV === "test";

        if (isTestEnvironment) {
            // Skip database checks in test environment
            return NextResponse.json(
                {
                    status: "healthy",
                    timestamp,
                    service: "matkassen-web",
                    environment: "test",
                    checks: {
                        webServer: "ok",
                        database: "skipped (test environment)",
                    },
                },
                { status: 200 },
            );
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

        // Determine overall health status
        const isHealthy = dbStatus === "ok";
        const status = isHealthy ? "healthy" : "unhealthy";
        const httpStatus = isHealthy ? 200 : 503;

        const response = {
            status,
            timestamp,
            service: "matkassen-web",
            checks: {
                webServer: "ok",
                database: dbStatus,
                ...(dbError && { databaseError: dbError }),
            },
        };

        return NextResponse.json(response, { status: httpStatus });
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
                },
            },
            { status: 500 },
        );
    }
}
