/**
 * Layout for public privacy policy page.
 * Does NOT render <html>/<body> - those are handled by app/layout.tsx (root layout).
 * Nested layouts in Next.js App Router should only render their specific wrapper elements.
 *
 * Note: Metadata is generated dynamically in page.tsx based on the requested language.
 */
export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
