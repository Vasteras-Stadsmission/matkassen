"use client";

import { useState, useEffect } from "react";
import { Modal, Button, Group, Text, Select, Stack, Paper, Box } from "@mantine/core";
import { IconCalendar, IconClock, IconCheck } from "@tabler/icons-react";
import { DateInput } from "@mantine/dates";
import { useTranslations } from "next-intl";
import { FoodParcel, type LocationScheduleInfo } from "../actions";
import { updateFoodParcelScheduleAction, getLocationSlotDurationAction } from "../client-actions";
import { TranslationFunction } from "../../types";
import { formatStockholmDate, formatTime, toStockholmDate } from "@/app/utils/date-utils";
import {
    isDateAvailable,
    isTimeAvailable,
    getAvailableTimeRange,
} from "@/app/utils/schedule/location-availability";

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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [availableTimes, setAvailableTimes] = useState<
        { value: string; label: string; disabled: boolean }[]
    >([]);
    const [error, setError] = useState<string | null>(null);
    const [slotDuration, setSlotDuration] = useState<number>(15); // Default to 15 minutes

    // Fetch the slot duration when the modal opens with a food parcel
    useEffect(() => {
        async function fetchSlotDuration() {
            if (foodParcel && foodParcel.locationId) {
                try {
                    // Use the client action to call the server action
                    const duration = await getLocationSlotDurationAction(foodParcel.locationId);
                    setSlotDuration(duration);
                } catch (error) {
                    console.error("Error fetching slot duration:", error);
                }
            }
        }

        if (opened && foodParcel) {
            fetchSlotDuration();
        }
    }, [opened, foodParcel]);

    // Prepare available time slots based on location schedule
    useEffect(() => {
        if (selectedDate && locationSchedules) {
            // Get the available time range for the selected date
            const dateAvailability = isDateAvailable(selectedDate, locationSchedules);

            if (!dateAvailability.isAvailable) {
                setError(t("reschedule.dateUnavailable"));
                setAvailableTimes([]);
                return;
            }

            // Get the specific time range for this date
            const timeRange = getAvailableTimeRange(selectedDate, locationSchedules);

            if (!timeRange.earliestTime || !timeRange.latestTime) {
                setError(t("reschedule.noTimesAvailable"));
                setAvailableTimes([]);
                return;
            }

            // Clear any previous errors
            setError(null);

            // Generate time slots from opening to closing time
            const slots: { value: string; label: string; disabled: boolean }[] = [];

            // Parse opening and closing times
            const [openHour, openMinute] = timeRange.earliestTime.split(":").map(Number);
            const [closeHour, closeMinute] = timeRange.latestTime.split(":").map(Number);

            // Start from exact opening time
            let currentHour = openHour;
            let currentMinute = openMinute;

            // Calculate the end time in minutes for comparison
            const closeTimeInMinutes = closeHour * 60 + closeMinute;

            // Generate all possible slots during open hours using the location's slot duration
            while (
                currentHour < closeHour ||
                (currentHour === closeHour && currentMinute < closeMinute)
            ) {
                const timeString = `${currentHour.toString().padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;

                // Check if a slot starting at this time would end before or at closing time
                const slotEndMinutes = currentHour * 60 + currentMinute + slotDuration;
                if (slotEndMinutes <= closeTimeInMinutes) {
                    // Check if this specific time is available
                    const timeAvailability = isTimeAvailable(
                        selectedDate,
                        timeString,
                        locationSchedules,
                    );

                    slots.push({
                        value: timeString,
                        label: timeString,
                        disabled: !timeAvailability.isAvailable,
                    });
                }

                // Advance to next time slot using the configured duration
                currentMinute += slotDuration;
                if (currentMinute >= 60) {
                    currentHour += Math.floor(currentMinute / 60);
                    currentMinute = currentMinute % 60;
                }
            }

            setAvailableTimes(slots);

            // Auto-select the first available time if there are any
            const firstAvailable = slots.find(slot => !slot.disabled);
            if (firstAvailable && !selectedTime) {
                setSelectedTime(firstAvailable.value);
            } else if (!firstAvailable) {
                setError(t("reschedule.noTimesAvailable"));
            }
        }
    }, [selectedDate, locationSchedules, t, selectedTime, slotDuration]);

    // Reset form when modal opens or parcel changes
    useEffect(() => {
        if (opened && foodParcel) {
            // Reset form state
            setSelectedDate(null);
            setSelectedTime(null);
            setError(null);
            setIsSubmitting(false);
        }
    }, [opened, foodParcel]);

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
                setError(result.error || t("reschedule.genericError"));
            }
        } catch (error) {
            console.error("Error rescheduling pickup:", error);
            setError(t("reschedule.genericError"));
        } finally {
            setIsSubmitting(false);
        }
    };

    // Check if a date is available according to the location schedule
    const isDateAvailableForPickup = (date: Date): boolean => {
        if (!locationSchedules) return true; // If no schedule info, assume available
        return isDateAvailable(date, locationSchedules).isAvailable;
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
                                onChange={setSelectedDate}
                                leftSection={<IconCalendar size="1rem" />}
                                minDate={toStockholmDate(new Date())}
                                excludeDate={date => !isDateAvailableForPickup(date)}
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
