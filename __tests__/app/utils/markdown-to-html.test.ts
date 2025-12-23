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
            expect(result).toContain("<h1>");
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
});
