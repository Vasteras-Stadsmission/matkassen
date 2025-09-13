/**
 * Centralized organization membership validation
 * Used by both OAuth sign-in and API authentication
 */

import { checkOrganizationMembership } from "@/app/utils/github-app";

export interface OrganizationCheckResult {
    isValid: boolean;
    error?: string;
    details?: string;
}

/**
 * Validates if a user is a member of the required GitHub organization
 * Handles all error cases and environment validation consistently
 *
 * @param username - GitHub username to check
 * @param context - Context for logging (e.g., "signin", "api")
 * @returns Result indicating if user is valid organization member
 */
export async function validateOrganizationMembership(
    username: string,
    context: string = "auth",
): Promise<OrganizationCheckResult> {
    // Check required environment variables
    const organization = process.env.GITHUB_ORG;
    if (!organization) {
        console.error(`Missing GITHUB_ORG environment variable in ${context}`);
        return {
            isValid: false,
            error: "Server configuration error",
            details: "Missing organization configuration",
        };
    }

    if (!username) {
        console.error(`Missing username in ${context}`);
        return {
            isValid: false,
            error: "Invalid user data",
            details: "Username is required",
        };
    }

    try {
        console.log(
            `Checking membership for user: ${username} in org: ${organization} (${context})`,
        );

        const isMember = await checkOrganizationMembership(username, organization);

        if (isMember) {
            console.log(`✅ Access granted to ${username} (${context})`);
            return { isValid: true };
        } else {
            console.warn(
                `❌ Access denied: User ${username} is not a member of organization ${organization} (${context})`,
            );
            return {
                isValid: false,
                error: "Access denied: Organization membership required",
                details: `User is not a member of ${organization}`,
            };
        }
    } catch (error) {
        console.error(`Error checking organization membership in ${context}:`, error);
        return {
            isValid: false,
            error: "Unable to verify organization membership",
            details: "Membership verification failed",
        };
    }
}
