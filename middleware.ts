import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { routing } from "./app/i18n/routing";
import type { NextRequest } from "next/server";

// Generate a random nonce for CSP using Web Crypto API (Edge Runtime compatible)
function generateNonce(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array));
}

// Create Content Security Policy with nonce following Next.js official guidelines
function createCSP(nonce: string): string {
    const isDev = process.env.NODE_ENV === "development";

    const csp = [
        "default-src 'self'",
        // Following Next.js CSP documentation: use nonce + strict-dynamic
        // This allows nonce'd scripts to load other scripts (like Next.js chunks and Mantine)
        isDev
            ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'` // Dev needs unsafe-eval for hot reloading
            : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
        "style-src 'self' 'unsafe-inline'", // Mantine and Tailwind CSS still need unsafe-inline
        "img-src 'self' data: https://images.unsplash.com https://avatars.githubusercontent.com",
        "font-src 'self'",
        "connect-src 'self' https://api.github.com",
        "frame-ancestors 'none'",
        "form-action 'self' https://github.com",
        "base-uri 'self'",
        "object-src 'none'",
        // In development on http://localhost, forcing upgrade can break same-origin fetches
        // with "TypeError: Failed to fetch". Only enable in non-dev environments.
        ...(isDev ? [] : ["upgrade-insecure-requests"]),
        "report-uri /api/csp-report",
    ];

    return csp.join("; ");
}

// Create the internationalization middleware
const intlMiddleware = createIntlMiddleware(routing);

export default async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Generate nonce for CSP
    const nonce = generateNonce();

    // Note: Our config.matcher excludes:
    // - All /api/* routes (including /api/csp-report and /api/auth)
    // - /_next/* routes
    // - /static/* paths
    // - /favicon.svg and /flags/*
    // This means the middleware only runs on page routes that need locale handling

    // 2. Public routes - handle differently based on type
    const publicPatterns = [
        /^\/(en|sv)\/auth\/.*/, // Auth pages with locale prefixes
        /^\/auth\/.*/, // Auth pages without locale prefixes (from Auth.js redirects)
    ];

    // Public parcel pages should bypass locale routing entirely
    const publicParcelPatterns = [
        /^\/p\/.*/, // Public parcel pages (/p/[parcelId]) - no locale prefix
    ];

    const isPublicRoute = publicPatterns.some(pattern => pattern.test(pathname));
    const isPublicParcelRoute = publicParcelPatterns.some(pattern => pattern.test(pathname));

    // 2a. Public API routes - no auth, no i18n middleware
    const publicApiPatterns = [
        /^\/api\/sms\/callback\/.*/, // SMS delivery callback endpoint
    ];

    const isPublicApiRoute = publicApiPatterns.some(pattern => pattern.test(pathname));

    // Helper function to add CSP headers to response
    const addCSPHeaders = (response: NextResponse) => {
        response.headers.set("Content-Security-Policy", createCSP(nonce));
        response.headers.set("x-nonce", nonce);
        return response;
    };

    if (isPublicApiRoute) {
        const response = NextResponse.next();
        return addCSPHeaders(response);
    }

    // Handle public parcel pages - bypass locale routing completely
    if (isPublicParcelRoute) {
        const response = NextResponse.next();
        return addCSPHeaders(response);
    }

    if (isPublicRoute) {
        const response = intlMiddleware(request);
        return addCSPHeaders(response);
    }

    // 3. For all other routes, apply authentication check

    // Get the session token from cookies
    const authToken =
        request.cookies.get("next-auth.session-token")?.value ||
        request.cookies.get("__Secure-next-auth.session-token")?.value;

    // If no token and trying to access a protected route, redirect to signin
    if (!authToken) {
        // Get the locale from the pathname or use default
        const segments = pathname.split("/");
        // Type check to ensure segment[1] is a valid locale or use default
        const locale =
            segments[1] && routing.locales.includes(segments[1] as any)
                ? (segments[1] as (typeof routing.locales)[number])
                : routing.defaultLocale;

        // Create sign-in URL with the current URL as callbackUrl
        const signInUrl = new URL(`/${locale}/auth/signin`, request.nextUrl.origin);

        // Strip the locale prefix from the callback URL to prevent duplication
        let callbackUrl = new URL(request.url).pathname;
        if (segments[1] && routing.locales.includes(segments[1] as any)) {
            // Remove the locale prefix (e.g., /sv/households → /households)
            callbackUrl = "/" + segments.slice(2).join("/");
        }

        signInUrl.searchParams.set("callbackUrl", callbackUrl);

        const redirectResponse = NextResponse.redirect(signInUrl);
        return addCSPHeaders(redirectResponse);
    }

    // Apply the intl middleware for authenticated requests
    const response = intlMiddleware(request);
    return addCSPHeaders(response);
}

// Configure the matcher to specifically include paths we want to process
// This avoids applying middleware to static files or API routes
// Note: We intentionally exclude /api/csp-report from middleware processing
// because the CSP reporting endpoint should:
// 1. Not have CSP headers itself (would create a reporting loop)
// 2. Be accessible without authentication (for anonymous violation reports)
// 3. Not be subject to locale rules (it's a pure API endpoint)
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.svg (favicon file)
         * - flags (flag images)
         * - api/ (exclude all API routes from middleware)
         * This ensures only page routes are processed by the middleware.
         */
        "/((?!_next/static|_next/image|favicon.svg|flags/|api/).*)",
    ],
};
