import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
    // Define all supported locales
    locales: ["sv", "en"],

    // Use Swedish as the default locale
    defaultLocale: "sv",
});
