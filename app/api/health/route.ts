// Health check endpoint for deployment verification
import { NextResponse } from "next/server";

export async function GET() {
    try {
        // Simple health check - could be extended to check database connectivity
        return NextResponse.json(
            {
                status: "healthy",
                timestamp: new Date().toISOString(),
                service: "matkassen-web",
            },
            { status: 200 },
        );
    } catch (error) {
        return NextResponse.json(
            {
                status: "unhealthy",
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: new Date().toISOString(),
                service: "matkassen-web",
            },
            { status: 500 },
        );
    }
}
