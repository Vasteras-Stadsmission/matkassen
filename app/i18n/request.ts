import { getRequestConfig } from "next-intl/server";
import { hasLocale, IntlErrorCode } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
    // Validate that the incoming locale parameter is valid
    const requested = await requestLocale;
    const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

    return {
        locale,
        messages: (await import(`../../messages/${locale}.json`)).default,
        // Configure formats for dates, times, and numbers
        formats: {
            dateTime: {
                short: {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                },
            },
            number: {
                precise: {
                    maximumFractionDigits: 2,
                },
            },
            list: {
                enumeration: {
                    style: "long",
                    type: "conjunction",
                },
            },
        },
        // Handle errors gracefully
        onError(error) {
            if (error.code === IntlErrorCode.MISSING_MESSAGE) {
                // Missing translations are expected and should only log in development
                console.error(error);
            } else {
                // Other errors indicate a bug in the app and should be reported
                console.error("INTERNATIONALIZATION ERROR:", error);
            }
        },
        // Provide fallbacks for missing messages
        getMessageFallback({ namespace, key, error }) {
            const path = [namespace, key].filter(part => part != null).join(".");

            if (error.code === IntlErrorCode.MISSING_MESSAGE) {
                // Return a reasonable fallback for missing messages
                return `${path} (missing translation)`;
            }

            // Otherwise return error message
            return `Error: ${error.message}`;
        },
    };
});
