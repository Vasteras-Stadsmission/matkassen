import { ClientProviders } from "@/app/client-providers";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/app/i18n/routing";
import getMessagesFromRequest from "@/app/i18n/request";
import { LayoutClient } from "./layout.client";

export function generateStaticParams() {
    return routing.locales.map(locale => ({ locale }));
}

export default async function LocaleLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    // Ensure the locale from params is valid
    const { locale } = await params;

    if (!hasLocale(routing.locales, locale)) {
        notFound();
    }

    // Enable static rendering
    setRequestLocale(locale);

    // Get the messages for the current locale
    const messages = await getMessagesFromRequest({
        requestLocale: Promise.resolve(locale),
    });

    return (
        <NextIntlClientProvider locale={locale} messages={messages.messages}>
            <ClientProviders>
                <main id="main-content">
                    <LayoutClient>{children}</LayoutClient>
                </main>
            </ClientProviders>
        </NextIntlClientProvider>
    );
}
