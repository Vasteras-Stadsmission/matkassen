import type { Metadata } from "next";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "mantine-datatable/styles.css";
import { ColorSchemeScript } from "@mantine/core";

export const metadata: Metadata = {
    title: "Matkassen",
    description: "Food parcel handout administration app.",
    icons: {
        icon: "/favicon.svg",
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html data-mantine-color-scheme="light">
            <head>
                <ColorSchemeScript defaultColorScheme="light" />
                <meta name="next-font-preconnect" content="false" />
                <meta name="next-size-adjust" content="false" />
            </head>
            <body>{children}</body>
        </html>
    );
}
