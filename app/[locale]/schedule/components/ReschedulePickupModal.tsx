"use client";

import { useState, useEffect } from "react";
import { Modal, Button, Group, Text, Select, Stack, Paper, Box } from "@mantine/core";
import { IconCalendar, IconClock, IconCheck } from "@tabler/icons-react";
import { DateInput } from "@mantine/dates";
import { useTranslations } from "next-intl";
import { FoodParcel, type LocationScheduleInfo } from "../types";
import {
    updateFoodParcelScheduleAction,
    getLocationSlotDurationAction,
    getFullyBookedDatesAction,
} from "../client-actions";
import { TranslationFunction } from "../../types";
import {
    formatStockholmDate,
    formatTime,
    formatDateToYMD,
    toStockholmDate,
} from "@/app/utils/date-utils";
import { isDateAvailable } from "@/app/utils/schedule/location-availability";
import { getRescheduleTimeSlots } from "@/app/utils/schedule/reschedule-time-slots";
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
    // The time the user picked (null if they cleared it); undefined means the
    // first available one
    const [pickedTime, setPickedTime] = useState<string | null | undefined>(undefined);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [slotDuration, setSlotDuration] = useState<number>(15); // Default to 15 minutes
    const [fullyBookedDates, setFullyBookedDates] = useState<Set<string>>(new Set());
    const [maxDate, setMaxDate] = useState<Date | undefined>(undefined);
    const [availabilityLoaded, setAvailabilityLoaded] = useState(false);

    // Derive stable values from foodParcel to avoid re-running effects on object reference changes
    const parcelId = foodParcel?.id;
    const parcelLocationId = foodParcel?.locationId;

    // Reset the form each time the modal opens, during render rather than in
    // the fetch effect so the stale form never shows
    const formKey =
        opened && parcelId && parcelLocationId ? `${parcelLocationId}:${parcelId}` : null;
    const [resetFor, setResetFor] = useState<string | null>(null);
    if (formKey !== resetFor) {
        setResetFor(formKey);
        if (formKey) {
            setSelectedDate(null);
            setPickedTime(undefined);
            setError(null);
            setIsSubmitting(false);
            setFullyBookedDates(new Set());
            setMaxDate(undefined);
            setAvailabilityLoaded(false);
        }
    }

    // Fetch location data when the modal opens
    useEffect(() => {
        if (!opened || !parcelId || !parcelLocationId) return;

        let cancelled = false;

        async function fetchLocationData() {
            const now = new Date();
            const threeMonthsLater = new Date(now);
            threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

            try {
                const [duration, dates] = await Promise.all([
                    getLocationSlotDurationAction(parcelLocationId!),
                    getFullyBookedDatesAction(parcelLocationId!, now, threeMonthsLater, parcelId),
                ]);
                if (cancelled) return;
                setSlotDuration(duration);
                setFullyBookedDates(new Set(dates));
                setMaxDate(threeMonthsLater);
                setAvailabilityLoaded(true);
            } catch {
                if (!cancelled) setError(t("reschedule.loadError"));
            }
        }

        fetchLocationData();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- t is not referentially stable, intentionally excluded
    }, [opened, parcelId, parcelLocationId]);

    const timeSlots = getRescheduleTimeSlots(selectedDate, locationSchedules, slotDuration, true);
    const availableTimes = timeSlots.slots;
    const selectedTime = pickedTime === undefined ? timeSlots.firstAvailable : pickedTime;
    const shownError = error ?? (timeSlots.errorKey ? t(`reschedule.${timeSlots.errorKey}`) : null);

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
        if (!availabilityLoaded || !locationSchedules) return false;
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
                                    setPickedTime(undefined);
                                    setError(null);
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
                                onChange={setPickedTime}
                                data={availableTimes}
                                leftSection={<IconClock size="1rem" />}
                                disabled={!selectedDate || availableTimes.length === 0}
                                required
                            />

                            {shownError && (
                                <Text color="red" size="sm">
                                    {shownError}
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
                            disabled={!selectedDate || !selectedTime || !!shownError}
                        >
                            {t("reschedule.confirm")}
                        </Button>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
