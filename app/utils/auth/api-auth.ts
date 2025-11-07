/**
 * Authentication utilities for API routes
 * Provides consistent auth checks across admin API endpoints
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { validateOrganizationMembership } from "@/app/utils/auth/organization-auth";
import { checkRateLimit, getSmsRateLimitKey } from "@/app/utils/rate-limit";
import { logger, logError } from "@/app/utils/logger";

export interface AuthResult {
    success: boolean;
    response?: NextResponse;
    session?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
}

/**
 * Comprehensive authentication check for admin API endpoints
 * Verifies both session and organization membership
 */
export async function authenticateAdminRequest(rateLimitConfig?: {
    endpoint: string;
    config: RateLimitConfig;
    identifier?: string;
}): Promise<AuthResult> {
    try {
        // Check basic authentication
        const session = await auth();
        if (!session?.user?.githubUsername) {
            return {
                success: false,
                response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
            };
        }

        // Check organization membership using GitHub username (not display name)
        const username = session.user.githubUsername;
        const orgCheck = await validateOrganizationMembership(username, "api");

        if (!orgCheck.isValid) {
            const statusCode = orgCheck.error?.includes("configuration") ? 500 : 403;
            return {
                success: false,
                response: NextResponse.json(
                    { error: orgCheck.error || "Access denied" },
                    { status: statusCode },
                ),
            };
        }

        // Apply rate limiting if configured
        if (rateLimitConfig) {
            const rateLimitKey = getSmsRateLimitKey(
                rateLimitConfig.endpoint,
                username,
                rateLimitConfig.identifier,
            );

            const rateLimitResult = checkRateLimit(rateLimitKey, rateLimitConfig.config);

            if (!rateLimitResult.allowed) {
                logger.warn(
                    {
                        username,
                        endpoint: rateLimitConfig.endpoint,
                        identifier: rateLimitConfig.identifier,
                    },
                    "API rate limit exceeded",
                );

                const response = NextResponse.json(
                    {
                        error: rateLimitResult.error,
                        retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
                    },
                    { status: 429 },
                );

                // Add rate limit headers
                response.headers.set(
                    "X-RateLimit-Limit",
                    rateLimitConfig.config.maxRequests.toString(),
                );
                response.headers.set("X-RateLimit-Remaining", rateLimitResult.remaining.toString());
                response.headers.set(
                    "X-RateLimit-Reset",
                    new Date(rateLimitResult.resetTime).toISOString(),
                );

                return {
                    success: false,
                    response,
                };
            }
        }

        return {
            success: true,
            session,
        };
    } catch (error) {
        logError("API authentication check failed", error);
        return {
            success: false,
            response: NextResponse.json({ error: "Authentication check failed" }, { status: 500 }),
        };
    }
}
