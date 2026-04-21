import "server-only";

import { MANUALS, type ManualMeta, type ManualRole, loadManualContent } from "./manual-registry";
import { makeUniqueSlugger } from "@/app/utils/slugify-heading";

/**
 * A single H2 section extracted from a Swedish manual. The search UI
 * treats each of these as an independent document; section-level is
 * the right granularity for both ranking and deep-linking.
 */
export interface HelpSection {
    /** Composite id, stable across deploys: `${manualSlug}#${anchor}`. */
    id: string;
    /** Which manual this section lives in (e.g. "handout-staff"). */
    manualSlug: ManualMeta["slug"];
    /** Anchor id on the rendered page; agrees with markdownToHtml's ids. */
    anchor: string;
    /** Section heading text, Swedish as-authored. */
    sectionTitle: string;
    /** Searchable body — H2 heading removed, markdown-lite text. */
    body: string;
    /** Roles allowed to read the parent manual. */
    roles: readonly ManualRole[];
}

/**
 * Split a manual's markdown into H2 sections.
 *
 * Content before the first H2 (e.g. the top-level H1 intro) is
 * dropped — it isn't a deep-linkable section and is usually just
 * the manual's title, which the UI already surfaces.
 */
function splitIntoSections(manual: ManualMeta, markdown: string): HelpSection[] {
    const sections: HelpSection[] = [];
    const slugger = makeUniqueSlugger();

    const lines = markdown.split("\n");
    let currentTitle: string | null = null;
    let currentBodyLines: string[] = [];

    const flush = () => {
        if (currentTitle === null) return;
        const anchor = slugger(currentTitle);
        if (!anchor) return;
        sections.push({
            id: `${manual.slug}#${anchor}`,
            manualSlug: manual.slug,
            anchor,
            sectionTitle: currentTitle,
            body: cleanBody(currentBodyLines.join("\n")),
            roles: manual.roles,
        });
    };

    for (const line of lines) {
        const match = /^##\s+(.+?)\s*$/.exec(line);
        if (match) {
            flush();
            currentTitle = match[1];
            currentBodyLines = [];
        } else if (currentTitle !== null) {
            currentBodyLines.push(line);
        }
    }
    flush();

    return sections;
}

/**
 * Strip the bits of markdown that aren't useful as search input:
 * fenced code blocks (especially mermaid diagrams, which are all
 * noise words for a text search), inline markers, and collapsed
 * whitespace. Keeps prose, bullets, and table cell text.
 */
function cleanBody(body: string): string {
    return body
        .replace(/```[\s\S]*?```/g, " ") // fenced code / mermaid
        .replace(/`([^`]*)`/g, "$1") // inline code
        .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
        .replace(/\*([^*]+)\*/g, "$1") // italic
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → label
        .replace(/^[|>\-*]+/gm, " ") // list / table / blockquote markers
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Load and split every manual into its H2 sections.
 *
 * Called from the /help server component on every request. Parsing
 * four ~5 KB markdown files is ~1 ms and the result fits in memory;
 * caching would be premature. If /help ever becomes hot, wrap in
 * React `cache()` or memoise at module scope.
 */
export function loadAllHelpSections(): HelpSection[] {
    const all: HelpSection[] = [];
    for (const manual of MANUALS) {
        const markdown = loadManualContent(manual);
        all.push(...splitIntoSections(manual, markdown));
    }
    return all;
}

/**
 * Filter sections to only those a given role is allowed to read.
 * Used server-side so admin-only content never reaches a handout
 * staff browser, matching the existing authorization posture of the
 * /help detail route.
 */
export function filterSectionsForRole(
    sections: HelpSection[],
    role: string | undefined,
): HelpSection[] {
    if (role !== "admin" && role !== "handout_staff") return [];
    return sections.filter(s => s.roles.includes(role));
}
