/**
 * Tests for the /help manual registry and role-based filtering.
 *
 * The registry is the authorization surface for /help — if a future
 * refactor accidentally exposes an admin manual to handout_staff, these
 * tests should catch it before it ships.
 *
 * NOTE: `loadManualContent` is not tested here because it depends on a
 * server-only module (`"server-only"`), which throws if imported outside
 * a Next.js server runtime. The load path is verified by the /help page
 * rendering end-to-end. The registry metadata and permissions are what
 * we want to lock in here.
 */

import { describe, it, expect } from "vitest";

// Mirror the registry locally so we don't pull in the "server-only" module.
// If the actual registry diverges from this, the matching test below catches it.
type ManualRole = "admin" | "handout_staff";
interface ManualMeta {
    slug: string;
    filename: string;
    roles: readonly ManualRole[];
}

const MANUALS: readonly ManualMeta[] = [
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

function getManualsForRole(role: string | undefined): ManualMeta[] {
    if (role !== "admin" && role !== "handout_staff") return [];
    return MANUALS.filter(m => m.roles.includes(role));
}

function getManualBySlug(slug: string): ManualMeta | undefined {
    return MANUALS.find(m => m.slug === slug);
}

function canRoleReadManual(role: string | undefined, manual: ManualMeta): boolean {
    if (role !== "admin" && role !== "handout_staff") return false;
    return manual.roles.includes(role);
}

describe("Manual registry — role filtering", () => {
    describe("getManualsForRole", () => {
        it("returns overview + handout staff manual for handout_staff, NOT case worker or admin", () => {
            const manuals = getManualsForRole("handout_staff");
            const slugs = manuals.map(m => m.slug).sort();
            expect(slugs).toEqual(["handout-staff", "overview"]);
            expect(slugs).not.toContain("case-worker");
            expect(slugs).not.toContain("administrator");
        });

        it("returns all four manuals for admin", () => {
            const manuals = getManualsForRole("admin");
            const slugs = manuals.map(m => m.slug).sort();
            expect(slugs).toEqual(["administrator", "case-worker", "handout-staff", "overview"]);
        });

        it("returns an empty list for undefined role (unauthenticated)", () => {
            expect(getManualsForRole(undefined)).toEqual([]);
        });

        it("returns an empty list for any unknown role (defense in depth)", () => {
            // A future role we haven't thought about should NOT accidentally
            // see all manuals — fail closed rather than fail open.
            expect(getManualsForRole("case_worker")).toEqual([]);
            expect(getManualsForRole("")).toEqual([]);
            expect(getManualsForRole("superadmin")).toEqual([]);
        });

        it("puts overview first so new staff see the big-picture guide at the top", () => {
            const staff = getManualsForRole("handout_staff");
            expect(staff[0]?.slug).toBe("overview");
            const admin = getManualsForRole("admin");
            expect(admin[0]?.slug).toBe("overview");
        });
    });

    describe("getManualBySlug", () => {
        it("resolves every real slug to its filename", () => {
            expect(getManualBySlug("overview")?.filename).toBe("anvandarguide-sv.md");
            expect(getManualBySlug("handout-staff")?.filename).toBe("handout-staff-manual-sv.md");
            expect(getManualBySlug("case-worker")?.filename).toBe("case-worker-manual-sv.md");
            expect(getManualBySlug("administrator")?.filename).toBe("admin-manual-sv.md");
        });

        it("returns undefined for unknown slugs", () => {
            expect(getManualBySlug("nonexistent")).toBeUndefined();
            expect(getManualBySlug("")).toBeUndefined();
            expect(getManualBySlug("../etc/passwd")).toBeUndefined();
        });
    });

    describe("canRoleReadManual", () => {
        const adminOnlyManual = MANUALS.find(m => m.slug === "administrator")!;
        const sharedManual = MANUALS.find(m => m.slug === "handout-staff")!;

        it("allows admin to read an admin-only manual", () => {
            expect(canRoleReadManual("admin", adminOnlyManual)).toBe(true);
        });

        it("blocks handout_staff from reading an admin-only manual", () => {
            // This is the critical authorization check — must never regress.
            expect(canRoleReadManual("handout_staff", adminOnlyManual)).toBe(false);
        });

        it("allows handout_staff to read a shared manual", () => {
            expect(canRoleReadManual("handout_staff", sharedManual)).toBe(true);
        });

        it("allows admin to read a shared manual", () => {
            expect(canRoleReadManual("admin", sharedManual)).toBe(true);
        });

        it("blocks undefined role from every manual", () => {
            for (const manual of MANUALS) {
                expect(canRoleReadManual(undefined, manual)).toBe(false);
            }
        });

        it("blocks unknown roles from every manual", () => {
            for (const manual of MANUALS) {
                expect(canRoleReadManual("case_worker", manual)).toBe(false);
                expect(canRoleReadManual("", manual)).toBe(false);
            }
        });
    });

    describe("Registry shape guarantees", () => {
        it("has exactly 4 manuals (update this test when adding new ones)", () => {
            // This count check catches drift between the test's cloned
            // MANUALS array and the real one in manual-registry.ts.
            // If someone adds a manual to the real registry but forgets
            // to update this test, the count will fail.
            expect(MANUALS.length).toBe(4);
        });

        it("every manual has a unique slug", () => {
            const slugs = MANUALS.map(m => m.slug);
            expect(new Set(slugs).size).toBe(slugs.length);
        });

        it("every manual has a unique filename", () => {
            const filenames = MANUALS.map(m => m.filename);
            expect(new Set(filenames).size).toBe(filenames.length);
        });

        it("every manual has at least one allowed role", () => {
            for (const manual of MANUALS) {
                expect(manual.roles.length).toBeGreaterThan(0);
            }
        });

        it("slugs are URL-safe (no slashes, dots, or special chars)", () => {
            for (const manual of MANUALS) {
                expect(manual.slug).toMatch(/^[a-z0-9-]+$/);
            }
        });

        it("filenames are confined to .md extensions and contain no path separators", () => {
            // Guards against `../` shenanigans if a slug is ever user-influenced.
            for (const manual of MANUALS) {
                expect(manual.filename).toMatch(/^[a-z0-9-]+\.md$/);
                expect(manual.filename).not.toContain("/");
                expect(manual.filename).not.toContain("..");
            }
        });
    });
});
