/**
 * Centralized organization membership validation
 * Used by both OAuth sign-in and API authentication
 */

import { checkOrganizationMembership } from "@/app/utils/github-app";
import { logger, logError } from "@/app/utils/logger";

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
        logger.error(
            {
                context,
                error: "Missing GITHUB_ORG environment variable",
            },
            "Organization auth: Missing configuration",
        );
        return {
            isValid: false,
            error: "Server configuration error",
            details: "Missing organization configuration",
        };
    }

    if (!username) {
        logger.error(
            {
                context,
                error: "Missing username",
            },
            "Organization auth: Invalid user data",
        );
        return {
            isValid: false,
            error: "Invalid user data",
            details: "Username is required",
        };
    }

    try {
        logger.info(
            {
                username,
                organization,
                context,
            },
            "Checking organization membership",
        );

        const isMember = await checkOrganizationMembership(username, organization);

        if (isMember) {
            logger.info(
                {
                    username,
                    context,
                },
                "Organization auth: Access granted",
            );
            return { isValid: true };
        } else {
            logger.warn(
                {
                    username,
                    organization,
                    context,
                },
                "Organization auth: Access denied - not a member",
            );
            return {
                isValid: false,
                error: "Access denied: Organization membership required",
                details: `User is not a member of ${organization}`,
            };
        }
    } catch (error) {
        logError("Organization auth: Failed to verify membership", error, {
            username,
            organization,
            context,
        });
        return {
            isValid: false,
            error: "Unable to verify organization membership",
            details: "Membership verification failed",
        };
    }
}
