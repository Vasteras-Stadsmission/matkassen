import { NextRequest, NextResponse } from "next/server";
import { storeCspViolationAction } from "@/app/db/actions";
import { logError } from "@/app/utils/logger";
import { checkRateLimit } from "@/app/utils/rate-limit";

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

// Max body size for CSP reports (10KB)
const MAX_BODY_SIZE = 10 * 1024;

// Handle CSP violation reports
export async function POST(request: NextRequest) {
    try {
        // Rate limit: 20 reports per minute per IP
        // Use x-real-ip (set by nginx from $remote_addr) — not spoofable like x-forwarded-for first hop
        const ip = request.headers.get("x-real-ip") ?? "unknown";
        const rateLimit = checkRateLimit(`csp:${ip}`, { maxRequests: 20, windowMs: 60 * 1000 });
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { status: "rate_limited" },
                { status: 429, headers: corsHeaders },
            );
        }

        // Read body and reject oversized payloads
        const bodyText = await request.text();
        if (bodyText.length > MAX_BODY_SIZE) {
            return NextResponse.json(
                { error: "Payload too large" },
                { status: 413, headers: corsHeaders },
            );
        }

        // Parse the JSON body
        const body = JSON.parse(bodyText);

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
        logError("Error processing CSP report", error, { method: "POST", path: "/api/csp-report" });

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
