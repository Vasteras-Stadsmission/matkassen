"use client";

import { useState, useEffect, useRef } from "react";
import { Modal, Button, Group, Text, Select, Stack, Paper, Box } from "@mantine/core";
import { IconCalendar, IconClock, IconCheck } from "@tabler/icons-react";
import { DateInput } from "@mantine/dates";
import { useTranslations } from "next-intl";
import { FoodParcel, type LocationScheduleInfo } from "../types";
import {
    updateFoodParcelScheduleAction,
    getLocationSlotConfigAction,
    getFullyBookedDatesAction,
    getTimeslotCountsAction,
} from "../client-actions";
import { TranslationFunction } from "../../types";
import {
    formatStockholmDate,
    formatTime,
    formatDateToYMD,
    toStockholmDate,
    generateTimeSlotsBetween,
} from "@/app/utils/date-utils";
import {
    isDateAvailable,
    isTimeAvailable,
    getAvailableTimeRange,
} from "@/app/utils/schedule/location-availability";
import {
    getRescheduleErrorMessage,
    isAgreementRequiredCode,
} from "@/app/utils/schedule/reschedule-errors";

interface ReschedulePickupModalProps {
    opened: boolean;
    onClose: () => void;
    foodParcel: FoodParcel | null;
    onRescheduled: () => void;
    locationSchedules: LocationScheduleInfo | null;
}

