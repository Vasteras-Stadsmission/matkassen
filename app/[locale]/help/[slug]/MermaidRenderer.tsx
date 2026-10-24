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
                // Mermaid 12 changed the flowchart defaults (ELK layout,
                // `neo` look, `redux-color` theme, narrower text wrapping
                // and a minimum node width). Our manuals only use
                // flowcharts, so pin the Mermaid 11 rendering to keep
                // their diagrams laid out as before.
                theme: "default",
                layout: "dagre",
                look: "classic",
                flowchart: {
                    wrappingWidth: 200,
                    minNodeWidth: 0,
                },
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
