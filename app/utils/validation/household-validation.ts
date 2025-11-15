/**
 * Household form validation utilities
 *
 * This module provides reusable validation functions for household forms.
 * These validators are used by both the enrollment and edit forms to ensure
 * consistent validation logic across the application.
 *
 * @module utils/validation/household-validation
 */

/**
 * Validates postal code format
 *
 * Postal codes are optional. If provided, they must be exactly 5 digits.
 * Whitespace is stripped before validation.
 *
 * @param value - The postal code value to validate
 * @returns null if valid, error message key if invalid
 */
export function validatePostalCode(value: string | null | undefined): string | null {
    // Postal code is optional - empty values are valid
    if (!value || value.trim().length === 0) {
        return null;
    }

    // Strip whitespace and validate format (exactly 5 digits)
    const stripped = value.replace(/\s/g, "");
    if (!/^\d{5}$/.test(stripped)) {
        return "validation.postalCodeFormat";
    }

    return null;
}

/**
 * Formats a postal code for display
 *
 * Formats a Swedish postal code as "XXX XX" for better readability.
 *
 * @param value - The postal code to format
 * @returns Formatted postal code string
 */
export function formatPostalCode(value: string | null | undefined): string {
    if (!value) return "";

    // Extract only digits
    const digits = value.replace(/\D/g, "");

    // Don't format if less than 4 digits
    if (digits.length <= 3) {
        return digits;
    }

    // Format as "XXX XX"
    return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

/**
 * Normalizes postal code for database storage
 *
 * Converts empty or whitespace-only postal codes to null.
 * This ensures compatibility with the database constraint that requires
 * postal codes to be either NULL or exactly 5 digits.
 *
 * @param value - The postal code to normalize
 * @returns null if empty/whitespace, trimmed value otherwise
 */
export function normalizePostalCode(value: string | null | undefined): string | null {
    if (!value) return null;

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
