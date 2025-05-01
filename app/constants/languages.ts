export interface LanguageMapping {
    value: string;
    label: string;
}

// Language codes mapped to their Swedish names
export const LANGUAGE_MAP: Record<string, string> = {
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
};

// Helper function to get language name in Swedish
export function getLanguageName(locale: string): string {
    return LANGUAGE_MAP[locale] || locale;
}

// Array of all supported locale codes
export const SUPPORTED_LOCALES = Object.keys(LANGUAGE_MAP);

// Get language select options with Swedish at the top, rest sorted alphabetically
export function getLanguageSelectOptions(): LanguageMapping[] {
    // Place Swedish at the top of the list
    const options: LanguageMapping[] = [{ value: "sv", label: LANGUAGE_MAP.sv }];

    // Add the rest of the languages sorted alphabetically
    const otherLocales = SUPPORTED_LOCALES.filter(locale => locale !== "sv");
    const sortedOptions = otherLocales
        .map(locale => ({
            value: locale,
            label: LANGUAGE_MAP[locale],
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "sv"));

    return [...options, ...sortedOptions];
}
