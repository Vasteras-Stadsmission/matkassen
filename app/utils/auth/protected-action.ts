import {
    verifyServerActionAuth,
    verifyHouseholdAccess,
    type AuthSession,
    type HouseholdData,
} from "./server-action-auth";
import { type ActionResult, failure } from "./action-result";
import { logger } from "@/app/utils/logger";
import {
    getCurrentAgreement,
    getUserIdByGithubUsername,
    hasUserAcceptedAgreement,
} from "@/app/utils/user-agreement";

/**
 * Higher-order function that wraps read-only server actions with automatic authentication.
 * Unlike protectedAction, this returns data directly instead of ActionResult<T>.
 * Use this for data fetching functions where callers expect the data directly.
 *
 * Throws an error if authentication fails (instead of returning ActionResult).
 *
 * @example
 * ```typescript
 * export const getSchedules = protectedReadAction(async (session, locationId: string): Promise<Schedule[]> => {
 *   // session is automatically provided and verified
 *   return await db.select().from(schedules).where(eq(schedules.locationId, locationId));
 * });
 * ```
 *
 * @param action - The server action function to protect. First parameter is the verified session.
 * @returns A wrapped function that enforces authentication before execution
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function protectedReadAction<T extends any[], R>(
    action: (session: AuthSession, ...args: T) => Promise<R>,
): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
        const authResult = await verifyServerActionAuth();

        if (!authResult.success) {
            // Throw error for read actions - callers expect data or error
            throw new Error(authResult.error?.message || "Authentication required");
        }

        // Audit log for security monitoring (IDs only, no PII)
        logger.info(
            {
                githubUsername: authResult.data.user?.githubUsername,
                action: action.name || "anonymous",
                type: "protected_read_action",
            },
            "Protected read action executed",
        );

        return action(authResult.data, ...args);
    };
}

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

/**
 * Verify that the user has accepted the current agreement.
 * Returns a failure ActionResult if not accepted, or null if OK.
 */
async function verifyAgreementAcceptance(session: AuthSession): Promise<ActionResult<never> | null> {
    const currentAgreement = await getCurrentAgreement();
    if (!currentAgreement) return null; // No agreement = no restriction

    const githubUsername = session.user?.githubUsername;
    if (!githubUsername) {
        return failure({ code: "AGREEMENT_REQUIRED", message: "Agreement acceptance required" });
    }

    const userId = await getUserIdByGithubUsername(githubUsername);
    if (!userId) {
        // User not in DB yet — let them through (provisioning happens elsewhere)
        return null;
    }

    const accepted = await hasUserAcceptedAgreement(userId, currentAgreement.id);
    if (!accepted) {
        return failure({ code: "AGREEMENT_REQUIRED", message: "You must accept the current agreement before performing this action" });
    }

    return null;
}

/**
 * Like protectedAction but also requires the user to have accepted the current agreement.
 * Use this for actions that handle personal/household data (GDPR compliance).
 * Do NOT use for agreement-related or admin settings actions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function protectedAgreementAction<T extends any[], R>(
    action: (session: AuthSession, ...args: T) => Promise<ActionResult<R>>,
): (...args: T) => Promise<ActionResult<R>> {
    return async (...args: T): Promise<ActionResult<R>> => {
        const authResult = await verifyServerActionAuth();

        if (!authResult.success) {
            return authResult;
        }

        const agreementCheck = await verifyAgreementAcceptance(authResult.data);
        if (agreementCheck) {
            return agreementCheck;
        }

        logger.info(
            {
                githubUsername: authResult.data.user?.githubUsername,
                action: action.name || "anonymous",
                type: "protected_agreement_action",
            },
            "Protected agreement action executed",
        );

        return action(authResult.data, ...args);
    };
}

/**
 * Like protectedHouseholdAction but also requires agreement acceptance.
 * Use this for household data mutations (GDPR compliance).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function protectedAgreementHouseholdAction<T extends [string, ...any[]], R>(
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

        const agreementCheck = await verifyAgreementAcceptance(authResult.data);
        if (agreementCheck) {
            return agreementCheck;
        }

        const householdResult = await verifyHouseholdAccess(householdId as string);

        if (!householdResult.success) {
            return householdResult;
        }

        logger.info(
            {
                githubUsername: authResult.data.user?.githubUsername,
                householdId: householdResult.data.id,
                action: action.name || "anonymous",
                type: "protected_agreement_household_action",
            },
            "Protected agreement household action executed",
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return action(authResult.data, householdResult.data, ...(restArgs as any));
    };
}
