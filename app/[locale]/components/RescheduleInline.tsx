"use client";

import { useState, useEffect } from "react";
import { Button, Group, Text, Select, Stack, Collapse } from "@mantine/core";
import { IconCalendar, IconClock, IconCheck } from "@tabler/icons-react";
import { DateInput } from "@mantine/dates";
import { useTranslations } from "next-intl";
import {
    updateFoodParcelScheduleAction,
    getPickupLocationSchedulesAction,
    getLocationSlotDurationAction,
} from "@/app/[locale]/schedule/client-actions";
import type { LocationScheduleInfo } from "@/app/[locale]/schedule/types";
import { toStockholmDate, generateTimeSlotsBetween } from "@/app/utils/date-utils";
import {
    isDateAvailable,
    isTimeAvailable,
    getAvailableTimeRange,
} from "@/app/utils/schedule/location-availability";
import { Time } from "@/app/utils/time-provider";

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
    const t = useTranslations("issues");

    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedTime, setSelectedTime] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [availableTimes, setAvailableTimes] = useState<
        { value: string; label: string; disabled: boolean }[]
    >([]);
    const [error, setError] = useState<string | null>(null);
    const [slotDuration, setSlotDuration] = useState<number>(15);
    const [locationSchedules, setLocationSchedules] = useState<LocationScheduleInfo | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch location schedules and slot duration when expanded
    useEffect(() => {
        async function fetchLocationData() {
            if (!isExpanded || !locationId) return;

            setIsLoading(true);
            try {
                const [schedules, duration] = await Promise.all([
                    getPickupLocationSchedulesAction(locationId),
                    getLocationSlotDurationAction(locationId),
                ]);
                setLocationSchedules(schedules);
                setSlotDuration(duration);
            } catch {
                setError(t("reschedule.loadError"));
            } finally {
                setIsLoading(false);
            }
        }

        if (isExpanded) {
            // Reset form state
            setSelectedDate(null);
            setSelectedTime(null);
            setError(null);
            fetchLocationData();
        }
    }, [isExpanded, locationId, t]);

    // Update available times when date changes
    useEffect(() => {
        if (!selectedDate || !locationSchedules) {
            setAvailableTimes([]);
            return;
        }

        const dateAvailability = isDateAvailable(selectedDate, locationSchedules);

        if (!dateAvailability.isAvailable) {
            setError(t("reschedule.dateUnavailable"));
            setAvailableTimes([]);
            return;
        }

        const timeRange = getAvailableTimeRange(selectedDate, locationSchedules);

        if (!timeRange.earliestTime || !timeRange.latestTime) {
            setError(t("reschedule.noTimesAvailable"));
            setAvailableTimes([]);
            return;
        }

        setError(null);

        const allTimes = generateTimeSlotsBetween(
            timeRange.earliestTime,
            timeRange.latestTime,
            slotDuration,
            true,
        );

        const slots = allTimes.map(timeString => {
            const timeAvailability = isTimeAvailable(selectedDate, timeString, locationSchedules);
            return {
                value: timeString,
                label: timeString,
                disabled: !timeAvailability.isAvailable,
            };
        });

        setAvailableTimes(slots);

        // Auto-select first available time
        const firstAvailable = slots.find(slot => !slot.disabled);
        if (firstAvailable && !selectedTime) {
            setSelectedTime(firstAvailable.value);
        } else if (!firstAvailable) {
            setError(t("reschedule.noTimesAvailable"));
        }
    }, [selectedDate, locationSchedules, slotDuration, selectedTime, t]);

    const isDateAvailableForPickup = (date: Date): boolean => {
        if (!locationSchedules) return true;
        return isDateAvailable(date, locationSchedules).isAvailable;
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
                setError(result.error || t("reschedule.genericError"));
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
                                setSelectedTime(null);
                            }}
                            leftSection={<IconCalendar size="1rem" />}
                            minDate={toStockholmDate(new Date())}
                            excludeDate={date => !isDateAvailableForPickup(new Date(date))}
                            size="sm"
                        />

                        <Select
                            label={t("reschedule.newTime")}
                            placeholder={t("reschedule.selectTime")}
                            value={selectedTime}
                            onChange={setSelectedTime}
                            data={availableTimes}
                            leftSection={<IconClock size="1rem" />}
                            disabled={!selectedDate || availableTimes.length === 0}
                            size="sm"
                        />

                        {error && (
                            <Text c="red" size="sm">
                                {error}
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
                                disabled={!selectedDate || !selectedTime || !!error}
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
