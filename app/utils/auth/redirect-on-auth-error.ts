"use client";

/**
 * Wrapper around fetch that redirects to sign-in on 401.
 *
 * 401 = no session — redirect to sign-in so the user can authenticate.
 * 403 = authenticated but insufficient role — return as-is so callers can
 *       show an inline access-denied message rather than redirecting to login.
 */
export async function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const response = await fetch(input, init);

    if (response.status === 401) {
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
