/**
 * White-Label Configuration
 *
 * Single source of truth for brand identity.
 * Set these via environment variables in production.
 *
 * Note: Validation happens at server startup (runtime), not build time,
 * to allow Docker builds without env vars.
 */

import { PHASE_PRODUCTION_BUILD } from "next/constants";

const isProduction = process.env.NODE_ENV === "production";
const isServer = typeof window === "undefined";

// Detect build phase using Next.js official constant
// CRITICAL: We rely solely on NEXT_PHASE to avoid false positives.
// If NEXT_PHASE is not set during `next build`, Next.js should set it.
// We do NOT use missing-env heuristics because those same vars are required at runtime,
// which would cause misconfigured production deployments to silently skip validation.
const isBuildPhase = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;

// Always provide safe defaults for build - validation happens at runtime
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || "DevApp";

export const SMS_SENDER_NAME = (() => {
    // Explicit override (for SMS providers with character limits)
    const explicitSender = process.env.NEXT_PUBLIC_SMS_SENDER || process.env.HELLO_SMS_FROM;
    if (explicitSender) {
        return explicitSender;
    }

    // In production, we need a shorter SMS sender because HelloSMS has 11-char limit
    // "Matcentralen" (12 chars) exceeds the limit, so provide a safe production default
    if (isProduction && !isBuildPhase) {
        // If BRAND_NAME is set but no explicit SMS sender, truncate to 11 chars
        const brandName = process.env.NEXT_PUBLIC_BRAND_NAME;
        if (brandName && brandName.length > 11) {
            console.warn(
                `⚠️  BRAND_NAME "${brandName}" (${brandName.length} chars) exceeds HelloSMS 11-char limit.` +
                    `\n   Using truncated version: "${brandName.slice(0, 11)}"` +
                    `\n   Set NEXT_PUBLIC_SMS_SENDER or HELLO_SMS_FROM to override.`,
            );
            return brandName.slice(0, 11);
        }
        return brandName || "AppSMS";
    }

    // Development/test fallback
    return BRAND_NAME || "DevSMS";
})();

export const BASE_URL = (() => {
    if (process.env.NEXT_PUBLIC_BASE_URL) {
        return process.env.NEXT_PUBLIC_BASE_URL;
    }

    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }

    // Development/test fallback
    return "http://localhost:3000";
})();

/**
 * Generate absolute URL for a path
 * @example generateUrl("/p/abc123") → "https://matcentralen.com/p/abc123"
 */
export function generateUrl(path: string): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${BASE_URL}${cleanPath}`;
}

// Validate ONLY when server starts in production (not during build)
// This allows Docker builds to succeed without env vars
if (isProduction && isServer && !isBuildPhase) {
    const errors: string[] = [];

    if (!process.env.NEXT_PUBLIC_BRAND_NAME) {
        errors.push("NEXT_PUBLIC_BRAND_NAME is required in production");
    }

    if (!process.env.NEXT_PUBLIC_BASE_URL && !process.env.VERCEL_URL) {
        errors.push("NEXT_PUBLIC_BASE_URL is required in production");
    }

    if (BASE_URL && !BASE_URL.startsWith("https://")) {
        errors.push(`BASE_URL must use HTTPS in production (got: ${BASE_URL})`);
    }

    if (errors.length > 0) {
        console.error("\n❌ White-label configuration errors:");
        errors.forEach(e => console.error(`  - ${e}`));
        console.error("\nThe application cannot start without proper configuration.\n");
        process.exit(1); // Kill the server immediately
    }

    console.log("✅ White-label configuration validated");
}
