export interface LanguageMapping {
    value: string;
    label: string;
}

// Define the supported locales
// We keep track of these explicitly to control which languages are available in the app
const SUPPORTED_LOCALES = [
    "sv",
    "en",
    "ar",
    "fa",
    "ku",
    "es",
    "fr",
    "de",
    "el",
    "sw",
    "so",
    "so_so",
    "uk",
    "ru",
    "ka",
    "fi",
    "it",
    "th",
    "vi",
    "pl",
    "hy",
];

// Helper function to get language name using Intl.DisplayNames
export function getLanguageName(locale: string, displayLocale: string = "sv"): string {
    try {
        // Use the Intl.DisplayNames API to get localized language names
        const displayNames = new Intl.DisplayNames([displayLocale], { type: "language" });

        // Special handling for variants like "so_so" which Intl.DisplayNames doesn't support directly
        if (locale === "so_so") {
            return displayLocale === "sv" ? "sydsomaliska" : "South Somali";
        }

        return displayNames.of(locale) || locale;
    } catch {
        // Fallback in case Intl.DisplayNames is not supported or throws an error
        return locale;
    }
}

// Get all supported locale codes
export function getSupportedLocales(): string[] {
    return SUPPORTED_LOCALES;
}

// Get language select options with Swedish at the top, rest sorted alphabetically
export function getLanguageSelectOptions(displayLocale: string = "sv"): LanguageMapping[] {
    const supportedLocales = getSupportedLocales();

    // Place Swedish at the top of the list
    const options: LanguageMapping[] = [
        {
            value: "sv",
            label: getLanguageName("sv", displayLocale),
        },
    ];

    // Add the rest of the languages sorted alphabetically
    const otherLocales = supportedLocales.filter(locale => locale !== "sv");
    const sortedOptions = otherLocales
        .map(locale => ({
            value: locale,
            label: getLanguageName(locale, displayLocale),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, displayLocale));

    return [...options, ...sortedOptions];
}

// Export a pre-computed set of language options for common display locales
// This improves the API by hiding implementation details
export const languageOptions = {
    sv: getLanguageSelectOptions("sv"),
    en: getLanguageSelectOptions("en"),
};
