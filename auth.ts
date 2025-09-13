import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import type { NextAuthConfig } from "next-auth";
import { validateOrganizationMembership } from "./app/utils/auth/organization-auth";

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
            name: `next-auth.session-token`,
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
            console.error("Invalid account provider:", account?.provider);
            return `/auth/error?error=invalid-provider`;
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
