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
        // Redirect to home page after successful authentication
        async redirect({ url, baseUrl }) {
            // If url starts with the base url, proceed as normal
            if (url.startsWith(baseUrl)) return url;
            // Otherwise, redirect to the home page
            return baseUrl;
        },
    },
};

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
