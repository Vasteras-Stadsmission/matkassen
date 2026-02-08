import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import type { NextAuthConfig } from "next-auth";
import { checkGitHubOrgEligibility } from "./app/utils/auth/org-eligibility";
import { logger } from "./app/utils/logger";

// GitHub profile type from OAuth provider
interface GitHubProfile {
    login?: string;
    name?: string | null;
    avatar_url?: string | null;
    [key: string]: unknown; // Allow other fields
}

const ELIGIBILITY_GRACE_MS = 30 * 60 * 1000; // 30 minutes

const authConfig: NextAuthConfig = {
    session: {
        strategy: "jwt",
        maxAge: 12 * 60 * 60, // 12 hours
    },
    providers: [
        GitHub({
            clientId: process.env.AUTH_GITHUB_ID,
            clientSecret: process.env.AUTH_GITHUB_SECRET,
            authorization: {
                params: { scope: "read:user user:email read:org" },
            },
        }),
    ],
    pages: {
        signIn: "/auth/signin",
        error: "/auth/error",
    },
    cookies: {
        sessionToken: {
            name: `next-auth.session-token.v4`,
            options: {
                httpOnly: true,
                sameSite: "lax",
                path: "/",
                secure: process.env.NODE_ENV === "production",
            },
        },
    },
    callbacks: {
        authorized: async ({ auth }) => {
            // Used by Auth.js middleware patterns. Main gating is enforced in route handlers/pages.
            return !!auth?.user && (auth.user as any).orgEligibility?.ok === true;
        },
        async signIn({ account, profile }) {
            if (account?.provider === "github") {
                const githubProfile = profile as GitHubProfile;
                const username = githubProfile?.login as string;
                const accessToken = account?.access_token as string | undefined;

                if (!username) {
                    logger.error(
                        { provider: account?.provider },
                        "Missing GitHub username during sign-in",
                    );
                    return `/auth/error?error=configuration`;
                }

                if (!accessToken) {
                    logger.error(
                        { username, provider: account?.provider },
                        "Missing GitHub OAuth access token during sign-in",
                    );
                    return `/auth/error?error=configuration`;
                }

                const organization = process.env.GITHUB_ORG ?? "";
                const eligibility = await checkGitHubOrgEligibility({
                    accessToken,
                    organization,
                    context: "signin",
                });

                if (!eligibility.ok) {
                    if (eligibility.status === "configuration_error") {
                        return `/auth/error?error=configuration`;
                    }
                    // Redirect to access-denied page with specific reason
                    return `/auth/access-denied?reason=${encodeURIComponent(eligibility.status)}`;
                }

                // Update user record with latest GitHub profile data
                try {
                    const { db } = await import("./app/db/drizzle");
                    const { users } = await import("./app/db/schema");

                    // Upsert user: create if doesn't exist, update if exists
                    await db
                        .insert(users)
                        .values({
                            github_username: username,
                            display_name: githubProfile.name || null,
                            avatar_url: githubProfile.avatar_url || null,
                        })
                        .onConflictDoUpdate({
                            target: users.github_username,
                            set: {
                                display_name: githubProfile.name || null,
                                avatar_url: githubProfile.avatar_url || null,
                            },
                        });
                } catch (error) {
                    logger.error({ error, username }, "Failed to update user profile data");
                    // Don't block login if profile update fails
                }

                return true;
            }
            logger.error({ provider: account?.provider }, "Invalid account provider");
            return `/auth/error?error=invalid-provider`;
        },
        // JWT callback: Store GitHub login in token during sign-in
        async jwt({ token, profile, account }) {
            // On initial sign-in, capture the GitHub login (username)
            if (account?.provider === "github" && profile) {
                token.githubUsername = (profile as any).login;
            }

            if (account?.provider === "github" && typeof account?.access_token === "string") {
                (token as any).githubAccessToken = account.access_token;
            }

            const existingEligibility = (token as any).orgEligibility as
                | { ok: boolean; checkedAt: number; nextCheckAt: number; status: string }
                | undefined;

            const shouldRecheck =
                !existingEligibility ||
                typeof existingEligibility.nextCheckAt !== "number" ||
                Date.now() >= existingEligibility.nextCheckAt;

            if (shouldRecheck) {
                const accessToken = (token as any).githubAccessToken as string | undefined;
                const organization = process.env.GITHUB_ORG ?? "";

                const fresh = await checkGitHubOrgEligibility({
                    accessToken: accessToken ?? "",
                    organization,
                    context: "jwt",
                });

                if (
                    !fresh.ok &&
                    (fresh.status === "github_error" || fresh.status === "rate_limited") &&
                    existingEligibility?.ok === true &&
                    Date.now() - existingEligibility.checkedAt < ELIGIBILITY_GRACE_MS
                ) {
                    (token as any).orgEligibility = {
                        ...existingEligibility,
                        nextCheckAt: Date.now() + 2 * 60 * 1000,
                    };
                } else {
                    (token as any).orgEligibility = fresh;
                }
            }

            return token;
        },
        // Session callback: Transfer GitHub username from token to session
        async session({ session, token }) {
            if (token.githubUsername) {
                session.user.githubUsername = token.githubUsername;
            }
            (session.user as any).orgEligibility = (token as any).orgEligibility;
            return session;
        },
        // Redirect callback: Handle deep links and callbackUrls after authentication
        async redirect({ url, baseUrl }) {
            const hasUnsafeChars = (value: string) =>
                value.includes("\\") || /[\u0000-\u001F\u007F]/.test(value);

            if (url !== url.trim() || hasUnsafeChars(url)) {
                return baseUrl;
            }

            try {
                const containsPercentEscapes = (value: string) => /%[0-9A-Fa-f]{2}/.test(value);

                let decoded = url;
                for (let i = 0; i < 2; i++) {
                    if (!containsPercentEscapes(decoded)) break;
                    const next = decodeURIComponent(decoded);
                    if (next === decoded) break;
                    decoded = next;
                }
                if (decoded !== decoded.trim() || hasUnsafeChars(decoded)) {
                    return baseUrl;
                }
            } catch {
                return baseUrl;
            }

            // SECURITY: Reject protocol-relative URLs (//evil.com) - open redirect vulnerability
            // Even though baseUrl + "//evil.com" might stay on our domain,
            // browser/server normalization could create security issues
            if (url.startsWith("//")) {
                return baseUrl;
            }

            // Allows relative callback URLs (e.g., "/admin/users")
            if (url.startsWith("/")) {
                return `${baseUrl}${url}`;
            }

            // Allows callback URLs on the same origin (with error handling)
            try {
                const urlOrigin = new URL(url).origin;
                const baseOrigin = new URL(baseUrl).origin;
                if (urlOrigin === baseOrigin) {
                    return url;
                }
            } catch (e) {
                // Invalid URL format, fallback to home for security
            }

            // Otherwise, redirect to the home page for security
            return baseUrl;
        },
    },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
