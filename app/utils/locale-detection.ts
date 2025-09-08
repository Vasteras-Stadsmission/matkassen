/**
 * Locale detection utilities for public pages
 */

import { headers } from "next/headers";

export const SUPPORTED_LOCALES = ["sv", "en", "ar", "so"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Detect locale for public pages based on:
 * 1. Accept-Language header
 * 2. Household locale (passed as parameter)
 * 3. Default to 'en'
 */
export async function detectPublicPageLocale(householdLocale?: string): Promise<SupportedLocale> {
    // First try household locale if provided
    if (householdLocale && SUPPORTED_LOCALES.includes(householdLocale as SupportedLocale)) {
        return householdLocale as SupportedLocale;
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
                if (SUPPORTED_LOCALES.includes(lang as SupportedLocale)) {
                    return lang as SupportedLocale;
                }
            }
        }
    } catch (error) {
        console.warn("Failed to read Accept-Language header:", error);
    }

    // Default to English
    return "en";
}

/**
 * Check if locale supports RTL (right-to-left) text direction
 */
export function isRtlLocale(locale: string): boolean {
    return locale === "ar";
}
