"use client";

import { useState, useEffect } from "react";
import { Modal, Group, Button, Text, Box, Paper } from "@mantine/core";
import { DatePicker, TimeInput } from "@mantine/dates";
import { IconClock, IconCheck, IconArrowBackUp } from "@tabler/icons-react";
import { showNotification } from "@mantine/notifications";
import { FoodParcel, updateFoodParcelSchedule } from "@/app/schedule/actions";
import { isPastTimeSlot, formatStockholmDate } from "@/app/utils/date-utils";

interface ReschedulePickupModalProps {
    opened: boolean;
    onClose: () => void;
    foodParcel: FoodParcel | null;
    onRescheduled: () => void;
}

export default function ReschedulePickupModal({
    opened,
    onClose,
    foodParcel,
    onRescheduled,
}: ReschedulePickupModalProps) {
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [earliestTime, setEarliestTime] = useState("12:00");
    const [latestTime, setLatestTime] = useState("12:30");
    const [timeError, setTimeError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Track if any changes have been made
    const [hasChanges, setHasChanges] = useState(false);

    // Initialize with the food parcel's current date and times when opened
    useEffect(() => {
        if (opened && foodParcel) {
            setSelectedDate(new Date(foodParcel.pickupDate));
            setEarliestTime(formatTime(foodParcel.pickupEarliestTime));
            setLatestTime(formatTime(foodParcel.pickupLatestTime));
            setTimeError(null);
            setHasChanges(false);
        }
    }, [opened, foodParcel]);

    // Check if date or time has changed
    useEffect(() => {
        if (!foodParcel || !selectedDate) {
            setHasChanges(false);
            return;
        }

        const originalDate = new Date(foodParcel.pickupDate);
        const originalDateStr = formatDateForComparison(originalDate);
        const selectedDateStr = formatDateForComparison(selectedDate);

        const originalEarliestTime = formatTime(foodParcel.pickupEarliestTime);
        const originalLatestTime = formatTime(foodParcel.pickupLatestTime);

        // Check if anything has changed
        const dateChanged = originalDateStr !== selectedDateStr;
        const timeChanged =
            originalEarliestTime !== earliestTime || originalLatestTime !== latestTime;

        setHasChanges(dateChanged || timeChanged);
    }, [selectedDate, earliestTime, latestTime, foodParcel]);

    // Format date for comparison (YYYY-MM-DD)
    const formatDateForComparison = (date: Date): string => {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    };

    // Format time to HH:MM format
    const formatTime = (date: Date): string => {
        return date.toLocaleTimeString("sv-SE", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    // Parse time string and create a Date object
    const parseTimeString = (timeStr: string, baseDate: Date): Date => {
        let hours = 0;
        let minutes = 0;

        if (!timeStr) {
            return new Date(baseDate);
        }

        const parts = timeStr.split(":");
        if (parts.length === 2) {
            hours = parseInt(parts[0], 10) || 0;
            minutes = parseInt(parts[1], 10) || 0;
        } else if (timeStr.length === 1 || timeStr.length === 2) {
            hours = parseInt(timeStr, 10) || 0;
            minutes = 0;
        } else if (timeStr.length === 3) {
            hours = parseInt(timeStr.substring(0, 1), 10) || 0;
            minutes = parseInt(timeStr.substring(1), 10) || 0;
        } else if (timeStr.length === 4) {
            hours = parseInt(timeStr.substring(0, 2), 10) || 0;
            minutes = parseInt(timeStr.substring(2), 10) || 0;
        }

        hours = Math.min(Math.max(hours, 0), 23);
        minutes = Math.min(Math.max(minutes, 0), 59);

        const newDate = new Date(baseDate);
        newDate.setHours(hours, minutes, 0, 0);
        return newDate;
    };

    // Format date for display
    const formatDate = (date: Date) => {
        return formatStockholmDate(date, "d MMM yyyy");
    };

    // Validate the times
    const validateTimes = (): boolean => {
        if (!selectedDate) {
            setTimeError("Du måste välja ett datum");
            return false;
        }

        const earliestParts = earliestTime.split(":").map(part => parseInt(part, 10));
        const latestParts = latestTime.split(":").map(part => parseInt(part, 10));

        const earliestDate = new Date(selectedDate);
        earliestDate.setHours(earliestParts[0] || 0, earliestParts[1] || 0, 0, 0);

        const latestDate = new Date(selectedDate);
        latestDate.setHours(latestParts[0] || 0, latestParts[1] || 0, 0, 0);

        if (earliestDate >= latestDate) {
            setTimeError("Tidigast tid måste vara före senast tid");
            return false;
        }

        // Check if time slot is in the past
        if (isPastTimeSlot(selectedDate, earliestTime)) {
            setTimeError("Det går inte att boka matstöd i det förflutna");
            return false;
        }

        setTimeError(null);
        return true;
    };

    // Handle confirmation of rescheduling
    const handleConfirmReschedule = async () => {
        if (!foodParcel || !selectedDate) return;

        if (!validateTimes()) {
            return;
        }

        try {
            setIsSubmitting(true);

            const earliestParts = earliestTime.split(":").map(part => parseInt(part, 10));
            const latestParts = latestTime.split(":").map(part => parseInt(part, 10));

            const startDateTime = new Date(selectedDate);
            startDateTime.setHours(earliestParts[0] || 0, earliestParts[1] || 0, 0, 0);

            const endDateTime = new Date(selectedDate);
            endDateTime.setHours(latestParts[0] || 0, latestParts[1] || 0, 0, 0);

            const result = await updateFoodParcelSchedule(foodParcel.id, {
                date: selectedDate,
                startTime: startDateTime,
                endTime: endDateTime,
            });

            if (result.success) {
                showNotification({
                    title: "Schemaläggning uppdaterad",
                    message: `${foodParcel.householdName} har schemalagts på ny tid.`,
                    color: "green",
                });
                onRescheduled();
                onClose();
            } else {
                showNotification({
                    title: "Fel vid schemaläggning",
                    message: result.error || "Ett oväntat fel inträffade.",
                    color: "red",
                });
            }
        } catch (error) {
            console.error("Error rescheduling pickup:", error);
            showNotification({
                title: "Fel vid schemaläggning",
                message: "Ett oväntat fel inträffade.",
                color: "red",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!foodParcel) {
        return null;
    }

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={`Schemalägg matstöd för ${foodParcel.householdName}`}
            centered
            size="md"
        >
            <Box p="md">
                <Paper withBorder p="md" radius="md" mb="md">
                    <Group justify="space-between" mb="xs">
                        <Text fw={500}>Från:</Text>
                        <Text>
                            {formatDate(foodParcel.pickupDate)},{" "}
                            {formatTime(foodParcel.pickupEarliestTime)} -{" "}
                            {formatTime(foodParcel.pickupLatestTime)}
                        </Text>
                    </Group>
                </Paper>

                <Paper withBorder p="md" radius="md" mb="md">
                    <Group mb="md" align="flex-start">
                        <Text fw={500} style={{ width: "60px" }}>
                            Till:
                        </Text>
                        <Box style={{ flex: 1 }}>
                            <DatePicker
                                value={selectedDate}
                                onChange={setSelectedDate}
                                minDate={new Date()}
                                firstDayOfWeek={1}
                            />
                        </Box>
                    </Group>

                    {timeError && (
                        <Text size="sm" c="red" mb="md">
                            {timeError}
                        </Text>
                    )}

                    <Group align="flex-start" mb="md">
                        <Text fw={500} style={{ width: "60px" }}>
                            &nbsp;
                        </Text>
                        <Group grow style={{ flex: 1 }}>
                            <Box>
                                <Text fw={500} size="sm" mb={5}>
                                    Tidigast hämttid
                                </Text>
                                <TimeInput
                                    value={earliestTime}
                                    onChange={event => setEarliestTime(event.currentTarget.value)}
                                    leftSection={<IconClock size="1rem" />}
                                    error={timeError ? " " : ""}
                                />
                            </Box>
                            <Box>
                                <Text fw={500} size="sm" mb={5}>
                                    Senast hämttid
                                </Text>
                                <TimeInput
                                    value={latestTime}
                                    onChange={event => setLatestTime(event.currentTarget.value)}
                                    leftSection={<IconClock size="1rem" />}
                                    error={timeError ? " " : ""}
                                />
                            </Box>
                        </Group>
                    </Group>
                </Paper>

                <Group justify="flex-end" mt="xl">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        leftSection={<IconArrowBackUp size="1rem" />}
                    >
                        Avbryt
                    </Button>
                    <Button
                        color="blue"
                        onClick={handleConfirmReschedule}
                        loading={isSubmitting}
                        leftSection={<IconCheck size="1rem" />}
                        disabled={!hasChanges} // Disable if no changes were made
                    >
                        Bekräfta ändring
                    </Button>
                </Group>
            </Box>
        </Modal>
    );
}
