import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { routing } from "@/app/i18n/routing";
import type { NextRequest } from "next/server";

// Create the internationalization middleware
const intlMiddleware = createIntlMiddleware(routing);

export default async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

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

    if (isPublicRoute) {
        return intlMiddleware(request);
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

        return NextResponse.redirect(signInUrl);
    }

    // Apply the intl middleware for authenticated requests
    return intlMiddleware(request);
}

// Configure the matcher to specifically include paths we want to process
// This avoids applying middleware to static files or API routes
export const config = {
    matcher: [
        // Match all paths that require locale handling
        "/((?!api|_next|static|favicon.svg|flags)[^/]+)/:path*",
    ],
};
