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
        const missing: string[] = [];
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
 * @throws Error for configuration/network issues (mapped to Auth.js Configuration error)
 * @returns true if user is a member, false if not a member
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

        // Handle specific response codes
        if (response.status === 204) {
            // User is a member (public or private)
            return true;
        }

        if (response.status === 404) {
            // User is definitely not a member or org doesn't exist
            return false;
        }

        // Handle other status codes as configuration/infrastructure errors
        if (response.status === 401) {
            throw new Error("GitHub App authentication failed - check app credentials");
        }

        if (response.status === 403) {
            throw new Error("GitHub App lacks permission to check organization membership");
        }

        if (response.status === 429) {
            throw new Error("GitHub API rate limit exceeded - please try again later");
        }

        // Any other unexpected status
        throw new Error(`GitHub API returned unexpected status: ${response.status}`);
    } catch (error) {
        // If it's already our custom error, re-throw it
        if (error instanceof Error && error.message.startsWith("GitHub")) {
            throw error;
        }

        // Network/fetch errors
        console.error("Failed to check organization membership:", error);
        throw new Error("Unable to verify organization membership - please try again");
    }
}
