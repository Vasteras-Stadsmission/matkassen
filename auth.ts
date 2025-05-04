import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import type { NextAuthConfig } from "next-auth";

// Define a more comprehensive Auth.js configuration
const authConfig: NextAuthConfig = {
    providers: [
        GitHub({
            clientId: process.env.GITHUB_ID,
            clientSecret: process.env.GITHUB_SECRET,
            // Disable PKCE to fix the cookie parsing issue
            authorization: {
                params: { scope: "read:user user:email read:org" },
            },
        }),
    ],
    cookies: {
        // Configure cookies to be properly accessible and secure
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
                // Verify that the user is a public member of the organization
                // https://docs.github.com/en/rest/members/members#check-organization-membership-for-a-user
                const organization = process.env.GITHUB_ORG!;
                const username = profile?.login;
                const res = await fetch(
                    `https://api.github.com/orgs/${organization}/members/${username}`,
                    {
                        headers: {
                            "Accept": "application/vnd.github+json",
                            "Authorization": `Bearer ${account.access_token!}`,
                            "X-GitHub-Api-Version": "2022-11-28",
                        },
                    },
                );
                if (res.status === 204) {
                    return true;
                }
                // Redirect to the error page with a query parameter indicating the error reason
                return `/auth/error?error=not-org-member`;
            }
            return `/auth/error?error=invalid-account-provider`;
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
