import { createAppAuth } from "@octokit/auth-app";

/**
 * Get GitHub App installation access token for the organization
 * This token can be used to make API calls on behalf of the installed app
 */
export async function getGitHubAppToken(): Promise<string> {
    const appId = process.env.AUTH_GITHUB_APP_ID;
    const privateKey = process.env.AUTH_GITHUB_APP_PRIVATE_KEY;
    const installationId = process.env.AUTH_GITHUB_APP_INSTALLATION_ID;

    if (!appId || !privateKey || !installationId) {
        const missing = [];
        if (!appId) missing.push("AUTH_GITHUB_APP_ID");
        if (!privateKey) missing.push("AUTH_GITHUB_APP_PRIVATE_KEY");
        if (!installationId) missing.push("AUTH_GITHUB_APP_INSTALLATION_ID");

        throw new Error(
            `Missing required GitHub App environment variable(s): ${missing.join(", ")}`,
        );
    }

    try {
        // Create app authentication
        const auth = createAppAuth({
            appId: parseInt(appId, 10),
            privateKey: privateKey.replace(/\\n/g, "\n"), // Handle escaped newlines
        });

        // Get installation access token for the organization
        const { token } = await auth({
            type: "installation",
            installationId: parseInt(installationId, 10),
        });

        return token;
    } catch (error) {
        console.error("Failed to get GitHub App token:", error);
        throw new Error("Failed to authenticate with GitHub App");
    }
}

/**
 * Check if a user is a member of the organization using GitHub App token
 */
export async function checkOrganizationMembership(
    username: string,
    organization: string,
): Promise<boolean> {
    try {
        const token = await getGitHubAppToken();

        const response = await fetch(
            `https://api.github.com/orgs/${organization}/members/${username}`,
            {
                headers: {
                    "Accept": "application/vnd.github+json",
                    "Authorization": `Bearer ${token}`,
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            },
        );

        // 204 = user is a member (public or private)
        // 404 = user is not a member or org doesn't exist
        return response.status === 204;
    } catch (error) {
        console.error("Failed to check organization membership:", error);
        return false;
    }
}
