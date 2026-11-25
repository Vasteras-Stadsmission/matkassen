/**
 * The household details and parcel management pages fetch personal data. That
 * fetch must run only after AgreementProtection has passed, so that a user who
 * hasn't accepted the current agreement is redirected to /agreement, and
 * handout staff to the access-denied page, instead of hitting an error.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidElement, type ReactNode } from "react";
import { createMockSession } from "../../../test-helpers";

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

vi.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
}));

vi.mock("next/headers", () => ({
    headers: async () => new Headers({ "x-next-url": "/en/households/h1" }),
}));

vi.mock("next-intl/server", () => ({
    getTranslations: async () => (key: string) => key,
    getLocale: async () => "en",
}));

const agreement = { accepted: true };
vi.mock("@/app/utils/user-agreement", () => ({
    getCurrentAgreement: async () => ({ id: "agreement-1" }),
    getUserIdByGithubUsername: async () => "user-1",
    hasUserAcceptedAgreement: async () => agreement.accepted,
}));

vi.mock("@/app/utils/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    logError: vi.fn(),
}));

vi.mock("@/app/db/drizzle", () => ({ db: {} }));

vi.mock("@/app/utils/parcel-warnings", () => ({
    shouldShowParcelWarning: async () => ({ shouldWarn: false, parcelCount: 0, threshold: null }),
}));

// Keep the real protected wrappers, so a refused call fails like in the app.
vi.mock("@/app/[locale]/households/actions", async importOriginal => {
    const actual = await importOriginal<typeof import("@/app/[locale]/households/actions")>();
    return { ...actual, getHouseholdDetails: vi.fn(actual.getHouseholdDetails) };
});
vi.mock("@/app/[locale]/households/[id]/edit/actions", async importOriginal => {
    const actual =
        await importOriginal<typeof import("@/app/[locale]/households/[id]/edit/actions")>();
    return { ...actual, getHouseholdFormData: vi.fn(actual.getHouseholdFormData) };
});

vi.mock("@/app/[locale]/households/[id]/components/HouseholdDetailsPage", () => ({
    default: function HouseholdDetailsPage() {
        return null;
    },
}));
vi.mock("@/app/[locale]/households/[id]/components/HouseholdDetailsPageSkeleton", () => ({
    HouseholdDetailsPageSkeleton: function HouseholdDetailsPageSkeleton() {
        return null;
    },
}));
vi.mock("@/app/[locale]/households/[id]/components/AnonymizedHouseholdPage", () => ({
    AnonymizedHouseholdPage: function AnonymizedHouseholdPage() {
        return null;
    },
}));
vi.mock("@/app/[locale]/households/[id]/parcels/ParcelManagementClient", () => ({
    ParcelManagementClient: function ParcelManagementClient() {
        return null;
    },
}));

/**
 * Render a server component tree the way React does on the server: call each
 * async component and walk into its output, leaving client components unrendered.
 */
async function renderServerTree(node: ReactNode): Promise<ReactNode> {
    if (Array.isArray(node)) {
        return Promise.all(node.map(renderServerTree));
    }
    if (!isValidElement<{ children?: ReactNode }>(node)) {
        return node;
    }
    if (typeof node.type === "function" && node.type.constructor.name === "AsyncFunction") {
        const component = node.type as (props: unknown) => Promise<ReactNode>;
        return renderServerTree(await component(node.props));
    }
    return {
        ...node,
        props: { ...node.props, children: await renderServerTree(node.props.children) },
    };
}

function staffSession() {
    const session = createMockSession({ githubUsername: "staffuser" });
    session.user!.role = "handout_staff";
    return session;
}

const params = Promise.resolve({ id: "h1", locale: "en" });

type HouseholdDetails = NonNullable<
    Awaited<ReturnType<typeof import("@/app/[locale]/households/actions").getHouseholdDetails>>
>;

function householdDetails(anonymizedAt: Date | null = null) {
    return {
        household: { first_name: "Anna", last_name: "Svensson", anonymized_at: anonymizedAt },
    } as HouseholdDetails;
}

