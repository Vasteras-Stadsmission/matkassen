/**
 * Type-safe result types for protected server actions.
 * Uses discriminated unions to ensure proper error handling at compile time.
 */

/**
 * Validation error structure (from parcel assignment validation)
 */
export interface ValidationError {
    field: string;
    code: string;
    message: string;
    details?: Record<string, unknown>;
}

/**
 * Error structure for failed server actions
 */
export interface ActionError {
    code: string;
    message: string;
    field?: string;
    validationErrors?: ValidationError[];
}

/**
 * Discriminated union result type for server actions.
 * Forces callers to check the success field before accessing data or error.
 *
 * @example Success case:
 * ```typescript
 * const result = await myAction();
 * if (result.success) {
 *   console.log(result.data); // Type-safe access
 * }
 * ```
 *
 * @example Error case:
 * ```typescript
 * if (!result.success) {
 *   console.error(result.error.message);
 * }
 * ```
 */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };

/**
 * Helper to create a successful action result
 */
export function success<T>(data: T): ActionResult<T> {
    return { success: true, data };
}

/**
 * Helper to create a failed action result
 */
export function failure<T>(error: ActionError): ActionResult<T> {
    return { success: false, error };
}

/**
 * Helper to create an auth error result
 */
export function authError<T>(message: string, code = "UNAUTHORIZED"): ActionResult<T> {
    return failure({ code, message, field: "auth" });
}

/**
 * Helper to create a validation error result
 */
export function validationError<T>(
    message: string,
    field?: string,
    code = "VALIDATION_ERROR",
): ActionResult<T> {
    return failure({ code, message, field });
}

/**
 * Helper to create a not found error result
 */
export function notFoundError<T>(message: string, field?: string): ActionResult<T> {
    return failure({ code: "NOT_FOUND", message, field });
}

/**
 * Helper to create a validation error result with detailed validation errors
 */
export function validationFailure<T>(
    message: string,
    validationErrors: ValidationError[],
): ActionResult<T> {
    return failure({ code: "VALIDATION_ERROR", message, validationErrors });
}
