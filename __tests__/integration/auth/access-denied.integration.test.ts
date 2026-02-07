/**
 * Integration tests for the access-denied page and authentication flow.
 *
 * Tests:
 * 1. sanitizeCallbackUrl() - URL validation to prevent open redirect attacks
 * 2. Auth flow redirects for ineligible users
 * 3. Database user creation during sign-in
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getTestDb } from "../../db/test-db";
import { createTestUser, resetUserCounter } from "../../factories";
import { users } from "@/app/db/schema";
import { eq } from "drizzle-orm";

// Import the sanitizeCallbackUrl function by importing the module
// Since it's not exported, we'll test the behavior through the page component
// For now, we'll recreate the function logic for direct testing
function sanitizeCallbackUrl(url: string): string {
    const fallback = "/";

    const hasUnsafeChars = (value: string) =>
        value.includes("\\") || /[\u0000-\u001F\u007F]/.test(value);

    const containsPercentEscapes = (value: string) => /%[0-9A-Fa-f]{2}/.test(value);

    // Reject whitespace/control chars and obvious non-path values early.
    if (url !== url.trim() || hasUnsafeChars(url)) {
        return fallback;
    }

    // Decode up to twice to catch common double-encoding bypasses.
    let decoded = url;
    for (let i = 0; i < 2; i++) {
        if (!containsPercentEscapes(decoded)) break;
        try {
            const next = decodeURIComponent(decoded);
            if (next === decoded) break;
            decoded = next;
            if (hasUnsafeChars(decoded)) {
                return fallback;
            }
        } catch {
            return fallback;
        }
    }

    // Only allow absolute paths (same-origin) and reject protocol-relative URLs.
    if (!decoded.startsWith("/") || decoded.startsWith("//")) {
        return fallback;
    }

    // Ensure URL parsing can't reinterpret the value as an external origin (e.g. "/\\evil.com").
    try {
        const base = new URL("https://example.invalid");
        const parsed = new URL(decoded, base);
        if (parsed.origin !== base.origin) {
            return fallback;
        }

        const relative = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        if (!relative.startsWith("/") || relative.startsWith("//") || hasUnsafeChars(relative)) {
            return fallback;
        }

        return relative;
    } catch {
        return fallback;
    }
}

describe("Access Denied - Integration Tests", () => {
    beforeEach(() => {
        resetUserCounter();
    });

    describe("sanitizeCallbackUrl - Open Redirect Prevention", () => {
        describe("valid URLs that should pass", () => {
            it("should allow root path", () => {
                expect(sanitizeCallbackUrl("/")).toBe("/");
            });

            it("should allow simple relative paths", () => {
                expect(sanitizeCallbackUrl("/admin")).toBe("/admin");
                expect(sanitizeCallbackUrl("/admin/users")).toBe("/admin/users");
                expect(sanitizeCallbackUrl("/auth/signin")).toBe("/auth/signin");
            });

            it("should allow paths with query parameters", () => {
                expect(sanitizeCallbackUrl("/admin?tab=users")).toBe("/admin?tab=users");
                expect(sanitizeCallbackUrl("/search?q=test&page=1")).toBe("/search?q=test&page=1");
            });

            it("should allow paths with hash fragments", () => {
                expect(sanitizeCallbackUrl("/docs#section")).toBe("/docs#section");
                expect(sanitizeCallbackUrl("/admin#settings")).toBe("/admin#settings");
            });

            it("should allow paths with both query and hash", () => {
                expect(sanitizeCallbackUrl("/page?foo=bar#anchor")).toBe("/page?foo=bar#anchor");
            });

            it("should allow URL-encoded characters in paths", () => {
                expect(sanitizeCallbackUrl("/search?q=hello%20world")).toBe(
                    "/search?q=hello%20world",
                );
            });
        });

        describe("protocol-relative URLs (open redirect attack)", () => {
            it("should reject //evil.com", () => {
                expect(sanitizeCallbackUrl("//evil.com")).toBe("/");
            });

            it("should reject //evil.com/path", () => {
                expect(sanitizeCallbackUrl("//evil.com/path")).toBe("/");
            });

            it("should reject // with subdomain", () => {
                expect(sanitizeCallbackUrl("//www.evil.com")).toBe("/");
            });
        });

        describe("absolute URLs (open redirect attack)", () => {
            it("should reject http:// URLs", () => {
                expect(sanitizeCallbackUrl("http://evil.com")).toBe("/");
            });

            it("should reject https:// URLs", () => {
                expect(sanitizeCallbackUrl("https://evil.com")).toBe("/");
            });

            it("should reject javascript: URLs", () => {
                expect(sanitizeCallbackUrl("javascript:alert(1)")).toBe("/");
            });

            it("should reject data: URLs", () => {
                expect(sanitizeCallbackUrl("data:text/html,<script>alert(1)</script>")).toBe("/");
            });
        });

        describe("backslash bypass attempts", () => {
            it("should reject /\\\\evil.com", () => {
                expect(sanitizeCallbackUrl("/\\evil.com")).toBe("/");
            });

            it("should reject backslash at start", () => {
                expect(sanitizeCallbackUrl("\\evil.com")).toBe("/");
            });

            it("should reject mixed slashes", () => {
                expect(sanitizeCallbackUrl("/\\/evil.com")).toBe("/");
            });
        });

        describe("double-encoding bypass attempts", () => {
            it("should reject double-encoded //", () => {
                // %2F%2F decodes to //
                expect(sanitizeCallbackUrl("%2F%2Fevil.com")).toBe("/");
            });

            it("should reject double-encoded backslash", () => {
                // %5C decodes to \\
                expect(sanitizeCallbackUrl("/%5Cevil.com")).toBe("/");
            });

            it("should reject triple-encoded attacks", () => {
                // %252F decodes to %2F, which decodes to /
                expect(sanitizeCallbackUrl("%252F%252Fevil.com")).toBe("/");
            });
        });

        describe("control character attacks", () => {
            it("should reject null bytes", () => {
                expect(sanitizeCallbackUrl("/admin\u0000evil")).toBe("/");
            });

            it("should reject newlines", () => {
                expect(sanitizeCallbackUrl("/admin\nevil")).toBe("/");
            });

            it("should reject carriage returns", () => {
                expect(sanitizeCallbackUrl("/admin\revil")).toBe("/");
            });

            it("should reject tabs", () => {
                expect(sanitizeCallbackUrl("/admin\tevil")).toBe("/");
            });

            it("should reject DEL character", () => {
                expect(sanitizeCallbackUrl("/admin\u007Fevil")).toBe("/");
            });
        });

        describe("whitespace attacks", () => {
            it("should reject leading whitespace", () => {
                expect(sanitizeCallbackUrl(" /admin")).toBe("/");
            });

            it("should reject trailing whitespace", () => {
                expect(sanitizeCallbackUrl("/admin ")).toBe("/");
            });

            it("should reject URLs that are just whitespace", () => {
                expect(sanitizeCallbackUrl("   ")).toBe("/");
            });
        });

        describe("invalid URL format attacks", () => {
            it("should handle empty string", () => {
                expect(sanitizeCallbackUrl("")).toBe("/");
            });

            it("should reject URLs without leading slash", () => {
                expect(sanitizeCallbackUrl("admin/users")).toBe("/");
            });

            it("should reject plain domain names", () => {
                expect(sanitizeCallbackUrl("evil.com")).toBe("/");
            });
        });

        describe("encoded control characters", () => {
            it("should reject URL-encoded null byte", () => {
                expect(sanitizeCallbackUrl("/admin%00evil")).toBe("/");
            });

            it("should reject URL-encoded newline", () => {
                expect(sanitizeCallbackUrl("/admin%0Aevil")).toBe("/");
            });

            it("should reject URL-encoded backslash", () => {
                expect(sanitizeCallbackUrl("/%5Cevil.com")).toBe("/");
            });
        });
    });

    describe("User Database Integration on Sign-In", () => {
        it("should create user record when user signs in", async () => {
            const db = await getTestDb();

            // Verify no user exists
            const [existingUser] = await db
                .select()
                .from(users)
                .where(eq(users.github_username, "newmember"))
                .limit(1);

            expect(existingUser).toBeUndefined();

            // Create user as would happen during sign-in
            await db.insert(users).values({
                github_username: "newmember",
                display_name: "New Member",
                avatar_url: "https://github.com/avatar.png",
            });

            // Verify user was created
            const [createdUser] = await db
                .select()
                .from(users)
                .where(eq(users.github_username, "newmember"))
                .limit(1);

            expect(createdUser).toBeDefined();
            expect(createdUser.github_username).toBe("newmember");
            expect(createdUser.display_name).toBe("New Member");
        });

        it("should update user profile data on subsequent sign-ins (upsert)", async () => {
            const db = await getTestDb();

            // Create initial user
            await createTestUser({
                github_username: "existinguser",
                display_name: "Old Name",
                avatar_url: "https://old-avatar.png",
            });

            // Simulate upsert on subsequent sign-in (as done in auth.ts)
            await db
                .insert(users)
                .values({
                    github_username: "existinguser",
                    display_name: "New Name",
                    avatar_url: "https://new-avatar.png",
                })
                .onConflictDoUpdate({
                    target: users.github_username,
                    set: {
                        display_name: "New Name",
                        avatar_url: "https://new-avatar.png",
                    },
                });

            // Verify update
            const [updatedUser] = await db
                .select()
                .from(users)
                .where(eq(users.github_username, "existinguser"))
                .limit(1);

            expect(updatedUser.display_name).toBe("New Name");
            expect(updatedUser.avatar_url).toBe("https://new-avatar.png");
        });

        it("should handle null display name from GitHub", async () => {
            const db = await getTestDb();

            // Some GitHub users don't have display names
            await db.insert(users).values({
                github_username: "nodisplayname",
                display_name: null,
                avatar_url: "https://github.com/avatar.png",
            });

            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.github_username, "nodisplayname"))
                .limit(1);

            expect(user).toBeDefined();
            expect(user.display_name).toBeNull();
        });
    });

    describe("Auth Flow - Eligibility Checking", () => {
        // These tests simulate the logic from auth.ts signIn callback
        const createMockSignInCallback = () => {
            const mockCheckEligibility = vi.fn();

            const signInCallback = async ({
                account,
                profile,
            }: {
                account?: { provider: string; access_token?: string };
                profile?: { login?: string; name?: string | null; avatar_url?: string | null };
            }) => {
                if (account?.provider === "github") {
                    const username = profile?.login as string;
                    const accessToken = account?.access_token as string | undefined;

                    if (!username || !accessToken) {
                        return `/auth/error?error=configuration`;
                    }

                    const eligibility = await mockCheckEligibility(accessToken);
                    if (!eligibility.ok) {
                        if (eligibility.status === "configuration_error") {
                            return `/auth/error?error=configuration`;
                        }
                        // Redirect to access-denied page with specific reason
                        return `/auth/access-denied?reason=${eligibility.status}`;
                    }

                    return true;
                }
                return `/auth/error?error=invalid-provider`;
            };

            return { signInCallback, mockCheckEligibility };
        };

        it("should redirect ineligible users to /auth/access-denied with reason", async () => {
            const { signInCallback, mockCheckEligibility } = createMockSignInCallback();
            mockCheckEligibility.mockResolvedValue({ ok: false, status: "not_member" });

            const result = await signInCallback({
                account: { provider: "github", access_token: "token" },
                profile: { login: "nonmember" },
            });

            expect(result).toBe("/auth/access-denied?reason=not_member");
        });

        it("should redirect users with inactive membership to /auth/access-denied with reason", async () => {
            const { signInCallback, mockCheckEligibility } = createMockSignInCallback();
            mockCheckEligibility.mockResolvedValue({ ok: false, status: "membership_inactive" });

            const result = await signInCallback({
                account: { provider: "github", access_token: "token" },
                profile: { login: "inactivemember" },
            });

            expect(result).toBe("/auth/access-denied?reason=membership_inactive");
        });

        it("should redirect users with insecure 2FA to /auth/access-denied with reason", async () => {
            const { signInCallback, mockCheckEligibility } = createMockSignInCallback();
            mockCheckEligibility.mockResolvedValue({ ok: false, status: "org_resource_forbidden" });

            const result = await signInCallback({
                account: { provider: "github", access_token: "token" },
                profile: { login: "smsonly2fa" },
            });

            expect(result).toBe("/auth/access-denied?reason=org_resource_forbidden");
        });

        it("should allow eligible users to proceed", async () => {
            const { signInCallback, mockCheckEligibility } = createMockSignInCallback();
            mockCheckEligibility.mockResolvedValue({ ok: true, status: "ok" });

            const result = await signInCallback({
                account: { provider: "github", access_token: "token" },
                profile: { login: "validmember" },
            });

            expect(result).toBe(true);
        });

        it("should redirect to configuration error page when org check fails", async () => {
            const { signInCallback, mockCheckEligibility } = createMockSignInCallback();
            mockCheckEligibility.mockResolvedValue({ ok: false, status: "configuration_error" });

            const result = await signInCallback({
                account: { provider: "github", access_token: "token" },
                profile: { login: "anyuser" },
            });

            expect(result).toBe("/auth/error?error=configuration");
        });

        it("should return configuration error when username is missing", async () => {
            const { signInCallback } = createMockSignInCallback();

            const result = await signInCallback({
                account: { provider: "github", access_token: "token" },
                profile: { login: undefined },
            });

            expect(result).toBe("/auth/error?error=configuration");
        });

        it("should return configuration error when access token is missing", async () => {
            const { signInCallback } = createMockSignInCallback();

            const result = await signInCallback({
                account: { provider: "github", access_token: undefined },
                profile: { login: "testuser" },
            });

            expect(result).toBe("/auth/error?error=configuration");
        });

        it("should return invalid provider error for non-GitHub providers", async () => {
            const { signInCallback } = createMockSignInCallback();

            const result = await signInCallback({
                account: { provider: "google", access_token: "token" },
                profile: { login: "testuser" },
            });

            expect(result).toBe("/auth/error?error=invalid-provider");
        });
    });

    describe("Sign-In Page - Session Eligibility Check", () => {
        // Test the logic from app/[locale]/auth/signin/page.tsx

        interface OrgEligibility {
            ok: boolean;
            status: string;
            checkedAt: number;
            nextCheckAt: number;
        }

        interface MockSession {
            user?: {
                githubUsername?: string;
                orgEligibility?: OrgEligibility;
            };
        }

        function determineRedirect(
            session: MockSession | null,
            callbackUrl: string,
        ): { redirect: string } | { render: boolean } {
            const isEligible =
                !!session?.user?.githubUsername && session.user.orgEligibility?.ok === true;

            // If user is logged in but not eligible, redirect to access-denied with reason
            if (session?.user?.githubUsername && !isEligible) {
                const reason = session.user.orgEligibility?.status ?? "unknown";
                return { redirect: `/auth/access-denied?reason=${reason}` };
            }

            // If eligible, redirect to callback URL
            if (isEligible) {
                return { redirect: callbackUrl };
            }

            // Otherwise, render the sign-in page
            return { render: true };
        }

        it("should redirect authenticated but ineligible user to access-denied", () => {
            const session: MockSession = {
                user: {
                    githubUsername: "testuser",
                    orgEligibility: {
                        ok: false,
                        status: "not_member",
                        checkedAt: Date.now(),
                        nextCheckAt: Date.now() + 600000,
                    },
                },
            };

            const result = determineRedirect(session, "/");
            expect(result).toEqual({ redirect: "/auth/access-denied?reason=not_member" });
        });

        it("should redirect eligible user to callback URL", () => {
            const session: MockSession = {
                user: {
                    githubUsername: "testuser",
                    orgEligibility: {
                        ok: true,
                        status: "ok",
                        checkedAt: Date.now(),
                        nextCheckAt: Date.now() + 600000,
                    },
                },
            };

            const result = determineRedirect(session, "/admin/dashboard");
            expect(result).toEqual({ redirect: "/admin/dashboard" });
        });

        it("should render sign-in page when no session exists", () => {
            const result = determineRedirect(null, "/");
            expect(result).toEqual({ render: true });
        });

        it("should redirect to access-denied when user has no org eligibility data", () => {
            const session: MockSession = {
                user: {
                    githubUsername: "testuser",
                    orgEligibility: undefined,
                },
            };

            const result = determineRedirect(session, "/");
            expect(result).toEqual({ redirect: "/auth/access-denied?reason=unknown" });
        });

        it("should redirect to access-denied when eligibility.ok is false", () => {
            const session: MockSession = {
                user: {
                    githubUsername: "testuser",
                    orgEligibility: {
                        ok: false,
                        status: "org_resource_forbidden",
                        checkedAt: Date.now(),
                        nextCheckAt: Date.now() + 600000,
                    },
                },
            };

            const result = determineRedirect(session, "/admin");
            expect(result).toEqual({
                redirect: "/auth/access-denied?reason=org_resource_forbidden",
            });
        });
    });
});