describe("Household details page access", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        agreement.accepted = true;
        mockAuth.mockResolvedValue(createMockSession());
    });

    it("redirects a user who hasn't accepted the agreement instead of throwing", async () => {
        agreement.accepted = false;
        const { default: HouseholdPage } = await import("@/app/[locale]/households/[id]/page");
        const { getHouseholdDetails } = await import("@/app/[locale]/households/actions");

        await expect(renderServerTree(<HouseholdPage params={params} />)).rejects.toThrow(
            "NEXT_REDIRECT /agreement?callbackUrl=%2Fhouseholds%2Fh1",
        );
        expect(getHouseholdDetails).not.toHaveBeenCalled();
    });

    it("gives a generic title when the agreement isn't accepted", async () => {
        agreement.accepted = false;
        const { generateMetadata } = await import("@/app/[locale]/households/[id]/page");

        await expect(generateMetadata({ params })).resolves.toEqual({ title: "title" });
    });

    it("shows the household to a user who has accepted the agreement", async () => {
        const { default: HouseholdPage, generateMetadata } =
            await import("@/app/[locale]/households/[id]/page");
        const { getHouseholdDetails } = await import("@/app/[locale]/households/actions");
        vi.mocked(getHouseholdDetails).mockResolvedValue(householdDetails());

        const tree = JSON.stringify(await renderServerTree(<HouseholdPage params={params} />));

        expect(tree).toContain('"first_name":"Anna"');
        expect(mockRedirect).not.toHaveBeenCalled();
        await expect(generateMetadata({ params })).resolves.toEqual({
            title: "Anna Svensson - title",
        });
    });

    it("redirects handout_staff away from an anonymized household", async () => {
        mockAuth.mockResolvedValue(staffSession());
        const { default: HouseholdPage } = await import("@/app/[locale]/households/[id]/page");
        const { getHouseholdDetails } = await import("@/app/[locale]/households/actions");
        vi.mocked(getHouseholdDetails).mockResolvedValue(householdDetails(new Date()));

        await expect(renderServerTree(<HouseholdPage params={params} />)).rejects.toThrow(
            "NEXT_REDIRECT /auth/access-denied?reason=admin_required",
        );
    });
});

describe("Parcel management page access", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        agreement.accepted = true;
        mockAuth.mockResolvedValue(createMockSession());
    });

    it("redirects handout_staff without loading the household", async () => {
        mockAuth.mockResolvedValue(staffSession());
        const { default: ParcelManagementPage } =
            await import("@/app/[locale]/households/[id]/parcels/page");
        const { getHouseholdFormData } =
            await import("@/app/[locale]/households/[id]/edit/actions");

        await expect(renderServerTree(<ParcelManagementPage params={params} />)).rejects.toThrow(
            "NEXT_REDIRECT /auth/access-denied?reason=admin_required",
        );
        expect(getHouseholdFormData).not.toHaveBeenCalled();
    });

    it("redirects an admin who hasn't accepted the agreement without loading the household", async () => {
        agreement.accepted = false;
        const { default: ParcelManagementPage } =
            await import("@/app/[locale]/households/[id]/parcels/page");
        const { getHouseholdFormData } =
            await import("@/app/[locale]/households/[id]/edit/actions");

        await expect(renderServerTree(<ParcelManagementPage params={params} />)).rejects.toThrow(
            "NEXT_REDIRECT /agreement?callbackUrl=%2Fhouseholds%2Fh1",
        );
        expect(getHouseholdFormData).not.toHaveBeenCalled();
    });

    it("loads the parcels for an admin who has accepted the agreement", async () => {
        const { default: ParcelManagementPage } =
            await import("@/app/[locale]/households/[id]/parcels/page");
        const { getHouseholdFormData } =
            await import("@/app/[locale]/households/[id]/edit/actions");
        vi.mocked(getHouseholdFormData).mockResolvedValue({
            success: true,
            data: {
                household: { first_name: "Anna", last_name: "Svensson" },
                foodParcels: { parcels: [] },
            },
        } as unknown as Awaited<ReturnType<typeof getHouseholdFormData>>);

        const tree = JSON.stringify(
            await renderServerTree(<ParcelManagementPage params={params} />),
        );

        expect(tree).toContain('"householdName":"Anna Svensson"');
        expect(mockRedirect).not.toHaveBeenCalled();
    });
});
