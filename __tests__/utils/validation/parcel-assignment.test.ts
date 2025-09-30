import { describe, test, expect } from "vitest";
import {
    ValidationErrorCodes,
    formatValidationError,
} from "@/app/utils/validation/parcel-assignment";

describe("Validation Error Codes", () => {
    test("should have all required error codes", () => {
        expect(ValidationErrorCodes.PARCEL_NOT_FOUND).toBe("PARCEL_NOT_FOUND");
        expect(ValidationErrorCodes.LOCATION_NOT_FOUND).toBe("LOCATION_NOT_FOUND");
        expect(ValidationErrorCodes.MAX_DAILY_CAPACITY_REACHED).toBe("MAX_DAILY_CAPACITY_REACHED");
        expect(ValidationErrorCodes.MAX_SLOT_CAPACITY_REACHED).toBe("MAX_SLOT_CAPACITY_REACHED");
        expect(ValidationErrorCodes.TIME_SLOT_CONFLICT).toBe("TIME_SLOT_CONFLICT");
        expect(ValidationErrorCodes.OUTSIDE_OPERATING_HOURS).toBe("OUTSIDE_OPERATING_HOURS");
        expect(ValidationErrorCodes.PAST_TIME_SLOT).toBe("PAST_TIME_SLOT");
        expect(ValidationErrorCodes.HOUSEHOLD_DOUBLE_BOOKING).toBe("HOUSEHOLD_DOUBLE_BOOKING");
        expect(ValidationErrorCodes.INVALID_TIME_SLOT).toBe("INVALID_TIME_SLOT");
    });

    test("should format error messages correctly", () => {
        const capacityError = {
            field: "capacity",
            code: ValidationErrorCodes.MAX_DAILY_CAPACITY_REACHED,
            message: "Capacity exceeded",
            details: {
                current: 5,
                maximum: 5,
                date: "2025-10-01",
                locationId: "loc-1",
            },
        };

        const formattedMessage = formatValidationError(capacityError, "Test Location");
        expect(formattedMessage).toContain("Test Location");
        expect(formattedMessage).toContain("maximum capacity of 5");
        expect(formattedMessage).toContain("2025-10-01");
    });

    test("should handle slot capacity errors", () => {
        const slotError = {
            field: "timeSlot",
            code: ValidationErrorCodes.MAX_SLOT_CAPACITY_REACHED,
            message: "Slot full",
            details: {},
        };

        const formattedMessage = formatValidationError(slotError);
        expect(formattedMessage).toBe(
            "This time slot is fully booked. Please select a different time.",
        );
    });

    test("should handle double booking errors", () => {
        const doubleBookingError = {
            field: "timeSlot",
            code: ValidationErrorCodes.HOUSEHOLD_DOUBLE_BOOKING,
            message: "Double booking",
            details: {
                conflictingParcelId: "parcel-2",
                householdId: "household-1",
                timeSlot: "10:00",
                date: "2025-10-01",
            },
        };

        const formattedMessage = formatValidationError(doubleBookingError);
        expect(formattedMessage).toContain("already has a parcel scheduled for 2025-10-01");
    });

    test("should handle operating hours errors", () => {
        const operatingHoursError = {
            field: "timeSlot",
            code: ValidationErrorCodes.OUTSIDE_OPERATING_HOURS,
            message: "Outside hours",
            details: {
                date: "2025-10-01",
                timeSlot: "08:00",
                locationId: "loc-1",
                reason: "Location is closed at this time",
            },
        };

        const formattedMessage = formatValidationError(operatingHoursError);
        expect(formattedMessage).toBe("Location is closed at this time");
    });

    test("should handle past time slot errors", () => {
        const pastTimeError = {
            field: "timeSlot",
            code: ValidationErrorCodes.PAST_TIME_SLOT,
            message: "Past time",
            details: {},
        };

        const formattedMessage = formatValidationError(pastTimeError);
        expect(formattedMessage).toBe("Cannot schedule pickup in the past");
    });

    test("should handle unknown error codes", () => {
        const unknownError = {
            field: "general",
            code: "UNKNOWN_ERROR",
            message: "Something went wrong",
            details: {},
        };

        const formattedMessage = formatValidationError(unknownError);
        expect(formattedMessage).toBe("Something went wrong");
    });
});
