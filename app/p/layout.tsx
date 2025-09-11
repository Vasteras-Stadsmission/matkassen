import type { Metadata } from "next";
import "@mantine/core/styles.css";

export const metadata: Metadata = {
    title: "Food Parcel - Matkassen",
    description: "Public food parcel pickup information",
    robots: "noindex, nofollow", // Don't index public parcel pages
};

export default function PublicParcelLayout({ children }: { children: React.ReactNode }) {
    return (
        <html data-mantine-color-scheme="light">
            <body>{children}</body>
        </html>
    );
}
