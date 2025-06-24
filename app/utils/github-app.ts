import { createAppAuth } from "@octokit/auth-app";

interface GitHubInstallation {
    id: number;
    account?: {
        login?: string;
    };
}

/**
 * Get GitHub App installation access token for the organization
 * This token can be used to make API calls on behalf of the installed app
 */
export async function getGitHubAppToken(): Promise<string> {
    const appId = process.env.AUTH_GITHUB_APP_ID;
    const privateKey = process.env.AUTH_GITHUB_APP_PRIVATE_KEY;
    const organization = process.env.GITHUB_ORG;

    if (!appId || !privateKey || !organization) {
        throw new Error(
            "Missing required GitHub App environment variables: AUTH_GITHUB_APP_ID, AUTH_GITHUB_APP_PRIVATE_KEY, or GITHUB_ORG",
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
            installationId: await getInstallationId(organization, auth),
        });

        return token;
    } catch (error) {
        console.error("Failed to get GitHub App token:", error);
        throw new Error("Failed to authenticate with GitHub App");
    }
}

/**
 * Get the installation ID for the organization
 */
async function getInstallationId(
    organization: string,
    auth: ReturnType<typeof createAppAuth>,
): Promise<number> {
    try {
        // Get app JWT token to list installations
        const { token: appToken } = await auth({ type: "app" });

        // List installations for the app
        const response = await fetch("https://api.github.com/app/installations", {
            headers: {
                "Accept": "application/vnd.github+json",
                "Authorization": `Bearer ${appToken}`,
                "X-GitHub-Api-Version": "2022-11-28",
            },
        });

        if (!response.ok) {
            throw new Error(
                `Failed to fetch installations: ${response.status} ${response.statusText}`,
            );
        }

        const installations = await response.json();

        // Find installation for the target organization
        const installation = installations.find(
            (inst: GitHubInstallation) =>
                inst.account?.login?.toLowerCase() === organization.toLowerCase(),
        );

        if (!installation) {
            throw new Error(`No installation found for organization: ${organization}`);
        }

        return installation.id;
    } catch (error) {
        console.error("Failed to get installation ID:", error);
        throw new Error(`Failed to find GitHub App installation for organization: ${organization}`);
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
        // 302 = user is a private member (but we won't see this with org member scope)
        return response.status === 204;
    } catch (error) {
        console.error("Failed to check organization membership:", error);
        return false;
    }
}
