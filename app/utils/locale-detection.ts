/**
 * Locale detection utilities for public pages
 */

import { headers } from "next/headers";

export const SUPPORTED_LOCALES = [
    "sv", // Swedish
    "en", // English
    "ar", // Arabic
    "fa", // Persian
    "ku", // Kurdish
    "es", // Spanish
    "fr", // French
    "de", // German
    "el", // Greek
    "sw", // Swahili
    "so", // Somali
    "so_so", // Southern Somali
    "uk", // Ukrainian
    "ru", // Russian
    "ka", // Georgian
    "fi", // Finnish
    "it", // Italian
    "th", // Thai
    "vi", // Vietnamese
    "pl", // Polish
    "hy", // Armenian
] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function toSupportedLocale(locale?: string | null): SupportedLocale | undefined {
    if (!locale) {
        return undefined;
    }

    const normalized = locale.toLowerCase().replace(/-/g, "_");

    if (SUPPORTED_LOCALES.includes(normalized as SupportedLocale)) {
        return normalized as SupportedLocale;
    }

    return undefined;
}

/**
 * Detect locale for public pages based on:
 * 1. Accept-Language header
 * 2. Household locale (passed as parameter)
 * 3. Default to 'en'
 */
export async function detectPublicPageLocale(
    householdLocale?: string,
    explicitLocale?: string,
): Promise<SupportedLocale> {
    const overrideLocale = toSupportedLocale(explicitLocale);

    if (overrideLocale) {
        return overrideLocale;
    }

    // First try household locale if provided
    const householdPreferred = toSupportedLocale(householdLocale);

    if (householdPreferred) {
        return householdPreferred;
    }

    // Then try Accept-Language header
    try {
        const headersList = await headers();
        const acceptLanguage = headersList.get("accept-language");

        if (acceptLanguage) {
            // Parse Accept-Language header (format: "en-US,en;q=0.9,sv;q=0.8")
            const languages = acceptLanguage
                .split(",")
                .map(lang => lang.split(";")[0].trim().toLowerCase())
                .map(lang => lang.split("-")[0]); // Get just the language part (en from en-US)

            // Find first supported language
            for (const lang of languages) {
                const supported = toSupportedLocale(lang);

                if (supported) {
                    return supported;
                }
            }
        }
    } catch {
        // Failed to read Accept-Language header - continue with default
    }

    // Default to English
    return "en";
}

/**
 * Check if locale supports RTL (right-to-left) text direction
 */
export function isRtlLocale(locale: string): boolean {
    return locale === "ar" || locale === "fa" || locale === "ku";
}
