import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [GitHub],
    // callbacks: {
    //     async signIn({ user, account, profile }) {
    //         if (account?.provider === "github") {
    //             const organization = process.env.GITHUB_ORG!;
    //             const username = profile?.login;
    //             // GitHub returns 204 for a valid org membership
    //             const res = await fetch(
    //                 `https://api.github.com/orgs/${organization}/members/${username}`,
    //                 {
    //                     headers: {
    //                         Accept: "application/vnd.github.v3+json",
    //                         Authorization: `token ${account.access_token!}`,
    //                     },
    //                 },
    //             );
    //             return res.status === 204;
    //         }
    //         return true;
    //     },
    // },
});
