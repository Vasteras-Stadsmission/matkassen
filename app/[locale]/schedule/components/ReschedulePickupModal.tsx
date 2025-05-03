"use client";

import { useState, useEffect } from "react";
import { Modal, Group, Button, Text, Box, Paper } from "@mantine/core";
import { DatePicker, TimeInput } from "@mantine/dates";
import { IconClock, IconCheck, IconArrowBackUp } from "@tabler/icons-react";
import { showNotification } from "@mantine/notifications";
import { FoodParcel, updateFoodParcelSchedule } from "@/app/[locale]/schedule/actions";
import { isPastTimeSlot, formatStockholmDate } from "@/app/utils/date-utils";
import { useTranslations } from "next-intl";

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
    const t = useTranslations("schedule.reschedule");
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

    // Format date for display
    const formatDate = (date: Date) => {
        return formatStockholmDate(date, "d MMM yyyy");
    };

    // Validate the times
    const validateTimes = (): boolean => {
        if (!selectedDate) {
            setTimeError(t("selectDateError"));
            return false;
        }

        const earliestParts = earliestTime.split(":").map(part => parseInt(part, 10));
        const latestParts = latestTime.split(":").map(part => parseInt(part, 10));

        const earliestDate = new Date(selectedDate);
        earliestDate.setHours(earliestParts[0] || 0, earliestParts[1] || 0, 0, 0);

        const latestDate = new Date(selectedDate);
        latestDate.setHours(latestParts[0] || 0, latestParts[1] || 0, 0, 0);

        if (earliestDate >= latestDate) {
            setTimeError(t("timeError"));
            return false;
        }

        // Check if time slot is in the past
        if (isPastTimeSlot(selectedDate, earliestTime)) {
            setTimeError(t("pastError"));
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
                    title: t("success"),
                    message: t("successMessage", {
                        name: foodParcel.householdName,
                    }),
                    color: "green",
                });
                onRescheduled();
                onClose();
            } else {
                showNotification({
                    title: t("error"),
                    message: result.error || t("genericError"),
                    color: "red",
                });
            }
        } catch (error) {
            console.error("Error rescheduling pickup:", error);
            showNotification({
                title: t("error"),
                message: t("genericError"),
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
            title={t("title", {
                name: foodParcel.householdName,
            })}
            centered
            size="md"
        >
            <Box p="md">
                <Paper withBorder p="md" radius="md" mb="md">
                    <Group justify="space-between" mb="xs">
                        <Text fw={500}>{t("from")}</Text>
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
                            {t("to2")}
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
                                    {t("earliestTime")}
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
                                    {t("latestTime")}
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
                        {t("cancel")}
                    </Button>
                    <Button
                        color="blue"
                        onClick={handleConfirmReschedule}
                        loading={isSubmitting}
                        leftSection={<IconCheck size="1rem" />}
                        disabled={!hasChanges} // Disable if no changes were made
                    >
                        {t("confirm")}
                    </Button>
                </Group>
            </Box>
        </Modal>
    );
}
