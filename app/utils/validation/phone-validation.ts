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
 * Format phone number for display
 * Swedish format: +46 70 123 45 67
 * @param phone - Phone number (E.164 or local Swedish format)
 * @returns Formatted phone number for display
 */
export function formatPhoneForDisplay(phone: string): string {
    if (!phone) return "";

    // Normalize to E.164 format first if not already
    const normalized = phone.startsWith("+46") ? phone : normalizePhoneToE164(phone);

    const withoutPrefix = normalized.substring(3); // Remove "+46"

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
 * Only accepts Swedish MOBILE phone numbers (9 or 10 digits).
 * @param phone - Raw phone input (local number without +46, may include spaces)
 * @returns null if valid, error message if invalid
 */
export function validatePhoneInput(phone: string): string | null {
    // Reject international prefixes - only Swedish numbers allowed
    if (phone.startsWith("+") || phone.startsWith("00")) {
        return "validation.swedishNumbersOnly";
    }

    const digitsOnly = phone.replace(/\D/g, "");

    // Swedish mobile numbers are exactly:
    //   - 9 digits without leading 0 (701234567)
    //   - 10 digits with leading 0 (0701234567)
    if (digitsOnly.length < 9 || digitsOnly.length > 10) {
        return "validation.phoneNumberFormat";
    }

    // If 10 digits, must start with 0
    if (digitsOnly.length === 10 && !digitsOnly.startsWith("0")) {
        return "validation.phoneNumberFormat";
    }

    // If 9 digits, must NOT start with 0 (would be invalid mobile format)
    if (digitsOnly.length === 9 && digitsOnly.startsWith("0")) {
        return "validation.phoneNumberFormat";
    }

    return null;
}

/**
 * Format phone input with spaces for better readability while typing
 * Format: 0712 34 56 78 (with leading 0) or 712 34 56 78 (without)
 * @param input - Raw user input (may contain spaces or other characters)
 * @returns Formatted phone number with spaces
 */
export function formatPhoneInputWithSpaces(input: string): string {
    // Extract only digits
    const digits = input.replace(/\D/g, "");

    // Limit to 10 digits max
    const limited = digits.slice(0, 10);

    if (limited.length === 0) {
        return "";
    }

    // Format based on whether it starts with 0
    if (limited.startsWith("0")) {
        // Format: 0712 34 56 78
        if (limited.length <= 4) {
            return limited;
        } else if (limited.length <= 6) {
            return `${limited.slice(0, 4)} ${limited.slice(4)}`;
        } else if (limited.length <= 8) {
            return `${limited.slice(0, 4)} ${limited.slice(4, 6)} ${limited.slice(6)}`;
        } else {
            return `${limited.slice(0, 4)} ${limited.slice(4, 6)} ${limited.slice(6, 8)} ${limited.slice(8)}`;
        }
    } else {
        // Format: 712 34 56 78
        if (limited.length <= 3) {
            return limited;
        } else if (limited.length <= 5) {
            return `${limited.slice(0, 3)} ${limited.slice(3)}`;
        } else if (limited.length <= 7) {
            return `${limited.slice(0, 3)} ${limited.slice(3, 5)} ${limited.slice(5)}`;
        } else {
            return `${limited.slice(0, 3)} ${limited.slice(3, 5)} ${limited.slice(5, 7)} ${limited.slice(7)}`;
        }
    }
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
