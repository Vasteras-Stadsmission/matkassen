import { marked, type Token, type Tokens } from "marked";
import DOMPurify from "isomorphic-dompurify";
import { makeUniqueSlugger } from "./slugify-heading";

/**
 * Convert markdown to sanitized HTML for privacy policy content.
 *
 * Uses `marked` for proper markdown parsing and `DOMPurify` for XSS protection.
 * Links are configured to open in new tabs with security attributes.
 */

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Slugger scoped to a single parse. `markdownToHtml` reassigns this
// at the start of every call so anchor ids are deterministic per
// document and do not leak state across sibling parses.
let slugForHeading: (text: string) => string = makeUniqueSlugger();

// Configure marked for security and UX
marked.use({
    renderer: {
        // Make links open in new tab with security attributes
        link({ href, title, text }) {
            const titleAttr = title ? ` title="${title}"` : "";
            return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
        },
        // Emit a placeholder div for ```mermaid fenced blocks; the
        // MermaidRenderer client component hydrates these into SVG
        // diagrams on the client. Non-mermaid code blocks fall through
        // to marked's default <pre><code> rendering.
        code({ text, lang }) {
            if (lang === "mermaid") {
                return `<div class="mermaid">${escapeHtml(text)}</div>\n`;
            }
            return false;
        },
        // Add a stable `id` to every heading so the /help search UI and
        // any external link can deep-link to a specific section. Slugs
        // come from the plain-text heading (tags stripped) and are
        // de-duplicated across a single parse.
        heading(this: { parser: { parseInline: (tokens: Token[]) => string } }, token) {
            const { depth, tokens, text } = token as Tokens.Heading;
            const innerHtml = this.parser.parseInline(tokens);
            const slug = slugForHeading(text);
            const idAttr = slug ? ` id="${slug}"` : "";
            return `<h${depth}${idAttr}>${innerHtml}</h${depth}>\n`;
        },
    },
});

/**
 * Convert markdown to sanitized HTML
 * @param markdown - Raw markdown string
 * @returns Sanitized HTML string safe for dangerouslySetInnerHTML
 */
export function markdownToHtml(markdown: string): string {
    if (!markdown) return "";

    // Reset per-parse slug state so anchors are deterministic regardless
    // of what was parsed before.
    slugForHeading = makeUniqueSlugger();

    // Parse markdown to HTML
    const rawHtml = marked.parse(markdown, { async: false }) as string;

    // Sanitize to prevent XSS - allow safe HTML elements and attributes.
    // Table/hr support is needed by the /help manuals (which include status
    // tables and section dividers). Agreement/privacy content won't be
    // affected since they don't use those markdown features.
    const sanitized = DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "p",
            "br",
            "hr",
            "strong",
            "em",
            "ul",
            "ol",
            "li",
            "a",
            "blockquote",
            "code",
            "pre",
            "table",
            "thead",
            "tbody",
            "tr",
            "th",
            "td",
            // <div class="mermaid"> placeholders are produced by the code
            // renderer above and hydrated client-side by MermaidRenderer.
            "div",
        ],
        ALLOWED_ATTR: ["href", "title", "target", "rel", "class", "id"],
        // Ensure links keep their security attributes after sanitization
        ADD_ATTR: ["target", "rel"],
    });

    // Only the `mermaid` class is used by this pipeline; strip any other
    // class values DOMPurify let through so the `class` allowance can't
    // be abused by crafted markdown input to attach arbitrary CSS.
    return sanitized.replace(/class="([^"]*)"/g, (match, value) =>
        value === "mermaid" ? match : "",
    );
}
