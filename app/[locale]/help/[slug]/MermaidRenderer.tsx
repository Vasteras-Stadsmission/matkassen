"use client";

import { useEffect } from "react";

/**
 * Hydrate any `<div class="mermaid">` placeholders emitted by
 * `markdown-to-html.ts` into real SVG diagrams. Mermaid is imported
 * dynamically so it never ships in the server bundle and only loads
 * on pages that actually render a manual.
 */
export function MermaidRenderer() {
    useEffect(() => {
        let cancelled = false;

        (async () => {
            const { default: mermaid } = await import("mermaid");
            if (cancelled) return;

            mermaid.initialize({
                startOnLoad: false,
                // `strict` refuses to render diagrams containing raw HTML
                // in labels, which matches the sanitisation posture of
                // markdown-to-html.ts.
                securityLevel: "strict",
                theme: "default",
            });

            try {
                await mermaid.run({ querySelector: ".mermaid" });
            } catch {
                // A single malformed diagram shouldn't take down the
                // whole manual page — mermaid already renders an error
                // block in-place for the offending diagram.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    return null;
}
