"use client";

import { useState, useEffect } from "react";
import { Modal, Button, Group, Select, Stack, Alert } from "@mantine/core";
import { IconCalendar, IconClock, IconCheck, IconAlertTriangle } from "@tabler/icons-react";
import { DateInput } from "@mantine/dates";
import { useTranslations } from "next-intl";
import { type LocationScheduleInfo } from "../types";
import { bulkRescheduleParcelsAction, getLocationSlotDurationAction } from "../client-actions";
import { TranslationFunction } from "../../types";
import { toStockholmDate } from "@/app/utils/date-utils";
import { isDateAvailable } from "@/app/utils/schedule/location-availability";
import { getRescheduleTimeSlots } from "@/app/utils/schedule/reschedule-time-slots";
import { showNotification } from "@mantine/notifications";

interface BulkRescheduleModalProps {
    opened: boolean;
    onClose: () => void;
    parcelIds: string[];
    locationId: string;
    locationSchedules: LocationScheduleInfo | null;
    onSuccess: () => void;
}

export default function BulkRescheduleModal({
    opened,
    onClose,
    parcelIds,
    locationId,
    locationSchedules,
    onSuccess,
}: BulkRescheduleModalProps) {
    const t = useTranslations("schedule") as TranslationFunction;

    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    // The time the user picked (null if they cleared it); undefined means the
    // first available one
    const [pickedTime, setPickedTime] = useState<string | null | undefined>(undefined);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [slotDuration, setSlotDuration] = useState<number>(15);

    // Reset the form each time the modal opens
    const [wasOpened, setWasOpened] = useState(opened);
    if (opened !== wasOpened) {
        setWasOpened(opened);
        if (opened) {
            setSelectedDate(null);
            setPickedTime(undefined);
            setError(null);
            setIsSubmitting(false);
        }
    }

    // Fetch slot duration when modal opens
    useEffect(() => {
        async function fetchSlotDuration() {
            if (locationId) {
                try {
                    const duration = await getLocationSlotDurationAction(locationId);
                    setSlotDuration(duration);
                } catch {
                    // Use default
                }
            }
        }

        if (opened) {
            fetchSlotDuration();
        }
    }, [opened, locationId]);

    const timeSlots = getRescheduleTimeSlots(selectedDate, locationSchedules, slotDuration, false);
    const availableTimes = timeSlots.slots;
    const selectedTime = pickedTime === undefined ? timeSlots.firstAvailable : pickedTime;
    const shownError = error ?? (timeSlots.errorKey ? t(`reschedule.${timeSlots.errorKey}`) : null);

    const handleConfirm = async () => {
        if (!selectedDate || !selectedTime) {
            setError(t("reschedule.requiredFields"));
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);

            const [hours, minutes] = selectedTime.split(":").map(Number);
            const startDateTime = new Date(selectedDate);
            startDateTime.setHours(hours, minutes, 0, 0);

            const result = await bulkRescheduleParcelsAction(parcelIds, {
                startTime: startDateTime,
            });

            if (result.success) {
                showNotification({
                    title: t("outsideHours.bulkRescheduleTitle", { count: parcelIds.length }),
                    message: t("outsideHours.bulkRescheduleSuccess", {
                        count: result.count ?? parcelIds.length,
                    }),
                    color: "green",
                    icon: <IconCheck size={16} />,
                });
                onSuccess();
                onClose();
            } else {
                setError(result.error || t("reschedule.genericError"));
            }
        } catch {
            setError(t("reschedule.genericError"));
        } finally {
            setIsSubmitting(false);
        }
    };

    const isDateAvailableForPickup = (date: Date): boolean => {
        if (!locationSchedules) return true;
        return isDateAvailable(date, locationSchedules).isAvailable;
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={t("outsideHours.bulkRescheduleTitle", { count: parcelIds.length })}
            centered
            size="md"
        >
            <Stack>
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
                    <Alert color="red" icon={<IconAlertTriangle size={16} />}>
                        {shownError}
                    </Alert>
                )}

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
                        {t("outsideHours.bulkRescheduleConfirm")}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
