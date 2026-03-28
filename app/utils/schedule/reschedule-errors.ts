/**
 * Shared error-code-to-i18n mapping for reschedule operations.
 * Used by RescheduleInline, ReschedulePickupModal, and WeeklyScheduleGrid.
 */

import type { TranslationFunction } from "@/app/[locale]/types";

const AGREEMENT_CODES = new Set(["AGREEMENT_REQUIRED", "AGREEMENT_CHECK_FAILED"]);

const ERROR_CODE_TO_I18N_KEY: Record<string, string> = {
    MAX_DAILY_CAPACITY_REACHED: "reschedule.capacityError",
    MAX_SLOT_CAPACITY_REACHED: "reschedule.slotCapacityError",
    HOUSEHOLD_DOUBLE_BOOKING: "reschedule.doubleBookingError",
    OUTSIDE_OPERATING_HOURS: "reschedule.operatingHoursError",
    PAST_TIME_SLOT: "reschedule.pastError",
    // Map codes that shouldn't normally reach the UI to the generic error
    PARCEL_NOT_FOUND: "reschedule.genericError",
    LOCATION_NOT_FOUND: "reschedule.genericError",
    TIME_SLOT_CONFLICT: "reschedule.genericError",
    INVALID_TIME_SLOT: "reschedule.genericError",
    INTERNAL_ERROR: "reschedule.genericError",
    VALIDATION_ERROR: "reschedule.genericError",
    UNAUTHORIZED: "reschedule.genericError",
    FORBIDDEN: "reschedule.genericError",
    CONFIGURATION_ERROR: "reschedule.genericError",
    AUTH_CHECK_FAILED: "reschedule.genericError",
    UNKNOWN_ERROR: "reschedule.genericError",
};

export function isAgreementRequiredCode(errorCode: string): boolean {
    return AGREEMENT_CODES.has(errorCode);
}

export function getRescheduleErrorMessage(
    t: TranslationFunction,
    errorCode: string | undefined,
    fallbackError: string | undefined,
): string {
    if (errorCode) {
        const i18nKey = ERROR_CODE_TO_I18N_KEY[errorCode];
        if (i18nKey) {
            return t(i18nKey);
        }
    }
    return fallbackError || t("reschedule.genericError");
}
