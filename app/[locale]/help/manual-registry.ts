import "server-only";

import fs from "fs";
import path from "path";

/**
 * Registry of staff-facing manuals available under /help.
 *
 * The source of truth for each manual is a markdown file in `/docs`.
 * `outputFileTracingIncludes` in `next.config.ts` ensures these files are
 * bundled into the Next.js standalone output, so `loadManualContent` works
 * in production Docker builds.
 *
 * Adding a new manual:
 *   1. Drop the markdown file into `/docs`.
 *   2. Add an entry to `MANUALS` below.
 *   3. Add a matching title/description to `messages/en.json` and `messages/sv.json`
 *      under `help.manuals.*`.
 *   4. Add a case to `getManualTitleKey` / `getManualDescriptionKey` in
 *      `app/[locale]/help/manual-labels.ts`.
 */

export type ManualSlug = "overview" | "handout-staff" | "case-worker" | "administrator";

export type ManualRole = "admin" | "handout_staff";

export interface ManualMeta {
    /** URL slug used at /help/[slug] */
    slug: ManualSlug;
    /** File in /docs — the SOURCE of the rendered content */
    filename: string;
    /** Roles allowed to read this manual */
    roles: readonly ManualRole[];
}

export const MANUALS: readonly ManualMeta[] = [
    {
        slug: "overview",
        filename: "anvandarguide-sv.md",
        roles: ["handout_staff", "admin"],
    },
    {
        slug: "handout-staff",
        filename: "handout-staff-manual-sv.md",
        roles: ["handout_staff", "admin"],
    },
    {
        slug: "case-worker",
        filename: "case-worker-manual-sv.md",
        roles: ["admin"],
    },
    {
        slug: "administrator",
        filename: "admin-manual-sv.md",
        roles: ["admin"],
    },
] as const;

/**
 * Filter manuals by the caller's role. Users without a recognised role
 * (unauthenticated or unexpected value) see no manuals — the /help index
 * page will render an empty state in that case.
 */
export function getManualsForRole(role: string | undefined): ManualMeta[] {
    if (role !== "admin" && role !== "handout_staff") return [];
    return MANUALS.filter(m => m.roles.includes(role));
}

export function getManualBySlug(slug: string): ManualMeta | undefined {
    return MANUALS.find(m => m.slug === slug);
}

/**
 * Check if a role has access to a specific manual. Returns false for
 * unknown roles, which keeps the detail route authorization strict.
 */
export function canRoleReadManual(role: string | undefined, manual: ManualMeta): boolean {
    if (role !== "admin" && role !== "handout_staff") return false;
    return manual.roles.includes(role);
}

/**
 * Read the raw markdown for a manual from /docs at request time.
 *
 * In the Next.js standalone build, `outputFileTracingIncludes` copies
 * these files next to the server bundle so `process.cwd()` resolves
 * correctly. Throws if the file is missing — that's intentional: a
 * missing manual file is a deployment bug, not a runtime fallback case.
 */
export function loadManualContent(manual: ManualMeta): string {
    const filepath = path.join(process.cwd(), "docs", manual.filename);
    return fs.readFileSync(filepath, "utf-8");
}
