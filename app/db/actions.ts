"use server";

import { db } from "./drizzle";
import { cspViolations } from "./schema";

/**
 * Store a Content Security Policy (CSP) violation report in the database.
 *
 * NOTE: This action is intentionally PUBLIC and does NOT use protectedAction wrapper.
 * CSP violation reports are sent automatically by browsers via the CSP report-uri/report-to
 * directive and do not include user authentication.
 *
 * Security considerations:
 * - No sensitive data is exposed through this endpoint
 * - Database writes are limited to violation reports only
 * - API endpoint (app/api/csp-report/route.ts) implements rate limiting
 * - Input data is sanitized and validated before storage
 * - Reports help identify security issues and improve application security posture
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
 */
export async function storeCspViolationAction(violationData: {
    blockedUri?: string;
    violatedDirective: string;
    effectiveDirective?: string;
    originalPolicy?: string;
    disposition: string;
    referrer?: string;
    sourceFile?: string;
    lineNumber?: number;
    columnNumber?: number;
    userAgent?: string;
    scriptSample?: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        // Map the camelCase input params to snake_case for Drizzle schema
        await db.insert(cspViolations).values({
            blocked_uri: violationData.blockedUri,
            violated_directive: violationData.violatedDirective,
            effective_directive: violationData.effectiveDirective,
            original_policy: violationData.originalPolicy,
            disposition: violationData.disposition,
            referrer: violationData.referrer,
            source_file: violationData.sourceFile,
            line_number: violationData.lineNumber,
            column_number: violationData.columnNumber,
            user_agent: violationData.userAgent,
            script_sample: violationData.scriptSample,
        });

        return { success: true };
    } catch (error) {
        console.error("Error storing CSP violation:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
        };
    }
}
