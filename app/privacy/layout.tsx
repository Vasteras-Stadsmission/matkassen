import type { Metadata } from "next";
import { BRAND_NAME } from "@/app/config/branding";

export const metadata: Metadata = {
    title: `Privacy Policy - ${BRAND_NAME}`,
    description: "Privacy policy and data protection information",
    robots: "noindex, nofollow", // Don't index privacy policy pages (contain dynamic content)
};

/**
 * Layout for public privacy policy page.
 * Does NOT render <html>/<body> - those are handled by app/layout.tsx (root layout).
 * Nested layouts in Next.js App Router should only render their specific wrapper elements.
 */
export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
