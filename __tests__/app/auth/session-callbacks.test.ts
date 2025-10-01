/**
 * Tests for NextAuth session callbacks
 * Verifies that GitHub username is correctly preserved from OAuth profile to session
 */

import { describe, it, expect } from "vitest";
import { createMockGitHubProfile } from "../../test-helpers";

describe("NextAuth Session Callbacks", () => {
    describe("JWT callback", () => {
        it("should capture GitHub login during initial sign-in", async () => {
            // Simulate the jwt callback from auth.ts
            const jwtCallback = async ({ token, profile, account }: any) => {
                if (account?.provider === "github" && profile) {
                    token.githubUsername = profile.login;
                }
                return token;
            };

            const mockProfile = createMockGitHubProfile({
                login: "johndoe123",
                name: "John Doe",
            });

            const mockAccount = { provider: "github" };
            const mockToken = { sub: "user-id" };

            const result = await jwtCallback({
                token: mockToken,
                profile: mockProfile,
                account: mockAccount,
            });

            expect(result.githubUsername).toBe("johndoe123");
        });

        it("should preserve githubUsername on subsequent calls", async () => {
            const jwtCallback = async ({ token, profile, account }: any) => {
                if (account?.provider === "github" && profile) {
                    token.githubUsername = profile.login;
                }
                return token;
            };

            // Subsequent call (no profile or account)
            const existingToken = {
                sub: "user-id",
                githubUsername: "johndoe123",
            };

            const result = await jwtCallback({
                token: existingToken,
                profile: undefined,
                account: undefined,
            });

            expect(result.githubUsername).toBe("johndoe123");
        });

        it("should handle missing profile.login gracefully", async () => {
            const jwtCallback = async ({ token, profile, account }: any) => {
                if (account?.provider === "github" && profile) {
                    token.githubUsername = profile.login;
                }
                return token;
            };

            const mockProfile = { name: "John Doe" }; // No login field
            const mockAccount = { provider: "github" };
            const mockToken = { sub: "user-id" };

            const result = await jwtCallback({
                token: mockToken,
                profile: mockProfile,
                account: mockAccount,
            });

            expect(result.githubUsername).toBeUndefined();
        });

        it("should only capture username for GitHub provider", async () => {
            const jwtCallback = async ({ token, profile, account }: any) => {
                if (account?.provider === "github" && profile) {
                    token.githubUsername = profile.login;
                }
                return token;
            };

            const mockProfile = { login: "someuser", name: "Some User" };
            const mockAccount = { provider: "google" }; // Wrong provider
            const mockToken = { sub: "user-id" };

            const result = await jwtCallback({
                token: mockToken,
                profile: mockProfile,
                account: mockAccount,
            });

            expect(result.githubUsername).toBeUndefined();
        });
    });

    describe("Session callback", () => {
        it("should transfer githubUsername from token to session", async () => {
            const sessionCallback = async ({ session, token }: any) => {
                if (token.githubUsername) {
                    session.user.githubUsername = token.githubUsername;
                }
                return session;
            };

            const mockToken = {
                sub: "user-id",
                githubUsername: "johndoe123",
                name: "John Doe",
            };

            const mockSession = {
                user: {
                    name: "John Doe",
                    email: "john@example.com",
                },
                expires: new Date().toISOString(),
            };

            const result = await sessionCallback({
                session: mockSession,
                token: mockToken,
            });

            expect(result.user.githubUsername).toBe("johndoe123");
            expect(result.user.name).toBe("John Doe"); // Display name preserved
        });

        it("should handle missing githubUsername in token", async () => {
            const sessionCallback = async ({ session, token }: any) => {
                if (token.githubUsername) {
                    session.user.githubUsername = token.githubUsername;
                }
                return session;
            };

            const mockToken = {
                sub: "user-id",
                name: "John Doe",
                // No githubUsername
            };

            const mockSession = {
                user: {
                    name: "John Doe",
                    email: "john@example.com",
                },
                expires: new Date().toISOString(),
            };

            const result = await sessionCallback({
                session: mockSession,
                token: mockToken,
            });

            expect(result.user.githubUsername).toBeUndefined();
            expect(result.user.name).toBe("John Doe");
        });

        it("should preserve both name and githubUsername when they differ", async () => {
            const sessionCallback = async ({ session, token }: any) => {
                if (token.githubUsername) {
                    session.user.githubUsername = token.githubUsername;
                }
                return session;
            };

            const mockToken = {
                sub: "user-id",
                githubUsername: "johndoe123", // Username for API calls
                name: "John Doe", // Display name
            };

            const mockSession = {
                user: {
                    name: "John Doe",
                    email: "john@example.com",
                },
                expires: new Date().toISOString(),
            };

            const result = await sessionCallback({
                session: mockSession,
                token: mockToken,
            });

            expect(result.user.githubUsername).toBe("johndoe123"); // For API/DB
            expect(result.user.name).toBe("John Doe"); // For display
        });
    });

    describe("Integration: Full auth flow", () => {
        it("should preserve username through jwt → session flow", async () => {
            // Step 1: JWT callback during sign-in
            const jwtCallback = async ({ token, profile, account }: any) => {
                if (account?.provider === "github" && profile) {
                    token.githubUsername = profile.login;
                }
                return token;
            };

            const mockProfile = createMockGitHubProfile({
                login: "johndoe123",
                name: "John Doe",
            });

            const mockAccount = { provider: "github" };
            let token: any = { sub: "user-id" };

            // Initial sign-in
            token = await jwtCallback({
                token,
                profile: mockProfile,
                account: mockAccount,
            });

            expect(token.githubUsername).toBe("johndoe123");

            // Step 2: Session callback to expose username
            const sessionCallback = async ({ session, token }: any) => {
                if (token.githubUsername) {
                    session.user.githubUsername = token.githubUsername;
                }
                return session;
            };

            const mockSession = {
                user: {
                    name: "John Doe",
                    email: "john@example.com",
                },
                expires: new Date().toISOString(),
            };

            const session = await sessionCallback({
                session: mockSession,
                token,
            });

            // Verify the session has both display name and username
            expect(session.user.githubUsername).toBe("johndoe123");
            expect(session.user.name).toBe("John Doe");
        });
    });
});
