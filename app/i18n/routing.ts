import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
    // Define all supported locales
    locales: ["sv", "en"],

    // Use Swedish as the default locale
    defaultLocale: "sv",
});

/**
 * Strip locale prefix from a pathname (e.g. /sv/households → /households).
 * next-intl's router.push and redirect add the locale automatically,
 * so callbackUrl must not include it.
 */
export function stripLocalePrefix(pathname: string): string {
    for (const locale of routing.locales) {
        if (pathname === `/${locale}`) return "/";
        if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
    }
    return pathname;
}
