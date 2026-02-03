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

const MEMBERSHIP_CACHE_MS = 10 * 60 * 1000; // 10 minutes
const membershipCache = new Map<string, { isMember: boolean; checkedAt: number }>();

function getCachedMembership(cacheKey: string): boolean | null {
    const cached = membershipCache.get(cacheKey);
    if (!cached) return null;
    if (Date.now() - cached.checkedAt > MEMBERSHIP_CACHE_MS) {
        membershipCache.delete(cacheKey);
        return null;
    }
    return cached.isMember;
}

function setCachedMembership(cacheKey: string, isMember: boolean) {
    // Prevent unbounded growth in long-lived processes
    if (membershipCache.size > 2000) {
        membershipCache.clear();
    }
    membershipCache.set(cacheKey, { isMember, checkedAt: Date.now() });
}

export function clearOrganizationMembershipCache() {
    membershipCache.clear();
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

    const cacheKey = `${organization}:${username}`;
    const cached = getCachedMembership(cacheKey);
    if (cached !== null) {
        return cached
            ? { isValid: true }
            : {
                  isValid: false,
                  error: "Access denied: Organization membership required",
                  details: `User is not a member of ${organization}`,
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
        setCachedMembership(cacheKey, isMember);

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
