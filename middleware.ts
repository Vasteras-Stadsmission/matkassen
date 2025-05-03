import createMiddleware from "next-intl/middleware";
import { routing } from "@/app/i18n/routing";

// This middleware intercepts requests to `/` and will redirect
// to a locale-prefixed pathname (e.g. `/en`).
export default createMiddleware(routing);

// Only run the middleware on the home page
export const config = {
    matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
