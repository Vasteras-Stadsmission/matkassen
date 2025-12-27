import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

/**
 * Convert markdown to sanitized HTML for privacy policy content.
 *
 * Uses `marked` for proper markdown parsing and `DOMPurify` for XSS protection.
 * Links are configured to open in new tabs with security attributes.
 */

// Configure marked for security and UX
marked.use({
    renderer: {
        // Make links open in new tab with security attributes
        link({ href, title, text }) {
            const titleAttr = title ? ` title="${title}"` : "";
            return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
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

    // Parse markdown to HTML
    const rawHtml = marked.parse(markdown, { async: false }) as string;

    // Sanitize to prevent XSS - allow safe HTML elements and attributes
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
            "strong",
            "em",
            "ul",
            "ol",
            "li",
            "a",
            "blockquote",
            "code",
            "pre",
        ],
        ALLOWED_ATTR: ["href", "title", "target", "rel"],
        // Ensure links keep their security attributes after sanitization
        ADD_ATTR: ["target", "rel"],
    });

    return sanitized;
}
