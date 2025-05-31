import { NextRequest, NextResponse } from "next/server";
import { storeCspViolationAction } from "@/app/db/actions";

// CORS headers for CSP report endpoint
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

// Handle CORS preflight requests
export async function OPTIONS() {
    return new NextResponse("", {
        status: 200,
        headers: corsHeaders,
    });
}

// Handle CSP violation reports
export async function POST(request: NextRequest) {
    try {
        // Parse the JSON body
        const body = await request.json();

        // Extract CSP report (handle both wrapped and direct formats)
        const report = body["csp-report"] || body;

        // Get user agent from headers
        const userAgent = request.headers.get("user-agent");

        // Map CSP report fields to our database schema
        const violationData = {
            blockedUri: report["blocked-uri"],
            violatedDirective: report["violated-directive"],
            effectiveDirective: report["effective-directive"],
            originalPolicy: report["original-policy"],
            disposition: report.disposition || "enforce", // Default to "enforce" if not specified
            referrer: report.referrer,
            sourceFile: report["source-file"],
            lineNumber: report["line-number"],
            columnNumber: report["column-number"],
            userAgent: userAgent || undefined,
            scriptSample: report["script-sample"],
        };

        // Store the violation in the database (but don't fail if storage fails)
        await storeCspViolationAction(violationData);

        // Always return success to the browser to avoid retry loops
        return NextResponse.json(
            { status: "received" },
            {
                status: 200,
                headers: corsHeaders,
            },
        );
    } catch (error) {
        console.error("Error processing CSP report:", error);

        // Return 400 for malformed requests
        return NextResponse.json(
            { error: "Invalid report" },
            {
                status: 400,
                headers: corsHeaders,
            },
        );
    }
}
