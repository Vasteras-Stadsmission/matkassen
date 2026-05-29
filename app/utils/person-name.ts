const WHITESPACE_RUN = /[\s\p{Zs}]+/gu;
const DISALLOWED_NAME_CHARACTERS = /[\p{Cc}\p{Cf}]/u;
const SUSPICIOUS_NAME_CONTENT = /\p{N}/u;

export type PersonNameNormalizationResult =
    | { success: true; value: string }
    | { success: false; reason: "empty" | "invalid_characters" };

export function normalizePersonName(value: string): PersonNameNormalizationResult {
    const normalized = normalizePersonNameForDisplay(value);

    if (!normalized) {
        return { success: false, reason: "empty" };
    }

    if (DISALLOWED_NAME_CHARACTERS.test(normalized)) {
        return { success: false, reason: "invalid_characters" };
    }

    return { success: true, value: normalized };
}

export function normalizePersonNameForDisplay(value: string): string {
    return value.normalize("NFC").replace(WHITESPACE_RUN, " ").trim();
}

export function normalizePersonNameForComparison(value: string): string {
    return normalizePersonNameForDisplay(value).toLowerCase();
}

export function containsSuspiciousNameContent(value: string): boolean {
    return SUSPICIOUS_NAME_CONTENT.test(normalizePersonNameForDisplay(value));
}
