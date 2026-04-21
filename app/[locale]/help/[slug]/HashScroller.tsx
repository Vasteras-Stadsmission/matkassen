"use client";

import { useEffect } from "react";

/**
 * Scroll to the URL hash target after client-side navigation.
 *
 * App Router's `<Link href="/path#hash">` scrolls to the hash target on
 * navigation, but programmatic `router.push("/path#hash")` does not —
 * the /help search UI uses `router.push` (so it can clear the query and
 * close the results palette on the same click) and needs this helper
 * to restore the scroll.
 *
 * The retry loop is insurance against Suspense streaming: if the heading
 * isn't in the DOM on the first tick we re-try briefly, then give up.
 * The URL and content are still correct either way.
 */
export function HashScroller() {
    useEffect(() => {
        if (typeof window === "undefined") return;
        const hash = window.location.hash;
        if (!hash) return;

        // Our slugs are ASCII-only (see slugifyHeading), so decoding the
        // hash isn't needed for links we produce. Skip the decode so a
        // malformed externally-crafted hash like `#%E0%A4%A` can't throw
        // a URIError and break the effect.
        const id = hash.slice(1);
        if (!id) return;

        let cancelled = false;
        let attempts = 0;

        const tryScroll = () => {
            if (cancelled) return;
            const el = document.getElementById(id);
            if (el) {
                el.scrollIntoView({ block: "start", behavior: "smooth" });
                return;
            }
            if (attempts++ < 50) {
                setTimeout(tryScroll, 20);
            }
        };

        tryScroll();

        return () => {
            cancelled = true;
        };
    }, []);

    return null;
}
