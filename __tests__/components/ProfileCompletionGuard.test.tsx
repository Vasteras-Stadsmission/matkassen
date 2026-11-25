import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it, vi } from "vitest";
import { ProfileCompletionGuard } from "@/components/ProfileCompletionGuard/ProfileCompletionGuard";

vi.mock("next-auth/react", () => ({
    useSession: () => ({ status: "authenticated", update: vi.fn() }),
    signOut: vi.fn(),
}));

vi.mock("next-intl", () => ({
    useTranslations: () => (key: string) => key,
}));

vi.mock("@/app/utils/user-profile", () => ({
    getUserProfile: vi.fn().mockResolvedValue({
        success: true,
        data: { first_name: "", last_name: "", email: "", phone: "", profileComplete: false },
    }),
    saveUserProfile: vi.fn(),
}));

describe("ProfileCompletionGuard", () => {
    it("renders the dialog title as one heading, not a heading inside a heading", async () => {
        render(
            <MantineProvider>
                <ProfileCompletionGuard />
            </MantineProvider>,
        );

        const title = await screen.findByRole("heading", { name: "completeProfile" });

        // A heading inside the modal's <h2> title is invalid HTML and makes
        // React report a hydration error.
        expect(title.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
        expect(title.closest("h1, h2, h3, h4, h5, h6")).toBe(title);
    });
});
