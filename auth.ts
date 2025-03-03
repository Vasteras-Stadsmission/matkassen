import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [GitHub],
    callbacks: {
        async signIn({ account, profile }) {
            if (account?.provider === "github") {
                // Verify that the user is a public member of the organization
                // https://docs.github.com/en/rest/members/members#check-organization-membership-for-a-user
                const organization = process.env.GITHUB_ORG!;
                const username = profile?.login;
                const res = await fetch(
                    `https://api.github.com/orgs/${organization}/members?per_page=100`,
                    {
                        headers: {
                            "Accept": "application/vnd.github+json",
                            "Authorization": `Bearer ${account.access_token!}`,
                            "X-GitHub-Api-Version": "2022-11-28",
                        },
                    },
                );
                const responseBody = await res.json();
                // Return true if any member has a login that matches the username.
                return responseBody.some((member: { login: string }) => member.login === username);
            }
            return true;
        },
    },
});
