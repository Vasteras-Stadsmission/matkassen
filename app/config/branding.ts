/**
 * White-label Configuration
 *
 * Single source of truth for brand name, domain, and external identifiers.
 * Change these values to rebrand the entire application.
 *
 * IMPORTANT: In production, required environment variables MUST be set.
 * The application will fail to start if critical config is missing.
 */

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = process.env.NODE_ENV === "development";
const isTest = process.env.NODE_ENV === "test";

// ============================================================================
// BRAND IDENTITY
// ============================================================================

/**
 * Application display name (used in UI, SMS, notifications)
 * REQUIRED in production
 */
export const BRAND_NAME = (() => {
    const brandName = process.env.NEXT_PUBLIC_BRAND_NAME;

    if (isProduction && !brandName) {
        throw new Error(
            "NEXT_PUBLIC_BRAND_NAME environment variable is required in production. " +
                "Set it to your brand name (e.g., 'Matcentralen').",
        );
    }

    // Development/test fallback
    return brandName || "DevApp";
})();

/**
 * SMS sender name (11 chars max for most SMS providers)
 * Defaults to BRAND_NAME if not explicitly set
 */
export const SMS_SENDER_NAME = (() => {
    const smsSender = process.env.HELLO_SMS_FROM;

    if (smsSender) {
        return smsSender;
    }

    // In production, use BRAND_NAME (already validated above)
    if (isProduction) {
        return BRAND_NAME;
    }

    // Development/test fallback
    return "DevSMS";
})();

/**
 * Organization identifier (used in URLs, file names, logs)
 * Auto-derived from BRAND_NAME if not explicitly set
 */
export const ORG_SLUG = (() => {
    const slug = process.env.NEXT_PUBLIC_ORG_SLUG;

    if (slug) {
        return slug;
    }

    // Auto-generate slug from brand name
    return BRAND_NAME.toLowerCase().replace(/\s+/g, "-");
})();

// ============================================================================
// DOMAIN CONFIGURATION
// ============================================================================

/**
 * Base URL for the application (protocol + domain)
 * Used for: OAuth callbacks, QR codes, SMS links, emails
 * REQUIRED in production
 */
export const BASE_URL = (() => {
    // 1. Explicit environment variable (highest priority)
    if (process.env.NEXT_PUBLIC_BASE_URL) {
        return process.env.NEXT_PUBLIC_BASE_URL;
    }

    // 2. Auto-detect from Vercel/production environment
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }

    // 3. Production MUST have explicit BASE_URL
    if (isProduction) {
        throw new Error(
            "NEXT_PUBLIC_BASE_URL environment variable is required in production. " +
                "Set it to your full domain URL (e.g., 'https://matcentralen.com').",
        );
    }

    // 4. Test environment
    if (isTest) {
        return process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
    }

    // 5. Development fallback
    return "http://localhost:3000";
})();

// ============================================================================
// DERIVED CONFIGURATION (auto-computed from above)
// ============================================================================

/** Production domain name (without protocol) */
export const DOMAIN_NAME = BASE_URL.replace(/^https?:\/\//, "");

/** WWW variant of domain (for SSL certs and redirects) */
export const DOMAIN_WITH_WWW = DOMAIN_NAME.startsWith("www.") ? DOMAIN_NAME : `www.${DOMAIN_NAME}`;

/** Check if current domain includes www */
export const HAS_WWW = DOMAIN_NAME.startsWith("www.");

/** Root domain without www (for cookies and DNS) */
export const ROOT_DOMAIN = HAS_WWW ? DOMAIN_NAME.replace(/^www\./, "") : DOMAIN_NAME;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate absolute URL for a given path
 * @example generateUrl("/p/abc123") → "https://matcentralen.com/p/abc123"
 */
export function generateUrl(path: string): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${BASE_URL}${cleanPath}`;
}

/**
 * Get brand configuration summary (useful for debugging)
 */
export function getBrandConfig() {
    return {
        brandName: BRAND_NAME,
        smsSender: SMS_SENDER_NAME,
        orgSlug: ORG_SLUG,
        baseUrl: BASE_URL,
        domain: DOMAIN_NAME,
        rootDomain: ROOT_DOMAIN,
        environment: process.env.NODE_ENV,
        hasWww: HAS_WWW,
    };
}

/**
 * Validate that all required branding configuration is present
 * Throws detailed error if anything is missing
 */
export function validateBrandingConfig(): void {
    const errors: string[] = [];

    if (isProduction) {
        if (!process.env.NEXT_PUBLIC_BRAND_NAME) {
            errors.push("NEXT_PUBLIC_BRAND_NAME is required in production");
        }

        if (!process.env.NEXT_PUBLIC_BASE_URL && !process.env.VERCEL_URL) {
            errors.push("NEXT_PUBLIC_BASE_URL is required in production");
        }

        if (!BASE_URL.startsWith("https://")) {
            errors.push(`BASE_URL must use HTTPS in production (got: ${BASE_URL})`);
        }
    }

    if (errors.length > 0) {
        throw new Error(
            `Branding configuration errors:\n${errors.map(e => `  - ${e}`).join("\n")}`,
        );
    }
}

// Run validation on module load in production
if (isProduction) {
    validateBrandingConfig();
}
