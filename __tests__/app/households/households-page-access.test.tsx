/**
 * The households list is admin-only. A handout_staff user who opens it must be
 * redirected to the access-denied page by AgreementProtection, not hit the
 * "Admin access required" error that the admin-only data fetch throws.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSession, renderServerTree } from "../../test-helpers";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
    auth: () => mockAuth(),
}));

const mockRedirect = vi.fn((args: { href: string; locale: string }) => {
    throw new Error(`NEXT_REDIRECT ${args.href}`);
});
vi.mock("@/app/i18n/navigation", () => ({
    redirect: (args: { href: string; locale: string }) => mockRedirect(args),
}));

vi.mock("next-intl/server", () => ({
    getTranslations: async () => (key: string) => key,
    getLocale: async () => "en",
}));

vi.mock("@/app/utils/user-agreement", () => ({
    getCurrentAgreement: async () => null,
    getUserIdByGithubUsername: async () => null,
    hasUserAcceptedAgreement: async () => true,
}));

vi.mock("@/app/utils/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    logError: vi.fn(),
}));

vi.mock("@/app/db/drizzle", () => ({ db: {} }));

// Keep the real protected wrapper, so a non-admin call throws like in the app.
vi.mock("@/app/[locale]/households/actions", async importOriginal => {
    const actual = await importOriginal<typeof import("@/app/[locale]/households/actions")>();
    return { ...actual, getHouseholds: vi.fn(actual.getHouseholds) };
});

vi.mock("@/app/[locale]/households/components/HouseholdsPageClient", () => ({
    default: function HouseholdsPageClient() {
        return null;
    },
}));

function staffSession() {
    const session = createMockSession({ githubUsername: "staffuser" });
    session.user!.role = "handout_staff";
    return session;
}

describe("HouseholdsPage access", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("redirects handout_staff to the access-denied page instead of throwing", async () => {
        mockAuth.mockResolvedValue(staffSession());
        const { default: HouseholdsPage } = await import("@/app/[locale]/households/page");
        const { getHouseholds } = await import("@/app/[locale]/households/actions");

        await expect(renderServerTree(<HouseholdsPage />)).rejects.toThrow(
            "NEXT_REDIRECT /auth/access-denied?reason=admin_required",
        );
        expect(mockRedirect).toHaveBeenCalledWith({
            href: "/auth/access-denied?reason=admin_required",
            locale: "en",
        });
        expect(getHouseholds).not.toHaveBeenCalled();
    });

    it("loads the households for admins", async () => {
        mockAuth.mockResolvedValue(createMockSession());
        const { default: HouseholdsPage } = await import("@/app/[locale]/households/page");
        const { getHouseholds } = await import("@/app/[locale]/households/actions");
        const households = [{ id: "h1" }] as Awaited<ReturnType<typeof getHouseholds>>;
        vi.mocked(getHouseholds).mockResolvedValueOnce(households);

        const tree = JSON.stringify(await renderServerTree(<HouseholdsPage />));

        expect(tree).toContain('"initialHouseholds":[{"id":"h1"}]');
        expect(mockRedirect).not.toHaveBeenCalled();
    });
});
