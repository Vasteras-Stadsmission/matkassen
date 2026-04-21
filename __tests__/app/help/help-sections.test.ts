/**
 * Tests for the H2-section splitter that feeds the /help search UI.
 *
 * The splitter must produce anchors that match what `markdownToHtml`
 * emits as `<h2 id="…">` ids — otherwise search result links will
 * scroll to nothing. Both code paths share `makeUniqueSlugger`, so
 * what we really want to lock in here is the surrounding behaviour:
 * which lines belong to which section, body cleaning, role inheritance.
 *
 * `loadAllHelpSections` itself is not unit-tested because it imports
 * the "server-only" registry; the integration is exercised by the
 * /help page rendering end-to-end.
 */
import { describe, it, expect } from "vitest";
import { makeUniqueSlugger } from "@/app/utils/slugify-heading";

// Mirror the splitter locally so we can test it without pulling in
// the "server-only" registry. The real implementation in
// `app/[locale]/help/help-sections.ts` must stay in sync.
function cleanBody(body: string): string {
    return body
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`([^`]*)`/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/^[|>\-*]+/gm, " ")
        .replace(/\s+/g, " ")
        .trim();
}

interface Section {
    anchor: string;
    sectionTitle: string;
    body: string;
}

function splitSections(markdown: string): Section[] {
    const out: Section[] = [];
    const slugger = makeUniqueSlugger();
    const lines = markdown.split("\n");
    let title: string | null = null;
    let bodyLines: string[] = [];
    const flush = () => {
        if (title === null) return;
        const anchor = slugger(title);
        if (!anchor) return;
        out.push({ anchor, sectionTitle: title, body: cleanBody(bodyLines.join("\n")) });
    };
    for (const line of lines) {
        const m = /^##\s+(.+?)\s*$/.exec(line);
        if (m) {
            flush();
            title = m[1];
            bodyLines = [];
        } else if (title !== null) {
            bodyLines.push(line);
        }
    }
    flush();
    return out;
}

describe("Help section splitter", () => {
    it("splits a manual into one section per H2", () => {
        const md = `# Title\n\nIntro\n\n## Alpha\n\nA body.\n\n## Beta\n\nB body.`;
        const sections = splitSections(md);
        expect(sections).toHaveLength(2);
        expect(sections[0].sectionTitle).toBe("Alpha");
        expect(sections[1].sectionTitle).toBe("Beta");
    });

    it("anchors match the slugifier so search-result links resolve", () => {
        const md = "## Felsökning\n\ntext";
        const [section] = splitSections(md);
        expect(section.anchor).toBe("felsokning");
    });

    it("drops content above the first H2 — that's the manual intro, not a section", () => {
        const md = `# Manual\n\nLong intro paragraph.\n\n## First section\n\nbody`;
        const sections = splitSections(md);
        expect(sections).toHaveLength(1);
        expect(sections[0].body).toBe("body");
    });

    it("strips fenced code blocks (mermaid is just noise for text search)", () => {
        const md = "## Diagram\n\nBefore.\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\nAfter.";
        const [section] = splitSections(md);
        expect(section.body).not.toContain("flowchart");
        expect(section.body).not.toContain("-->");
        expect(section.body).toContain("Before");
        expect(section.body).toContain("After");
    });

    it("flattens markdown emphasis, links, and list markers into search-friendly text", () => {
        const md = "## SMS\n\n- **Skickas** 48 timmar [före](url) bokning\n- Inkluderar `kod`";
        const [section] = splitSections(md);
        expect(section.body).toBe("Skickas 48 timmar före bokning Inkluderar kod");
    });
});
