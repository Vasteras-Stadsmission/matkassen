/**
 * Authentication utilities for API routes
 * Provides consistent auth checks across admin API endpoints
 */

import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { checkRateLimit, getSmsRateLimitKey } from "@/app/utils/rate-limit";
import { logger, logError } from "@/app/utils/logger";

export interface AuthResult {
    success: boolean;
    response?: NextResponse;
    session?: Session;
}

interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
}

/**
 * Comprehensive authentication check for admin API endpoints
 * Verifies both session and organization membership
 * When adminOnly=true (default), also rejects handout_staff users with 403
 */
export async function authenticateAdminRequest(
    rateLimitConfig?: {
        endpoint: string;
        config: RateLimitConfig;
        identifier?: string;
    },
    options: { adminOnly?: boolean } = { adminOnly: true },
): Promise<AuthResult> {
    try {
        // Check basic authentication
        const session = await auth();
        if (!session?.user?.githubUsername) {
            return {
                success: false,
                response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
            };
        }

        const username = session.user.githubUsername;
        const eligibility = session.user.orgEligibility;
        if (!eligibility) {
            return {
                success: false,
                response: NextResponse.json(
                    { error: "Re-authentication required" },
                    { status: 403 },
                ),
            };
        }

        if (!eligibility.ok) {
            const statusCode = eligibility.status === "configuration_error" ? 500 : 403;
            return {
                success: false,
                response: NextResponse.json({ error: "Access denied" }, { status: statusCode }),
            };
        }

        if ((options.adminOnly ?? true) && session.user.role !== "admin") {
            return {
                success: false,
                response: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
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
