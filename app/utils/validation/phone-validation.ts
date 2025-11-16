/**
 * Phone number validation and normalization utilities
 */

/**
 * Normalize phone number to E.164 format for storage and comparison
 * @param phone - Raw phone number input
 * @param defaultCountryCode - Default country code (default: +46 for Sweden)
 * @returns Normalized E.164 format phone number (e.g., +46701234567)
 */
export function normalizePhoneToE164(phone: string, defaultCountryCode = "+46"): string {
    // Remove all non-digit characters
    const digitsOnly = phone.replace(/\D/g, "");

    // Handle Swedish numbers specifically
    if (defaultCountryCode === "+46") {
        // If starts with 0, replace with +46
        if (digitsOnly.startsWith("0")) {
            return "+46" + digitsOnly.substring(1);
        }
        // If starts with 46, add +
        if (digitsOnly.startsWith("46")) {
            return "+" + digitsOnly;
        }
        // If no country code, assume Swedish
        if (digitsOnly.length >= 8 && digitsOnly.length <= 10) {
            return "+46" + digitsOnly;
        }
    }

    // For other formats, add default country code if needed
    if (!digitsOnly.startsWith(defaultCountryCode.replace("+", ""))) {
        return defaultCountryCode + digitsOnly;
    }

    return "+" + digitsOnly;
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
 * Accepts various formats:
 *   - Raw digits: 0701234567, 701234567
 *   - With country code: +46701234567, 46701234567
 *   - E.164 format: +46701234567 (for editing existing records)
 * @param phone - Raw phone input
 * @returns null if valid, error message if invalid
 */
export function validatePhoneInput(phone: string): string | null {
    const digitsOnly = phone.replace(/\D/g, "");

    // Must have 8-12 digits (covers Swedish mobile and landline with/without country code)
    // Examples:
    //   - 70123456 (8 digits, mobile without leading 0)
    //   - 0701234567 (10 digits, mobile with leading 0)
    //   - +46701234567 (11 digits after stripping +, E.164 format)
    if (digitsOnly.length < 8 || digitsOnly.length > 12) {
        return "validation.phoneNumberFormat";
    }

    return null;
}
