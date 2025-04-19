import type { Metadata } from "next";
import "@mantine/core/styles.css";
import { ColorSchemeScript } from "@mantine/core";
import { ClientProviders } from "./client-providers";

export const metadata: Metadata = {
    title: "Matkassen",
    description: "Food parcel handout administration app.",
    icons: {
        icon: "/favicon.svg",
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" data-mantine-color-scheme="light">
            <head>
                <ColorSchemeScript defaultColorScheme="light" />
                {/* Disable automatic preloading of fonts and CSS that might not be used immediately */}
                <meta name="next-font-preconnect" content="false" />
                <meta name="next-size-adjust" content="false" />
            </head>
            <body>
                {/* ClientProviders handles all client-side wrappers */}
                <ClientProviders>
                    <main id="main-content">{children}</main>
                </ClientProviders>
            </body>
        </html>
    );
}
