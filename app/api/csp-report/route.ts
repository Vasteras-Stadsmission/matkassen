import { NextRequest, NextResponse } from "next/server";

/**
 * CSP Violation Reporting Endpoint
 *
 * This endpoint receives Content Security Policy violation reports
 * and logs them for monitoring purposes.
 */
export async function POST(request: NextRequest) {
    try {
        const report = await request.json();

        // Log CSP violations for monitoring
        console.log("🔒 CSP Violation Report:", {
            timestamp: new Date().toISOString(),
            userAgent: request.headers.get("user-agent"),
            violation: report,
        });

        // In a production environment, you might want to:
        // - Store violations in a database
        // - Send alerts for critical violations
        // - Aggregate violation statistics

        return NextResponse.json({ status: "received" }, { status: 200 });
    } catch (error) {
        console.error("❌ Error processing CSP report:", error);
        return NextResponse.json({ error: "Invalid report" }, { status: 400 });
    }
}

// Handle preflight requests
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 200,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}
