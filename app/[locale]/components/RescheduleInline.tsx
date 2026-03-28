"use client";

import { useState, useEffect, useRef } from "react";
import { Button, Group, Text, Select, Stack, Collapse } from "@mantine/core";
import { IconCalendar, IconClock, IconCheck } from "@tabler/icons-react";
import { DateInput } from "@mantine/dates";
import { useTranslations } from "next-intl";
import { TranslationFunction } from "@/app/[locale]/types";
import {
    updateFoodParcelScheduleAction,
    getPickupLocationSchedulesAction,
    getLocationSlotConfigAction,
    getFullyBookedDatesAction,
    getTimeslotCountsAction,
} from "@/app/[locale]/schedule/client-actions";
import type { LocationScheduleInfo } from "@/app/[locale]/schedule/types";
import { toStockholmDate, formatDateToYMD, generateTimeSlotsBetween } from "@/app/utils/date-utils";
import {
    isDateAvailable,
    isTimeAvailable,
    getAvailableTimeRange,
} from "@/app/utils/schedule/location-availability";
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
    const [selectedTime, setSelectedTime] = useState<string | null>(null);
    const selectedTimeRef = useRef(selectedTime);
    selectedTimeRef.current = selectedTime;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [availableTimes, setAvailableTimes] = useState<
        { value: string; label: string; disabled: boolean }[]
    >([]);
    const [error, setError] = useState<string | null>(null);
    const [slotDuration, setSlotDuration] = useState<number>(15);
    const [maxParcelsPerSlot, setMaxParcelsPerSlot] = useState<number | null>(null);
    const [locationSchedules, setLocationSchedules] = useState<LocationScheduleInfo | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [fullyBookedDates, setFullyBookedDates] = useState<Set<string>>(new Set());
    const [maxDate, setMaxDate] = useState<Date | undefined>(undefined);

    // Fetch location schedules, slot duration, and fully booked dates when expanded
    useEffect(() => {
        if (!isExpanded || !locationId) return;

        // Reset form state
        setSelectedDate(null);
        setSelectedTime(null);
        setError(null);
        setFullyBookedDates(new Set());
        setMaxDate(undefined);
        setMaxParcelsPerSlot(null);

        let cancelled = false;

        async function fetchLocationData() {
            setIsLoading(true);
            try {
                const [schedules, config] = await Promise.all([
                    getPickupLocationSchedulesAction(locationId),
                    getLocationSlotConfigAction(locationId),
                ]);
                if (!cancelled) {
                    setLocationSchedules(schedules);
                    setSlotDuration(config.slotDuration);
                    setMaxParcelsPerSlot(config.maxParcelsPerSlot);
                }
            } catch {
                if (!cancelled) setError(t("reschedule.loadError"));
            }

            try {
                const now = new Date();
                const threeMonthsLater = new Date(now);
                threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
                const dates = await getFullyBookedDatesAction(
                    locationId,
                    now,
                    threeMonthsLater,
                    parcelId,
                );
                if (!cancelled) {
                    setFullyBookedDates(new Set(dates));
                    setMaxDate(threeMonthsLater);
                }
            } catch {
                // On error, don't block any dates
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

    // Update available times when date changes, including slot capacity checks
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

        // Align start time to the slot grid (ceil to nearest slot boundary from midnight)
        // This ensures picker slots match server-side slot rounding without going before opening
        const [eh, em] = timeRange.earliestTime.split(":").map(Number);
        const totalAligned = eh * 60 + Math.ceil(em / slotDuration) * slotDuration;
        const alignedH = Math.floor(totalAligned / 60);
        const alignedM = totalAligned % 60;
        const alignedStart = `${String(alignedH).padStart(2, "0")}:${String(alignedM).padStart(2, "0")}`;

        const allTimes = generateTimeSlotsBetween(
            alignedStart,
            timeRange.latestTime,
            slotDuration,
            true,
        );

        const buildSlots = (counts: Record<string, number>) =>
            allTimes.map(timeString => {
                const timeAvailability = isTimeAvailable(
                    selectedDate,
                    timeString,
                    locationSchedules,
                );
                const slotCount = counts[timeString] || 0;
                const slotFull = maxParcelsPerSlot !== null && slotCount >= maxParcelsPerSlot;
                return {
                    value: timeString,
                    label: slotFull ? `${timeString} (${t("reschedule.full")})` : timeString,
                    disabled: !timeAvailability.isAvailable || slotFull,
                };
            });

        // Set slots immediately with schedule-only data (empty counts), then refine with capacity data
        setAvailableTimes(buildSlots({}));

        let cancelled = false;

        getTimeslotCountsAction(locationId, selectedDate, parcelId)
            .then(counts => {
                if (!cancelled) {
                    const slots = buildSlots(counts);
                    setAvailableTimes(slots);

                    const firstAvailable = slots.find(slot => !slot.disabled);
                    if (firstAvailable && !selectedTimeRef.current) {
                        setSelectedTime(firstAvailable.value);
                    } else if (!firstAvailable) {
                        setError(t("reschedule.noTimesAvailable"));
                    }
                }
            })
            .catch(() => {
                // On error, keep schedule-only slots without capacity data
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- t and selectedTime are intentionally excluded
    }, [selectedDate, locationSchedules, slotDuration, maxParcelsPerSlot, locationId]);

    const isDateAvailableForPickup = (date: Date): boolean => {
        if (!locationSchedules) return true;
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
                                setSelectedTime(null);
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
