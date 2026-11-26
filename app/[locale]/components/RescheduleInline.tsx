"use client";

import { useState, useEffect } from "react";
import { Button, Group, Text, Select, Stack, Collapse } from "@mantine/core";
import { IconCalendar, IconClock, IconCheck } from "@tabler/icons-react";
import { DateInput } from "@mantine/dates";
import { useTranslations } from "next-intl";
import { TranslationFunction } from "@/app/[locale]/types";
import {
    updateFoodParcelScheduleAction,
    getPickupLocationSchedulesAction,
    getLocationSlotDurationAction,
    getFullyBookedDatesAction,
} from "@/app/[locale]/schedule/client-actions";
import type { LocationScheduleInfo } from "@/app/[locale]/schedule/types";
import { toStockholmDate, formatDateToYMD } from "@/app/utils/date-utils";
import { isDateAvailable } from "@/app/utils/schedule/location-availability";
import { getRescheduleTimeSlots } from "@/app/utils/schedule/reschedule-time-slots";
import { Time } from "@/app/utils/time-provider";
import {
    getRescheduleErrorMessage,
    isAgreementRequiredCode,
} from "@/app/utils/schedule/reschedule-errors";

interface RescheduleInlineProps {
    parcelId: string;
    locationId: string;
    isExpanded: boolean;
    onCancel: () => void;
    onSuccess: () => void;
}

export default function RescheduleInline({
    parcelId,
    locationId,
    isExpanded,
    onCancel,
    onSuccess,
}: RescheduleInlineProps) {
    const t = useTranslations("issues") as TranslationFunction;

    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    // The time the user picked (null if they cleared it); undefined means the
    // first available one
    const [pickedTime, setPickedTime] = useState<string | null | undefined>(undefined);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [slotDuration, setSlotDuration] = useState<number>(15);
    const [locationSchedules, setLocationSchedules] = useState<LocationScheduleInfo | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [fullyBookedDates, setFullyBookedDates] = useState<Set<string>>(new Set());
    const [maxDate, setMaxDate] = useState<Date | undefined>(undefined);
    const [availabilityLoaded, setAvailabilityLoaded] = useState(false);

    // Reset the form each time it expands, during render rather than in the
    // fetch effect so the stale form never shows
    const formKey = isExpanded && locationId ? `${locationId}:${parcelId}` : null;
    const [resetFor, setResetFor] = useState<string | null>(null);
    if (formKey !== resetFor) {
        setResetFor(formKey);
        if (formKey) {
            setSelectedDate(null);
            setPickedTime(undefined);
            setError(null);
            setFullyBookedDates(new Set());
            setMaxDate(undefined);
            setAvailabilityLoaded(false);
            setIsLoading(true);
        }
    }

    // Fetch location schedules, slot duration, and fully booked dates when expanded
    useEffect(() => {
        if (!isExpanded || !locationId) return;

        let cancelled = false;

        async function fetchLocationData() {
            try {
                const now = new Date();
                const threeMonthsLater = new Date(now);
                threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
                const [schedules, duration, dates] = await Promise.all([
                    getPickupLocationSchedulesAction(locationId),
                    getLocationSlotDurationAction(locationId),
                    getFullyBookedDatesAction(locationId, now, threeMonthsLater, parcelId),
                ]);
                if (!cancelled) {
                    setLocationSchedules(schedules);
                    setSlotDuration(duration);
                    setFullyBookedDates(new Set(dates));
                    setMaxDate(threeMonthsLater);
                    setAvailabilityLoaded(true);
                }
            } catch {
                if (!cancelled) setError(t("reschedule.loadError"));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        fetchLocationData();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- t is not referentially stable, intentionally excluded
    }, [isExpanded, locationId, parcelId]);

    const timeSlots = getRescheduleTimeSlots(selectedDate, locationSchedules, slotDuration, true);
    const availableTimes = timeSlots.slots;
    const selectedTime = pickedTime === undefined ? timeSlots.firstAvailable : pickedTime;
    const shownError = error ?? (timeSlots.errorKey ? t(`reschedule.${timeSlots.errorKey}`) : null);

    const isDateAvailableForPickup = (date: Date): boolean => {
        if (!availabilityLoaded || !locationSchedules) return false;
        if (!isDateAvailable(date, locationSchedules).isAvailable) return false;
        const dateStr = formatDateToYMD(date);
        if (fullyBookedDates.has(dateStr)) return false;
        return true;
    };

    const handleSave = async () => {
        if (!selectedDate || !selectedTime) {
            setError(t("reschedule.requiredFields"));
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            // Use Time provider for proper Stockholm timezone handling
            const baseDate = Time.fromDate(selectedDate).startOfDay();
            const startDateTime = Time.parseTime(selectedTime, baseDate).toUTC();

            // Calculate end time based on slot duration
            const endDateTime = new Date(startDateTime);
            endDateTime.setMinutes(endDateTime.getMinutes() + slotDuration);

            const result = await updateFoodParcelScheduleAction(parcelId, {
                date: selectedDate,
                startTime: startDateTime,
                endTime: endDateTime,
            });

            if (result.success) {
                onSuccess();
            } else {
                if (result.errorCode && isAgreementRequiredCode(result.errorCode)) {
                    window.location.href = "/agreement";
                    return;
                }
                setError(getRescheduleErrorMessage(t, result.errorCode, result.error));
            }
        } catch {
            setError(t("reschedule.genericError"));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Collapse in={isExpanded}>
            <Stack
                gap="sm"
                mt="sm"
                pt="sm"
                style={{ borderTop: "1px solid var(--mantine-color-gray-3)" }}
            >
                {isLoading ? (
                    <Text size="sm" c="dimmed">
                        {t("reschedule.loading")}
                    </Text>
                ) : (
                    <>
                        <DateInput
                            label={t("reschedule.newDate")}
                            placeholder={t("reschedule.selectDate")}
                            value={selectedDate}
                            onChange={value => {
                                setSelectedDate(value ? new Date(value) : null);
                                setPickedTime(undefined);
                                setError(null);
                            }}
                            leftSection={<IconCalendar size="1rem" />}
                            minDate={toStockholmDate(new Date())}
                            maxDate={maxDate}
                            excludeDate={date => !isDateAvailableForPickup(new Date(date))}
                            size="sm"
                        />

                        <Select
                            label={t("reschedule.newTime")}
                            placeholder={t("reschedule.selectTime")}
                            value={selectedTime}
                            onChange={setPickedTime}
                            data={availableTimes}
                            leftSection={<IconClock size="1rem" />}
                            disabled={!selectedDate || availableTimes.length === 0}
                            size="sm"
                        />

                        {shownError && (
                            <Text c="red" size="sm">
                                {shownError}
                            </Text>
                        )}

                        <Group justify="flex-end" gap="xs">
                            <Button variant="default" size="xs" onClick={onCancel}>
                                {t("actions.cancel")}
                            </Button>
                            <Button
                                size="xs"
                                onClick={handleSave}
                                loading={isSubmitting}
                                leftSection={<IconCheck size="0.875rem" />}
                                disabled={!selectedDate || !selectedTime || !!shownError}
                            >
                                {t("actions.save")}
                            </Button>
                        </Group>
                    </>
                )}
            </Stack>
        </Collapse>
    );
}
