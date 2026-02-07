import { auth } from "@/auth";
import { redirect } from "@/app/i18n/navigation";
import { SignInClient } from "./SignInClient";

type SearchParams = {
    callbackUrl?: string;
    error?: string;
};

type Params = {
    locale: string;
};

/**
 * Validates a callback URL to prevent open redirect vulnerabilities.
 * Only allows relative paths that don't escape to external domains.
 */
function sanitizeCallbackUrl(url: string): string {
    const fallback = "/";

    const hasUnsafeChars = (value: string) =>
        value.includes("\\") || /[\u0000-\u001F\u007F]/.test(value);

    const containsPercentEscapes = (value: string) => /%[0-9A-Fa-f]{2}/.test(value);

    // Reject whitespace/control chars and obvious non-path values early.
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

    // Ensure URL parsing can't reinterpret the value as an external origin (e.g. "/\\evil.com").
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

// Server component for handling authentication redirect
export default async function SignInPage({
    searchParams,
    params,
}: {
    searchParams: SearchParams | Promise<SearchParams>;
    params: Params | Promise<Params>;
}) {
    const session = await auth();

    // Destructure once to avoid multiple awaits
    const { callbackUrl: rawCallbackUrl = "/", error } = await searchParams;
    const { locale } = await params;

    // Sanitize callback URL to prevent open redirect
    const callbackUrl = sanitizeCallbackUrl(rawCallbackUrl);

    const isEligible = !!session?.user?.githubUsername && session.user.orgEligibility?.ok === true;

    // If user is logged in but not eligible, redirect to the access-denied page with reason
    if (session?.user?.githubUsername && !isEligible) {
        const reason = session.user.orgEligibility?.status ?? "unknown";
        redirect({
            href: `/auth/access-denied?reason=${encodeURIComponent(reason)}`,
            locale,
        });
    }

    if (isEligible) {
        redirect({
            href: callbackUrl,
            locale,
        });
    }

    return <SignInClient callbackUrl={callbackUrl} errorType={error} />;
}
