/**
 * Turn a heading's plain text into a URL-safe anchor slug.
 *
 * Swedish characters (åäö) are normalised via NFD + combining-mark
 * strip so they collapse to ASCII (a, a, o). The result matches what
 * GitHub-style heading anchors produce, which is what staff linking
 * to /help will intuitively expect.
 *
 * Returns an empty string for input that reduces to no slug characters
 * (empty, pure punctuation, emoji-only). The caller decides whether
 * to emit an id at all in that case.
 */
export function slugifyHeading(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}

/**
 * Factory that returns a slugging function closed over a fresh
 * `seen` counter. Two calls with the same heading text yield
 * `foo`, `foo-2`, `foo-3`, … so anchor ids stay unique within a
 * single document even if a heading repeats.
 *
 * Both `markdownToHtml` (render path) and the help-index splitter
 * (search-indexing path) must use this so the anchor they emit and
 * the anchor the search result links to always agree.
 */
export function makeUniqueSlugger(): (text: string) => string {
    const seen = new Map<string, number>();
    return (text: string) => {
        const base = slugifyHeading(text);
        if (!base) return "";
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        return count === 0 ? base : `${base}-${count + 1}`;
    };
}
