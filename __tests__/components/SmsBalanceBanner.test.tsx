import { render, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SmsBalanceBanner } from "@/components/SmsBalanceBanner";

const { adminFetch, session } = vi.hoisted(() => ({
    adminFetch: vi.fn(),
    session: { current: null as null | { user: { role: string } } },
}));

vi.mock("@/app/utils/auth/redirect-on-auth-error", () => ({ adminFetch }));

vi.mock("next-auth/react", () => ({
    useSession: () => ({ data: session.current }),
}));

vi.mock("next-intl", () => ({
    useTranslations: () => (key: string) => key,
}));

function renderBanner() {
    render(
        <MantineProvider>
            <SmsBalanceBanner />
        </MantineProvider>,
    );
}

describe("SmsBalanceBanner", () => {
    beforeEach(() => {
        adminFetch.mockReset();
        adminFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ hasInsufficientBalance: false, credits: 100, failedCount: 0 }),
        });
    });

    it("checks the SMS balance for an admin", async () => {
        session.current = { user: { role: "admin" } };
        renderBanner();

        await waitFor(() =>
            expect(adminFetch).toHaveBeenCalledWith("/api/admin/sms/balance-status"),
        );
    });

    it("does not call the admin-only balance endpoint for handout staff", async () => {
        session.current = { user: { role: "handout_staff" } };
        renderBanner();

        // Let effects run
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(adminFetch).not.toHaveBeenCalled();
    });
});
