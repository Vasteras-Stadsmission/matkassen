import {
    verifyServerActionAuth,
    verifyHouseholdAccess,
    type AuthSession,
    type HouseholdData,
} from "./server-action-auth";
import { type ActionResult } from "./action-result";
import { logger } from "@/app/utils/logger";

/**
 * Higher-order function that wraps server actions with automatic authentication.
 * This ensures all protected server actions have authentication enforced at runtime.
 *
 * Actions must return ActionResult<T> to ensure type-safe error handling.
 *
 * @example
 * ```typescript
 * export const updateHousehold = protectedAction(async (session, data: FormData): Promise<ActionResult<string>> => {
 *   // session is automatically provided and verified
 *   const userName = session.user?.name;
 *   // your logic here
 *   return success("Updated successfully");
 * });
 * ```
 *
 * @param action - The server action function to protect. First parameter is the verified session.
 * @returns A wrapped function that enforces authentication before execution
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function protectedAction<T extends any[], R>(
    action: (session: AuthSession, ...args: T) => Promise<ActionResult<R>>,
): (...args: T) => Promise<ActionResult<R>> {
    return async (...args: T): Promise<ActionResult<R>> => {
        const authResult = await verifyServerActionAuth();

        if (!authResult.success) {
            // Return the auth error
            return authResult;
        }

        // Audit log for security monitoring (IDs only, no PII)
        logger.info(
            {
                githubUsername: authResult.data.user?.githubUsername,
                action: action.name || "anonymous",
                type: "protected_action",
            },
            "Protected action executed",
        );

        return action(authResult.data, ...args);
    };
}

/**
 * Higher-order function for server actions that need household access verification.
 * Combines authentication with household existence check.
 *
 * Actions must return ActionResult<T> to ensure type-safe error handling.
 *
 * @example
 * ```typescript
 * export const updateParcels = protectedHouseholdAction(async (session, household, data: FormData): Promise<ActionResult<void>> => {
 *   // Both session and household are verified
 *   // your logic here
 *   return success(undefined);
 * });
 * ```
 *
 * @param action - The server action function to protect. Receives session, household, and remaining args.
 * @returns A wrapped function that enforces auth and household access
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function protectedHouseholdAction<T extends [string, ...any[]], R>(
    action: (
        session: AuthSession,
        household: HouseholdData,
        ...args: T extends [string, ...infer Rest] ? Rest : never
    ) => Promise<ActionResult<R>>,
): (...args: T) => Promise<ActionResult<R>> {
    return async (...args: T): Promise<ActionResult<R>> => {
        const [householdId, ...restArgs] = args;

        const authResult = await verifyServerActionAuth();

        if (!authResult.success) {
            return authResult;
        }

        const householdResult = await verifyHouseholdAccess(householdId as string);

        if (!householdResult.success) {
            return householdResult;
        }

        // Audit log (IDs only, no PII)
        logger.info(
            {
                githubUsername: authResult.data.user?.githubUsername,
                householdId: householdResult.data.id,
                action: action.name || "anonymous",
                type: "protected_household_action",
            },
            "Protected household action executed",
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return action(authResult.data, householdResult.data, ...(restArgs as any));
    };
}
