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

    // Helper function to add CSP headers to response
    const addCSPHeaders = (response: NextResponse) => {
        response.headers.set("Content-Security-Policy", createCSP(nonce));
        response.headers.set("x-nonce", nonce);
        return response;
    };

    // 1. Handle API routes first (new logic)
    if (pathname.startsWith("/api/")) {
        // Public API routes - no auth required
        const publicApiPatterns = [
            /^\/api\/health/, // Health check endpoint
            /^\/api\/auth\//, // NextAuth endpoints
            /^\/api\/csp-report/, // CSP violation reports
            /^\/api\/pickup-locations/, // Public pickup locations (unused but keeping public)
            /^\/api\/webhooks\//, // Webhook endpoints (authenticated via URL secret or other means)
        ];

        const isPublicApiRoute = publicApiPatterns.some(pattern => pattern.test(pathname));

        if (isPublicApiRoute) {
            const response = NextResponse.next();
            return addCSPHeaders(response);
        }

        // All other API routes require authentication
        // Basic cookie check - full validation happens in route handlers
        const authToken =
            request.cookies.get("next-auth.session-token.v4")?.value ||
            request.cookies.get("__Secure-next-auth.session-token.v4")?.value;

        if (!authToken) {
            const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            return addCSPHeaders(response);
        }

        // Basic check passed - route handlers will do full validation
        const response = NextResponse.next();
        return addCSPHeaders(response);
    }

    // 2. Handle page routes (existing logic)
    const publicPatterns = [
        /^\/(en|sv)\/auth\/.*/, // Auth pages with locale prefixes
        /^\/auth\/.*/, // Auth pages without locale prefixes (from Auth.js redirects)
    ];

    // Public pages that should bypass locale routing entirely
    const publicParcelPatterns = [
        /^\/p\/.*/, // Public parcel pages (/p/[parcelId]) - no locale prefix
        /^\/privacy\/?$/, // Public privacy policy page - no locale prefix (with or without trailing slash)
    ];

    const isPublicRoute = publicPatterns.some(pattern => pattern.test(pathname));
    const isPublicParcelRoute = publicParcelPatterns.some(pattern => pattern.test(pathname));

    // Handle public parcel pages - bypass locale routing completely
    if (isPublicParcelRoute) {
        const response = NextResponse.next();
        return addCSPHeaders(response);
    }

    if (isPublicRoute) {
        const response = intlMiddleware(request);
        return addCSPHeaders(response);
    }

    // 3. For all other page routes, apply authentication check

    // Get the session token from cookies
    const authToken =
        request.cookies.get("next-auth.session-token.v4")?.value ||
        request.cookies.get("__Secure-next-auth.session-token.v4")?.value;

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

// Configure the matcher to include both page routes and API routes
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.svg (favicon file)
         * - flags (flag images)
         * Now includes /api/ routes for authentication checking
         */
        "/((?!_next/static|_next/image|favicon.svg|flags/).*)",
    ],
};
