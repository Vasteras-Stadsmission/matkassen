import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import type { NextAuthConfig } from "next-auth";
import { validateOrganizationMembership } from "./app/utils/auth/organization-auth";
import { logger } from "./app/utils/logger";

const authConfig: NextAuthConfig = {
    providers: [
        GitHub({
            clientId: process.env.AUTH_GITHUB_ID,
            clientSecret: process.env.AUTH_GITHUB_SECRET,
            authorization: {
                params: { scope: "read:user user:email" },
            },
        }),
    ],
    pages: {
        signIn: "/auth/signin",
        error: "/auth/error",
    },
    cookies: {
        sessionToken: {
            name: `next-auth.session-token.v2`,
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
            // Logged in users are authenticated, otherwise redirect to login page
            return !!auth;
        },
        async signIn({ account, profile }) {
            if (account?.provider === "github") {
                const username = profile?.login as string;

                // Use centralized organization membership validation
                const orgCheck = await validateOrganizationMembership(username, "signin");

                if (!orgCheck.isValid) {
                    if (orgCheck.error?.includes("configuration")) {
                        return `/auth/error?error=configuration`;
                    }
                    // Access denied - return false to trigger AccessDenied error
                    return false;
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
                            display_name: (profile as any).name || null,
                            avatar_url: (profile as any).avatar_url || null,
                        })
                        .onConflictDoUpdate({
                            target: users.github_username,
                            set: {
                                display_name: (profile as any).name || null,
                                avatar_url: (profile as any).avatar_url || null,
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
            return token;
        },
        // Session callback: Transfer GitHub username from token to session
        async session({ session, token }) {
            if (token.githubUsername) {
                session.user.githubUsername = token.githubUsername;
            }
            return session;
        },
        // Redirect callback: Handle deep links and callbackUrls after authentication
        async redirect({ url, baseUrl }) {
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
