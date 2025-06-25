import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import type { NextAuthConfig } from "next-auth";
import { checkOrganizationMembership } from "@/app/utils/github-app";

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
                const organization = process.env.GITHUB_ORG;
                const username = profile?.login as string;

                if (!organization || !username) {
                    console.error("Missing required environment variables or user profile", {
                        hasOrg: !!organization,
                        hasUsername: !!username,
                    });
                    return `/auth/error?error=configuration`;
                }

                try {
                    // Check organization membership using GitHub App
                    console.log(
                        `Checking membership for user: ${username} in org: ${organization}`,
                    );
                    const isMember = await checkOrganizationMembership(username, organization);
                    if (isMember) {
                        console.log(`✅ Access granted to ${username}`);
                        return true;
                    } else {
                        console.warn(
                            `❌ Access denied: User ${username} is not a member of organization ${organization}`,
                        );

                        return false; // This will trigger AccessDenied error
                    }
                } catch (error) {
                    console.error("Error checking organization membership:", error);
                    return `/auth/error?error=configuration`;
                }
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
