import type { LocationScheduleInfo } from "@/app/[locale]/schedule/types";
import { generateTimeSlotsBetween } from "@/app/utils/date-utils";
import {
    getAvailableTimeRange,
    isDateAvailable,
    isTimeAvailable,
} from "@/app/utils/schedule/location-availability";

export interface RescheduleTimeSlot {
    value: string;
    label: string;
    disabled: boolean;
}

export interface RescheduleTimeSlots {
    slots: RescheduleTimeSlot[];
    /** The first slot that isn't disabled, picked until the user picks another */
    firstAvailable: string | null;
    /** Key under `reschedule.*` explaining why nothing can be picked */
    errorKey: "dateUnavailable" | "noTimesAvailable" | null;
}

/**
 * The pickup times a reschedule dialog offers for a date. Used by
 * RescheduleInline, ReschedulePickupModal and BulkRescheduleModal.
 *
 * Slots start at opening time, like the weekly schedule grid. The server
 * accepts any start inside opening hours, so a grid counted from midnight
 * would only hide valid times (10:30 with 45-minute slots, say).
 */
export function getRescheduleTimeSlots(
    date: Date | null,
    locationSchedules: LocationScheduleInfo | null,
    slotDuration: number,
): RescheduleTimeSlots {
    if (!date || !locationSchedules) {
        return { slots: [], firstAvailable: null, errorKey: null };
    }

    if (!isDateAvailable(date, locationSchedules).isAvailable) {
        return { slots: [], firstAvailable: null, errorKey: "dateUnavailable" };
    }

    const timeRange = getAvailableTimeRange(date, locationSchedules);
    if (!timeRange.earliestTime || !timeRange.latestTime) {
        return { slots: [], firstAvailable: null, errorKey: "noTimesAvailable" };
    }

    const slots = generateTimeSlotsBetween(
        timeRange.earliestTime,
        timeRange.latestTime,
        slotDuration,
        true,
    ).map(timeString => ({
        value: timeString,
        label: timeString,
        disabled: !isTimeAvailable(date, timeString, locationSchedules).isAvailable,
    }));

    const firstAvailable = slots.find(slot => !slot.disabled)?.value ?? null;
    return {
        slots,
        firstAvailable,
        errorKey: firstAvailable ? null : "noTimesAvailable",
    };
}

/**
 * The time a reschedule dialog submits. pickedTime is undefined until the
 * user picks one and null once they clear it. A picked time the slots no
 * longer offer (say the slot duration loaded after the pick) falls back to the
 * first available one.
 */
export function selectedRescheduleTime(
    timeSlots: RescheduleTimeSlots,
    pickedTime: string | null | undefined,
): string | null {
    if (pickedTime === null) return null;
    const offered = timeSlots.slots.some(slot => slot.value === pickedTime && !slot.disabled);
    return offered && pickedTime !== undefined ? pickedTime : timeSlots.firstAvailable;
}