export default function ReschedulePickupModal({
    opened,
    onClose,
    foodParcel,
    onRescheduled,
    locationSchedules,
}: ReschedulePickupModalProps) {
    // Use a proper type for translations to suppress TypeScript errors
    const t = useTranslations("schedule") as TranslationFunction;

    // State for the form
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedTime, setSelectedTime] = useState<string | null>(null);
    const selectedTimeRef = useRef(selectedTime);
    selectedTimeRef.current = selectedTime;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [availableTimes, setAvailableTimes] = useState<
        { value: string; label: string; disabled: boolean }[]
    >([]);
    const [error, setError] = useState<string | null>(null);
    const [slotDuration, setSlotDuration] = useState<number>(15); // Default to 15 minutes
    const [maxParcelsPerSlot, setMaxParcelsPerSlot] = useState<number | null>(null);
    const [fullyBookedDates, setFullyBookedDates] = useState<Set<string>>(new Set());
    const [maxDate, setMaxDate] = useState<Date | undefined>(undefined);

    // Derive stable values from foodParcel to avoid re-running effects on object reference changes
    const parcelId = foodParcel?.id;
    const parcelLocationId = foodParcel?.locationId;

    // Reset form state and fetch location data when the modal opens
    useEffect(() => {
        if (!opened || !parcelId || !parcelLocationId) return;

        // Reset form state synchronously before fetching
        setSelectedDate(null);
        setSelectedTime(null);
        setError(null);
        setIsSubmitting(false);
        setFullyBookedDates(new Set());
        setMaxDate(undefined);
        setMaxParcelsPerSlot(null);

        let cancelled = false;

        async function fetchLocationData() {
            const now = new Date();
            const threeMonthsLater = new Date(now);
            threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

            const [configResult, datesResult] = await Promise.allSettled([
                getLocationSlotConfigAction(parcelLocationId!),
                getFullyBookedDatesAction(parcelLocationId!, now, threeMonthsLater, parcelId),
            ]);

            if (cancelled) return;

            if (configResult.status === "fulfilled") {
                setSlotDuration(configResult.value.slotDuration);
                setMaxParcelsPerSlot(configResult.value.maxParcelsPerSlot);
            }
            if (datesResult.status === "fulfilled") {
                setFullyBookedDates(new Set(datesResult.value));
                setMaxDate(threeMonthsLater);
            }
        }

        fetchLocationData();

        return () => {
            cancelled = true;
        };
    }, [opened, parcelId, parcelLocationId]);

    // Prepare available time slots based on location schedule and slot capacity
    useEffect(() => {
        if (!selectedDate || !locationSchedules) return;

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

        // Build initial slots from schedule availability
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

        // Fetch actual timeslot counts for the selected date
        if (parcelLocationId) {
            getTimeslotCountsAction(parcelLocationId, selectedDate, parcelId)
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
        } else {
            const firstAvailable = buildSlots({}).find(slot => !slot.disabled);
            if (firstAvailable && !selectedTimeRef.current) {
                setSelectedTime(firstAvailable.value);
            } else if (!firstAvailable) {
                setError(t("reschedule.noTimesAvailable"));
            }
        }

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- t and selectedTime are intentionally excluded
    }, [selectedDate, locationSchedules, slotDuration, maxParcelsPerSlot, parcelLocationId]);

    const handleConfirm = async () => {
        if (!foodParcel || !selectedDate || !selectedTime) {
            setError(t("reschedule.requiredFields"));
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);

            // Parse the selected time
            const [hours, minutes] = selectedTime.split(":").map(Number);

            // Create start time
            const startDateTime = new Date(selectedDate);
            startDateTime.setHours(hours, minutes, 0, 0);

            // Create end time using the location's slot duration
            const endDateTime = new Date(startDateTime);
            endDateTime.setMinutes(endDateTime.getMinutes() + slotDuration);

            const result = await updateFoodParcelScheduleAction(foodParcel.id, {
                date: selectedDate,
                startTime: startDateTime,
                endTime: endDateTime,
            });

            if (result.success) {
                onRescheduled();
                onClose();
            } else {
                if (result.errorCode && isAgreementRequiredCode(result.errorCode)) {
                    window.location.href = "/agreement";
                    return;
                }
                setError(getRescheduleErrorMessage(t, result.errorCode, result.error));
            }
        } catch {
            // Error boundary will handle critical errors
            setError(t("reschedule.genericError"));
        } finally {
            setIsSubmitting(false);
        }
    };

    // Check if a date is available according to the location schedule and capacity
    const isDateAvailableForPickup = (date: Date): boolean => {
        if (!locationSchedules) return true; // If no schedule info, assume available
        if (!isDateAvailable(date, locationSchedules).isAvailable) return false;

        // Check if the date is fully booked (daily capacity reached)
        const dateStr = formatDateToYMD(date);
        if (fullyBookedDates.has(dateStr)) return false;

        return true;
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={t("reschedule.modalTitle")}
            centered
            size="md"
        >
            {foodParcel && (
                <Stack>
                    <Paper withBorder p="md" radius="md">
                        <Text fw={600} mb="sm">
                            {t("reschedule.currentPickup")}
                        </Text>
                        <Group justify="space-between">
                            <Text>{t("reschedule.date")}:</Text>
                            <Text>{formatStockholmDate(foodParcel.pickupDate, "PPP")}</Text>
                        </Group>
                        <Group justify="space-between">
                            <Text>{t("reschedule.time")}:</Text>
                            <Text>
                                {formatTime(foodParcel.pickupEarliestTime)} -{" "}
                                {formatTime(foodParcel.pickupLatestTime)}
                            </Text>
                        </Group>
                    </Paper>

                    <Box>
                        <Text fw={600} mb="sm">
                            {t("reschedule.newPickup")}
                        </Text>

                        <Stack gap="md">
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
                                required
                            />

                            <Select
                                label={t("reschedule.newTime")}
                                placeholder={t("reschedule.selectTime")}
                                value={selectedTime}
                                onChange={setSelectedTime}
                                data={availableTimes}
                                leftSection={<IconClock size="1rem" />}
                                disabled={!selectedDate || availableTimes.length === 0}
                                required
                            />

                            {error && (
                                <Text color="red" size="sm">
                                    {error}
                                </Text>
                            )}
                        </Stack>
                    </Box>

                    <Group justify="flex-end" mt="md">
                        <Button variant="outline" onClick={onClose}>
                            {t("reschedule.cancel")}
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            loading={isSubmitting}
                            leftSection={<IconCheck size="1rem" />}
                            disabled={!selectedDate || !selectedTime || !!error}
                        >
                            {t("reschedule.confirm")}
                        </Button>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
