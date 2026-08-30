import "server-only";

import { db } from "./drizzle";
import { cspViolations } from "./schema";
import { logError } from "@/app/utils/logger";

export interface CspViolationInput {
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
}

/**
 * Persist a CSP violation received by the public, rate-limited route handler.
 *
 * This is deliberately a server-only utility rather than a Server Action. The
 * route handler is the sole public entry point and owns request size limits,
 * rate limiting, and parsing.
 */
export async function storeCspViolation(violationData: CspViolationInput): Promise<boolean> {
    try {
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

        return true;
    } catch (error) {
        logError("Error storing CSP violation", error, {
            violatedDirective: violationData.violatedDirective,
            blockedUri: violationData.blockedUri,
        });
        return false;
    }
}
