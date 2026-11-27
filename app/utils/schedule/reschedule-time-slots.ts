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
 * With alignToSlotGrid the first slot is rounded up to a multiple of the slot
 * duration from midnight, so the picker matches the server's slot rounding.
 */
export function getRescheduleTimeSlots(
    date: Date | null,
    locationSchedules: LocationScheduleInfo | null,
    slotDuration: number,
    alignToSlotGrid: boolean,
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

    let start = timeRange.earliestTime;
    if (alignToSlotGrid) {
        const [eh, em] = timeRange.earliestTime.split(":").map(Number);
        const totalAligned = eh * 60 + Math.ceil(em / slotDuration) * slotDuration;
        const alignedH = Math.floor(totalAligned / 60);
        const alignedM = totalAligned % 60;
        start = `${String(alignedH).padStart(2, "0")}:${String(alignedM).padStart(2, "0")}`;
    }

    const slots = generateTimeSlotsBetween(start, timeRange.latestTime, slotDuration, true).map(
        timeString => ({
            value: timeString,
            label: timeString,
            disabled: !isTimeAvailable(date, timeString, locationSchedules).isAvailable,
        }),
    );

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
