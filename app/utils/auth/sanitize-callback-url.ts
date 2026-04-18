/**
 * Validates a callback URL to prevent open-redirect vulnerabilities.
 *
 * Only same-origin absolute paths are allowed. Anything that could be
 * reinterpreted as an external origin (protocol-relative URLs, backslash
 * confusion, whitespace/control-char smuggling, single- or double-encoded
 * variants) is coerced to the fallback "/".
 *
 * Pure function — safe to import from both server and client components.
 */
export function sanitizeCallbackUrl(url: string | undefined | null): string {
    const fallback = "/";

    if (typeof url !== "string" || url.length === 0 || url.length > 2000) {
        return fallback;
    }

    const hasUnsafeChars = (value: string) =>
        value.includes("\\") || /[\u0000-\u001F\u007F]/.test(value);

    const containsPercentEscapes = (value: string) => /%[0-9A-Fa-f]{2}/.test(value);

    // Reject surrounding whitespace and obvious non-path values early.
    if (url !== url.trim() || hasUnsafeChars(url)) {
        return fallback;
    }

    // Decode up to twice to catch common double-encoding bypasses.
    let decoded = url;
    for (let i = 0; i < 2; i++) {
        if (!containsPercentEscapes(decoded)) break;
        try {
            const next = decodeURIComponent(decoded);
            if (next === decoded) break;
            decoded = next;
            if (hasUnsafeChars(decoded)) {
                return fallback;
            }
        } catch {
            return fallback;
        }
    }

    // Only allow absolute paths (same-origin) and reject protocol-relative URLs.
    if (!decoded.startsWith("/") || decoded.startsWith("//")) {
        return fallback;
    }

    // Ensure URL parsing can't reinterpret the value as an external origin
    // (e.g. "/\\evil.com" which some parsers treat as "//evil.com").
    try {
        const base = new URL("https://example.invalid");
        const parsed = new URL(decoded, base);
        if (parsed.origin !== base.origin) {
            return fallback;
        }

        const relative = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        if (!relative.startsWith("/") || relative.startsWith("//") || hasUnsafeChars(relative)) {
            return fallback;
        }

        return relative;
    } catch {
        return fallback;
    }
}
