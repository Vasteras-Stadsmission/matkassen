/**
 * AgreementProtection sends the user to /agreement with the page they came
 * from, query string included. The agreement page must send them back there,
 * and only to a path on this site.
 */

import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { createMockSession } from "../../test-helpers";

vi.mock("@/auth", () => ({
    auth: async () => createMockSession(),
}));

vi.mock("@/app/i18n/navigation", () => ({
    redirect: vi.fn(),
}));

vi.mock("@/app/[locale]/agreement/AgreementClient", () => ({
    AgreementClient: function AgreementClient() {
        return null;
    },
}));

async function callbackUrlFor(callbackUrl: string) {
    const { default: AgreementPage } = await import("@/app/[locale]/agreement/page");
    const element = (await AgreementPage({
        searchParams: { callbackUrl },
        params: { locale: "en" },
    })) as ReactElement<{ callbackUrl: string }>;
    return element.props.callbackUrl;
}

describe("Agreement page callback URL", () => {
    it("returns to the page with its query string", async () => {
        await expect(callbackUrlFor("/households/h1?parcel=p1")).resolves.toBe(
            "/households/h1?parcel=p1",
        );
    });

    it.each(["//evil.com/households?parcel=p1", "https://evil.com/?parcel=p1"])(
        "returns to the start page instead of %s",
        async callbackUrl => {
            await expect(callbackUrlFor(callbackUrl)).resolves.toBe("/");
        },
    );
});
