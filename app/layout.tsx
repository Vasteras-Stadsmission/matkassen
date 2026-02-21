import type { Metadata } from "next";
import "@mantine/core/styles.css";
import "@mantine/charts/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";
import "mantine-datatable/styles.css";

export const metadata: Metadata = {
    title: "Matkassen",
    description: "Food parcel handout administration app.",
    icons: {
        icon: "/favicon.svg",
    },
    robots: {
        index: false,
        follow: false,
        googleBot: {
            index: false,
            follow: false,
        },
    },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html data-mantine-color-scheme="light">
            <head>
                <meta name="next-font-preconnect" content="false" />
                <meta name="next-size-adjust" content="false" />
            </head>
            <body>{children}</body>
        </html>
    );
}
