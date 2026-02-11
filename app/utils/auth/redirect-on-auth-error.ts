"use client";

/**
 * Wrapper around fetch that redirects to sign-in on 401/403.
 *
 * 401 = no session, 403 = stale session or org membership revoked.
 * In both cases the sign-in flow is the right recovery path:
 * - Valid users get a fresh session
 * - Ineligible users land on the access-denied page
 */
export async function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const response = await fetch(input, init);

    if (response.status === 401 || response.status === 403) {
        const callbackUrl = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/api/auth/signin?callbackUrl=${callbackUrl}`;
        // Return a long-pending promise so callers don't continue processing.
        // The page will unload when the redirect fires. If something blocks
        // navigation (e.g. a browser extension), reload as a fallback.
        return new Promise(() => {
            setTimeout(() => window.location.reload(), 3000);
        });
    }

    return response;
}
