import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Food Parcel - Matkassen",
    description: "Public food parcel pickup information",
    robots: "noindex, nofollow", // Don't index public parcel pages
};

/**
 * Layout for public parcel pages.
 * Does NOT render <html>/<body> - those are handled by app/layout.tsx (root layout).
 * Nested layouts in Next.js App Router should only render their specific wrapper elements.
 */
export default function PublicParcelLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
