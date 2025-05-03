import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";

export default getRequestConfig(async ({ locale }) => {
    try {
        const messages = (await import(`../../../messages/${locale}.json`)).default;
        return {
            messages,
            locale, // Return the locale alongside messages
        };
    } catch {
        notFound();
    }
});
