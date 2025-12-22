import type { Metadata } from "next";
import "@mantine/core/styles.css";
import { BRAND_NAME } from "@/app/config/branding";

export const metadata: Metadata = {
    title: `Privacy Policy - ${BRAND_NAME}`,
    description: "Privacy policy and data protection information",
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
    return (
        <html data-mantine-color-scheme="light">
            <body>{children}</body>
        </html>
    );
}
