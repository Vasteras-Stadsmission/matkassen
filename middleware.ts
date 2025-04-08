export { auth as middleware } from "@/auth";

// Define which routes require authentication and which don't
export const config = {
    matcher: [
        // Protected routes that require authentication
        "/dashboard/:path*",
        "/profile/:path*",
        "/api/:path*",

        // Don't protect these routes
        "/((?!api|_next/static|_next/image|favicon.ico|auth|$).*)",
    ],
};
