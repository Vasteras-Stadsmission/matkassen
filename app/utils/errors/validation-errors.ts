/**
 * Custom Error Classes for Structured Error Handling
 *
 * This module defines custom error classes that provide type-safe, structured error handling
 * throughout the application. These classes replace the brittle pattern of serializing errors
 * to JSON strings, making error handling more maintainable and debuggable.
 *
 * @module errors/validation-errors
 */

import type { ValidationError } from "@/app/utils/validation/parcel-assignment";

/**
 * Base application error class
 *
 * Extends the native Error class to provide a foundation for all custom application errors.
 * This ensures all custom errors have consistent behavior and can be identified as app-specific.
 */
export class AppError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

/**
 * Validation error class for parcel assignment failures
 *
 * This error is thrown when parcel assignment validation fails due to business rules
 * such as capacity limits, scheduling conflicts, or invalid time slots.
 *
 * @example
 * ```typescript
 * const errors = [
 *   { field: "capacity", code: "MAX_DAILY_CAPACITY_REACHED", message: "Location full" }
 * ];
 * throw new ParcelValidationError("Parcel validation failed", errors);
 * ```
 *
 * @example
 * ```typescript
 * try {
 *   await assignParcel(...);
 * } catch (error) {
 *   if (error instanceof ParcelValidationError) {
 *     console.log("Validation errors:", error.validationErrors);
 *   }
 * }
 * ```
 */
export class ParcelValidationError extends AppError {
    /**
     * Structured validation errors with field, code, message, and optional details
     */
    public readonly validationErrors: ValidationError[];

    /**
     * Creates a new ParcelValidationError
     *
     * @param message - Human-readable error message
     * @param validationErrors - Array of structured validation errors
     */
    constructor(message: string, validationErrors: ValidationError[]) {
        super(message);
        this.validationErrors = validationErrors;
    }
}
