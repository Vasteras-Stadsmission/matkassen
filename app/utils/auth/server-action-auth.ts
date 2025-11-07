/**
 * Authorization utilities for server actions
 * Provides consistent auth and resource access checks across server actions
 */

import { auth } from "@/auth";
import { validateOrganizationMembership } from "@/app/utils/auth/organization-auth";
import { db } from "@/app/db/drizzle";
import { households } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { type ActionResult, failure } from "./action-result";
import { logError } from "@/app/utils/logger";

/**
 * Session type for authenticated users
 */
export interface AuthSession {
    user?: {
        githubUsername?: string;
        name?: string | null;
        email?: string | null;
        image?: string | null;
    };
}

/**
 * Household data returned after access verification
 */
export interface HouseholdData {
    id: string;
    first_name: string;
    last_name: string;
}

/**
 * Auth result type (for internal use in protected-action.ts)
 * External callers should use ActionResult<T> instead
 */
export type ServerActionAuthResult = ActionResult<AuthSession>;

/**
 * Household access result type (for internal use in protected-action.ts)
 * External callers should use ActionResult<T> instead
 */
export type HouseholdAccessResult = ActionResult<HouseholdData>;

/**
 * Verify that the user is authenticated and is an organization member
 * This is the primary authorization check for all server actions
 */
export async function verifyServerActionAuth(): Promise<ServerActionAuthResult> {
    let session: AuthSession | null = null;
    try {
        // Check basic authentication
        session = await auth();

        if (!session?.user?.githubUsername) {
            return failure({
                code: "UNAUTHORIZED",
                message: "You must be authenticated to perform this action",
                field: "auth",
            });
        }

        // Check organization membership using GitHub username (not display name)
        const username = session.user.githubUsername;
        const orgCheck = await validateOrganizationMembership(username, "server-action");

        if (!orgCheck.isValid) {
            const isConfigError = orgCheck.error?.includes("configuration");
            return failure({
                code: isConfigError ? "CONFIGURATION_ERROR" : "FORBIDDEN",
                message: isConfigError
                    ? "Server configuration error. Please contact support."
                    : "You don't have permission to perform this action",
                field: "auth",
            });
        }

        return {
            success: true,
            data: session,
        };
    } catch (error) {
        logError("Server action auth check failed", error, {
            username: session?.user?.githubUsername,
        });
        return failure({
            code: "AUTH_CHECK_FAILED",
            message: "Authentication check failed",
            field: "auth",
        });
    }
}

/**
 * Verify that a household exists and return basic household info
 * Does NOT check ownership - all org members can access all households
 */
export async function verifyHouseholdAccess(householdId: string): Promise<HouseholdAccessResult> {
    try {
        if (!householdId || typeof householdId !== "string") {
            return failure({
                code: "INVALID_HOUSEHOLD_ID",
                message: "Invalid household ID provided",
                field: "householdId",
            });
        }

        const [household] = await db
            .select({
                id: households.id,
                first_name: households.first_name,
                last_name: households.last_name,
            })
            .from(households)
            .where(eq(households.id, householdId))
            .limit(1);

        if (!household) {
            return failure({
                code: "HOUSEHOLD_NOT_FOUND",
                message: "The specified household does not exist",
                field: "householdId",
            });
        }

        return {
            success: true,
            data: household,
        };
    } catch (error) {
        logError("Household access check failed", error, { householdId });
        return failure({
            code: "HOUSEHOLD_CHECK_FAILED",
            message: "Failed to verify household access",
            field: "householdId",
        });
    }
}
