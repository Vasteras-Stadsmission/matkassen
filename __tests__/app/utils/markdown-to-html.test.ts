import { describe, it, expect } from "vitest";
import { markdownToHtml } from "@/app/utils/markdown-to-html";

describe("markdownToHtml", () => {
    describe("XSS Protection", () => {
        it("should sanitize script tags", () => {
            const maliciousInput = '<script>alert("XSS")</script>';
            const result = markdownToHtml(maliciousInput);

            expect(result).not.toContain("<script>");
            expect(result).not.toContain("</script>");
        });

        it("should sanitize script tags in headers", () => {
            const maliciousInput = '# <script>alert("XSS")</script>';
            const result = markdownToHtml(maliciousInput);

            expect(result).not.toContain("<script>");
            expect(result).toMatch(/<h1(?: id="[^"]*")?>/);
        });

        it("should sanitize img tags with onerror handlers", () => {
            const maliciousInput = "**<img src=x onerror=alert(1)>**";
            const result = markdownToHtml(maliciousInput);

            expect(result).not.toContain("<img");
            expect(result).not.toContain("onerror");
        });

        it("should sanitize iframe tags", () => {
            const maliciousInput = '- <iframe src="evil.com"></iframe>';
            const result = markdownToHtml(maliciousInput);

            expect(result).not.toContain("<iframe");
        });

        it("should sanitize javascript: URLs in links", () => {
            const maliciousInput = "[Click me](javascript:alert(1))";
            const result = markdownToHtml(maliciousInput);

            // DOMPurify removes javascript: URLs entirely
            expect(result).not.toContain("javascript:");
        });

        it("should sanitize event handlers", () => {
            const maliciousInput = '<div onclick="alert(1)">Click</div>';
            const result = markdownToHtml(maliciousInput);

            expect(result).not.toContain("onclick");
        });
    });

    describe("Markdown Conversion", () => {
        it("should handle empty string", () => {
            expect(markdownToHtml("")).toBe("");
        });

        it("should convert h1 headers", () => {
            const result = markdownToHtml("# Heading 1");
            expect(result).toContain("<h1");
            expect(result).toContain("Heading 1");
        });

        it("should convert h2 headers", () => {
            const result = markdownToHtml("## Heading 2");
            expect(result).toContain("<h2");
            expect(result).toContain("Heading 2");
        });

        it("should convert h3 headers", () => {
            const result = markdownToHtml("### Heading 3");
            expect(result).toContain("<h3");
            expect(result).toContain("Heading 3");
        });

        it("should convert bold text", () => {
            const result = markdownToHtml("**bold text**");
            expect(result).toContain("<strong>");
            expect(result).toContain("bold text");
        });

        it("should convert italic text", () => {
            const result = markdownToHtml("*italic text*");
            expect(result).toContain("<em>");
            expect(result).toContain("italic text");
        });

        it("should convert links with security attributes", () => {
            const result = markdownToHtml("[Example](https://example.com)");

            expect(result).toContain('href="https://example.com"');
            expect(result).toContain('target="_blank"');
            expect(result).toContain('rel="noopener noreferrer"');
        });

        it("should convert unordered lists", () => {
            const input = "- Item 1\n- Item 2";
            const result = markdownToHtml(input);

            expect(result).toContain("<ul>");
            expect(result).toContain("<li>");
            expect(result).toContain("Item 1");
            expect(result).toContain("Item 2");
        });

        it("should convert ordered lists", () => {
            const input = "1. First\n2. Second";
            const result = markdownToHtml(input);

            expect(result).toContain("<ol>");
            expect(result).toContain("<li>");
        });

        it("should convert paragraphs", () => {
            const input = "First paragraph\n\nSecond paragraph";
            const result = markdownToHtml(input);

            expect(result).toContain("<p>");
        });

        it("should convert code blocks", () => {
            const input = "`inline code`";
            const result = markdownToHtml(input);

            expect(result).toContain("<code>");
        });

        it("should convert blockquotes", () => {
            const input = "> This is a quote";
            const result = markdownToHtml(input);

            expect(result).toContain("<blockquote>");
        });
    });

    describe("Edge Cases", () => {
        it("should handle text with ampersands", () => {
            const result = markdownToHtml("Tom & Jerry");
            expect(result).toContain("Tom");
            expect(result).toContain("Jerry");
        });

        it("should handle mixed content", () => {
            const input = `# Title

This is a **bold** paragraph with a [link](https://example.com).

- List item 1
- List item 2`;

            const result = markdownToHtml(input);

            expect(result).toContain("<h1>");
            expect(result).toContain("<strong>");
            expect(result).toContain("<a ");
            expect(result).toContain("<ul>");
            expect(result).toContain("<li>");
        });
    });

    describe("Manual-specific markdown features", () => {
        // These tags were added so the /help manuals can render tables and
        // section dividers. They must survive DOMPurify sanitisation.
        it("should render GFM tables with thead/tbody/tr/th/td", () => {
            const input = [
                "| Column A | Column B |",
                "| --- | --- |",
                "| Cell 1 | Cell 2 |",
                "| Cell 3 | Cell 4 |",
            ].join("\n");

            const result = markdownToHtml(input);

            expect(result).toContain("<table>");
            expect(result).toContain("<thead>");
            expect(result).toContain("<tbody>");
            expect(result).toContain("<tr>");
            expect(result).toContain("<th>");
            expect(result).toContain("<td>");
            expect(result).toContain("Column A");
            expect(result).toContain("Cell 4");
        });

        it("should render horizontal rules", () => {
            const input = "Before\n\n---\n\nAfter";
            const result = markdownToHtml(input);
            expect(result).toContain("<hr>");
        });

        it("should still sanitize dangerous content inside tables", () => {
            const input = ["| Col |", "| --- |", "| <script>alert(1)</script> |"].join("\n");

            const result = markdownToHtml(input);
            expect(result).not.toContain("<script>");
            expect(result).toContain("<table>");
        });

        it("should not allow raw <style> tags even when markdown lets them through", () => {
            const input = "Before\n\n<style>body{display:none}</style>\n\nAfter";
            const result = markdownToHtml(input);
            expect(result).not.toContain("<style>");
        });
    });

    describe("Heading anchors", () => {
        // The /help search deep-links into sections by slug, so every
        // heading needs a stable, URL-safe id.
        it("adds an id to h2 headings derived from the heading text", () => {
            const result = markdownToHtml("## Felsökning\n\nText.");
            expect(result).toContain('<h2 id="felsokning">');
        });

        it("adds ids to all heading levels (h1–h6)", () => {
            const result = markdownToHtml(
                "# Top\n\n## Mid\n\n### Deep\n\n#### Four\n\n##### Five\n\n###### Six",
            );
            expect(result).toContain('<h1 id="top">');
            expect(result).toContain('<h2 id="mid">');
            expect(result).toContain('<h3 id="deep">');
            expect(result).toContain('<h4 id="four">');
            expect(result).toContain('<h5 id="five">');
            expect(result).toContain('<h6 id="six">');
        });

        it("de-duplicates repeated heading slugs within a single document", () => {
            // If two sections happen to have the same title, the second
            // gets a suffix so anchor links stay unambiguous.
            const result = markdownToHtml("## Felsökning\n\nA\n\n## Felsökning\n\nB");
            expect(result).toContain('id="felsokning"');
            expect(result).toContain('id="felsokning-2"');
        });

        it("resets the slug counter between calls", () => {
            markdownToHtml("## Felsökning");
            const second = markdownToHtml("## Felsökning");
            // Without the reset, the second doc would get `felsokning-2`.
            expect(second).toContain('id="felsokning"');
            expect(second).not.toContain("felsokning-2");
        });

        it("omits id when the heading has no slug-producing characters", () => {
            const result = markdownToHtml("## !!!");
            expect(result).toMatch(/<h2>/);
            expect(result).not.toContain("id=");
        });
    });

    describe("Mermaid diagram placeholders", () => {
        it('renders ```mermaid blocks as <div class="mermaid"> for client-side hydration', () => {
            const input = "```mermaid\nflowchart TD\n    A --> B\n```";
            const result = markdownToHtml(input);

            expect(result).toContain('<div class="mermaid">');
            expect(result).toContain("flowchart TD");
            // The source must be HTML-escaped so mermaid reads it as text
            // rather than marked parsing arrows like `-->` as HTML comments.
            expect(result).toContain("A --&gt; B");
        });

        it("leaves non-mermaid code blocks as <pre><code>", () => {
            const input = "```ts\nconst x = 1;\n```";
            const result = markdownToHtml(input);

            expect(result).toContain("<pre>");
            expect(result).toContain("<code");
            expect(result).not.toContain('class="mermaid"');
        });

        it("strips non-mermaid class values so the class allowance can't be abused", () => {
            // Raw HTML inside markdown goes through DOMPurify; if someone
            // injects a <div class="something-else">, the class should be
            // removed even though the <div> itself is allowed.
            const input = 'Before\n\n<div class="injected">x</div>\n\nAfter';
            const result = markdownToHtml(input);

            expect(result).not.toContain('class="injected"');
        });
    });
});
