/**
 * Phone number validation and normalization utilities
 *
 * NOTE: This system only supports Swedish phone numbers (+46).
 * The UI shows a fixed "+46" prefix, and users enter only the local part.
 */

/**
 * Normalize Swedish phone number to E.164 format for storage and comparison
 * @param phone - Local phone number input (without country code)
 * @returns Normalized E.164 format phone number (e.g., +46701234567)
 */
export function normalizePhoneToE164(phone: string): string {
    // Remove all non-digit characters
    const digitsOnly = phone.replace(/\D/g, "");

    // If starts with 0, remove it (local Swedish format)
    if (digitsOnly.startsWith("0")) {
        return "+46" + digitsOnly.substring(1);
    }

    // If already has country code (46), add +
    if (digitsOnly.startsWith("46") && digitsOnly.length >= 11) {
        return "+" + digitsOnly;
    }

    // Otherwise, prepend +46
    return "+46" + digitsOnly;
}

/**
 * Validate E.164 phone number format
 * @param phone - Phone number to validate
 * @returns true if valid E.164 format
 */
export function isValidE164(phone: string): boolean {
    // E.164 format: + followed by 1-15 digits
    return /^\+[1-9]\d{0,14}$/.test(phone);
}

/**
 * Format E.164 phone number for display
 * Swedish format: +46 70 123 45 67
 * @param phone - E.164 formatted phone number
 * @returns Formatted phone number for display
 */
export function formatPhoneForDisplay(phone: string): string {
    if (!phone.startsWith("+46")) {
        return phone; // Return as-is for non-Swedish numbers
    }

    const withoutPrefix = phone.substring(3); // Remove "+46"

    // Format as: +46 XX XXX XX XX (Swedish mobile) or +46 XX XXX XXXX (Swedish landline)
    if (withoutPrefix.length === 9) {
        // Mobile: 70 123 45 67
        return `+46 ${withoutPrefix.substring(0, 2)} ${withoutPrefix.substring(2, 5)} ${withoutPrefix.substring(5, 7)} ${withoutPrefix.substring(7)}`;
    } else if (withoutPrefix.length === 8) {
        // Landline: 8 1234 5678
        return `+46 ${withoutPrefix.substring(0, 1)} ${withoutPrefix.substring(1, 5)} ${withoutPrefix.substring(5)}`;
    }

    // Default: just add space after country code
    return `+46 ${withoutPrefix}`;
}

/**
 * Validate raw phone input (before normalization)
 * Only accepts Swedish local phone numbers.
 * @param phone - Raw phone input (local number without +46)
 * @returns null if valid, error message if invalid
 */
export function validatePhoneInput(phone: string): string | null {
    // Reject international prefixes - only Swedish numbers allowed
    if (phone.startsWith("+") || phone.startsWith("00")) {
        return "validation.swedishNumbersOnly";
    }

    const digitsOnly = phone.replace(/\D/g, "");

    // Swedish local numbers are 7-10 digits
    // Examples:
    //   - 701234567 (9 digits, mobile without leading 0)
    //   - 0701234567 (10 digits, mobile with leading 0)
    //   - 81234567 (8 digits, Stockholm landline without leading 0)
    //   - 081234567 (9 digits, Stockholm landline with leading 0)
    if (digitsOnly.length < 7 || digitsOnly.length > 10) {
        return "validation.phoneNumberFormat";
    }

    return null;
}

/**
 * Strip +46 prefix from E.164 number for display in input field
 * @param phone - E.164 formatted phone number (e.g., +46701234567)
 * @returns Local number without country code (e.g., 701234567)
 */
export function stripSwedishPrefix(phone: string): string {
    if (!phone) return "";

    // Remove +46 prefix if present
    if (phone.startsWith("+46")) {
        return phone.substring(3);
    }

    // Remove 46 prefix if present (without +)
    if (phone.startsWith("46") && phone.length > 10) {
        return phone.substring(2);
    }

    return phone;
}
