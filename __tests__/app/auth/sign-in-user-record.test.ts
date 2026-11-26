/**
 * Sign-in creates the user's row in the users table. Agreement acceptance and
 * every agreement-protected action need that row, so a user whose row couldn't
 * be saved must not get a session.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextAuthConfig } from "next-auth";

let config: NextAuthConfig;
vi.mock("next-auth", () => ({
    default: (authConfig: NextAuthConfig) => {
        config = authConfig;
        return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
    },
}));

vi.mock("next-auth/providers/github", () => ({
    default: () => ({ id: "github" }),
}));

vi.mock("@/app/utils/auth/org-eligibility", () => ({
    checkGitHubOrgEligibility: async () => ({ ok: true, status: "ok" }),
}));

vi.mock("@/app/utils/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const upsertUser = vi.fn();
vi.mock("@/app/db/drizzle", () => ({
    db: { insert: () => ({ values: () => ({ onConflictDoUpdate: upsertUser }) }) },
}));

async function signIn() {
    await import("@/auth");
    return config.callbacks!.signIn!({
        user: {},
        account: {
            provider: "github",
            type: "oauth",
            providerAccountId: "1",
            access_token: "token",
        },
        profile: { login: "anna" },
    });
}

describe("Sign-in user record", () => {
    beforeEach(() => {
        upsertUser.mockReset();
    });

    it("signs the user in once their row is saved", async () => {
        upsertUser.mockResolvedValue(undefined);

        await expect(signIn()).resolves.toBe(true);
    });

    it("sends the user to the sign-in error page when their row can't be saved", async () => {
        upsertUser.mockRejectedValue(new Error("connection terminated"));

        await expect(signIn()).resolves.toBe("/auth/error?error=user-record");
    });
});
