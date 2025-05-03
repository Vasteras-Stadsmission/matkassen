export interface LanguageMapping {
    value: string;
    label: string;
}

// Language codes mapped to their names in different languages
export const LANGUAGE_MAP: Record<string, Record<string, string>> = {
    // Swedish language names
    sv: {
        sv: "Svenska",
        en: "Engelska",
        ar: "Arabiska",
        fa: "Persiska",
        ku: "Kurdiska",
        es: "Spanska",
        fr: "Franska",
        de: "Tyska",
        el: "Grekiska",
        sw: "Swahili",
        so: "Somaliska",
        so_so: "Sydsomaliska",
        uk: "Ukrainska",
        ru: "Ryska",
        ka: "Georgiska",
        fi: "Finska",
        it: "Italienska",
        th: "Thailändska",
        vi: "Vietnamesiska",
        pl: "Polska",
        hy: "Armeniska",
    },
    // English language names
    en: {
        sv: "Swedish",
        en: "English",
        ar: "Arabic",
        fa: "Persian",
        ku: "Kurdish",
        es: "Spanish",
        fr: "French",
        de: "German",
        el: "Greek",
        sw: "Swahili",
        so: "Somali",
        so_so: "South Somali",
        uk: "Ukrainian",
        ru: "Russian",
        ka: "Georgian",
        fi: "Finnish",
        it: "Italian",
        th: "Thai",
        vi: "Vietnamese",
        pl: "Polish",
        hy: "Armenian",
    },
};

// Helper function to get language name in the appropriate locale
export function getLanguageName(locale: string, displayLocale: string = "sv"): string {
    // If the requested display locale isn't supported, fall back to Swedish
    const languageMap = LANGUAGE_MAP[displayLocale] || LANGUAGE_MAP.sv;

    // Return the language name in the requested display locale, or fall back to the locale code itself
    return languageMap[locale] || locale;
}

// Get all supported locale codes
export function getSupportedLocales(): string[] {
    return Object.keys(LANGUAGE_MAP.sv);
}

// Get language select options with Swedish at the top, rest sorted alphabetically
export function getLanguageSelectOptions(displayLocale: string = "sv"): LanguageMapping[] {
    const localeMap = LANGUAGE_MAP[displayLocale] || LANGUAGE_MAP.sv;
    const supportedLocales = getSupportedLocales();

    // Place Swedish at the top of the list
    const options: LanguageMapping[] = [{ value: "sv", label: localeMap.sv }];

    // Add the rest of the languages sorted alphabetically
    const otherLocales = supportedLocales.filter(locale => locale !== "sv");
    const sortedOptions = otherLocales
        .map(locale => ({
            value: locale,
            label: localeMap[locale] || locale,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, displayLocale));

    return [...options, ...sortedOptions];
}
