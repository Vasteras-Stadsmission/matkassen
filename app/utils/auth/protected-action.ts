import {
    verifyServerActionAuth,
    verifyHouseholdAccess,
    type ServerActionAuthResult,
} from "./server-action-auth";

// Use the session type from our auth result for better type safety
type AuthSession = NonNullable<ServerActionAuthResult["session"]>;

/**
 * Higher-order function that wraps server actions with automatic authentication.
 * This ensures all protected server actions have authentication enforced at runtime.
 *
 * @example
 * ```typescript
 * export const updateHousehold = protectedAction(async (session, data: FormData) => {
 *   // session is automatically provided and verified
 *   const userName = session.user?.name;
 *   // your logic here
 * });
 * ```
 *
 * @param action - The server action function to protect. First parameter is the verified session.
 * @returns A wrapped function that enforces authentication before execution
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function protectedAction<T extends any[], R>(
    action: (session: AuthSession, ...args: T) => Promise<R>,
): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
        const authResult = await verifyServerActionAuth();

        if (!authResult.authorized || !authResult.session) {
            // Return the validation error structure
            return authResult.error as R;
        }

        // Audit log for security monitoring
        console.log("[PROTECTED_ACTION]", {
            timestamp: new Date().toISOString(),
            userName: authResult.session.user?.name,
            userEmail: authResult.session.user?.email,
            action: action.name || "anonymous",
        });

        return action(authResult.session, ...args);
    };
}

/**
 * Higher-order function for server actions that need household access verification.
 * Combines authentication with household existence check.
 *
 * @example
 * ```typescript
 * export const updateParcels = protectedHouseholdAction(async (session, household, data: FormData) => {
 *   // Both session and household are verified
 *   // your logic here
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
        household: { id: string; first_name: string; last_name: string },
        ...args: T extends [string, ...infer Rest] ? Rest : never
    ) => Promise<R>,
): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
        const [householdId, ...restArgs] = args;

        const authResult = await verifyServerActionAuth();

        if (!authResult.authorized || !authResult.session) {
            return authResult.error as R;
        }

        const householdResult = await verifyHouseholdAccess(householdId as string);

        if (!householdResult.exists || !householdResult.household) {
            return householdResult.error as R;
        }

        // Audit log
        console.log("[PROTECTED_HOUSEHOLD_ACTION]", {
            timestamp: new Date().toISOString(),
            userName: authResult.session.user?.name,
            userEmail: authResult.session.user?.email,
            householdId: householdResult.household.id,
            householdName: `${householdResult.household.first_name} ${householdResult.household.last_name}`,
            action: action.name || "anonymous",
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return action(authResult.session, householdResult.household, ...(restArgs as any));
    };
}
