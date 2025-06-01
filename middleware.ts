import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { routing } from "@/app/i18n/routing";
import type { NextRequest } from "next/server";

// Generate a random nonce for CSP
function generateNonce(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Buffer.from(array).toString("base64");
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
        "upgrade-insecure-requests",
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

    // 1. Complete bypass patterns - these should never be processed by any middleware
    // This is critical for Auth.js and static assets to work correctly
    const bypassPatterns = [
        /^\/api\/auth(.*)$/, // Auth.js API endpoints
        /^\/_next\/.*/, // Next.js internal routes (JS, CSS, etc)
        /^\/favicon\.svg$/, // Favicon
        /^\/flags\/.*/, // Flag images
    ];

    if (bypassPatterns.some(pattern => pattern.test(pathname))) {
        return NextResponse.next();
    }

    // 2. Public routes - apply only i18n middleware, no auth checks
    const publicPatterns = [
        /^\/(en|sv)\/auth\/.*/, // Auth pages with locale prefixes
    ];

    const isPublicRoute = publicPatterns.some(pattern => pattern.test(pathname));

    // Helper function to add CSP headers to response
    const addCSPHeaders = (response: NextResponse) => {
        response.headers.set("Content-Security-Policy", createCSP(nonce));
        response.headers.set("x-nonce", nonce);
        return response;
    };

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
export const config = {
    matcher: [
        // Match all paths that require locale handling
        "/((?!api|_next|static|favicon.svg|flags)[^/]+)/:path*",
    ],
};
