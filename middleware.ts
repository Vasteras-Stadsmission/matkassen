export { auth as middleware } from "@/auth";

// Add a matcher configuration to exclude paths that shouldn't be protected
export const config = {
    matcher: ["/((?!auth/error|api|_next/static|_next/image|favicon.svg|favicon.ico|$).*)"],
};
