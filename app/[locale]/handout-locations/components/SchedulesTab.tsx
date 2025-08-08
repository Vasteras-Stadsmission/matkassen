"use client";

import { useState, useEffect, useMemo } from "react";
import { Paper, Text, Stack, Group, Loader } from "@mantine/core";
import { useTranslations } from "next-intl";
import { PickupLocationWithAllData, ScheduleInput } from "../types";
import { SchedulesList } from "./schedules/SchedulesList";
import { createSchedule, updateSchedule, deleteSchedule } from "../actions";
import { notifications } from "@mantine/notifications";

interface SchedulesTabProps {
    location: PickupLocationWithAllData;
    onUpdated?: () => void;
}

export function SchedulesTab({ location, onUpdated }: SchedulesTabProps) {
    const t = useTranslations("handoutLocations");
    const [schedules, setSchedules] = useState<PickupLocationWithAllData["schedules"]>(
        location.schedules || [],
    );
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Memoize location schedules to prevent unnecessary effect runs
    const locationSchedules = useMemo(() => location.schedules || [], [location.schedules]);

    // Update schedules when location.schedules actually changes (not just when location object changes)
    useEffect(() => {
        setSchedules(locationSchedules);
    }, [locationSchedules]);

    // Handle creating a new schedule
    const handleCreateSchedule = async (scheduleData: ScheduleInput) => {
        setIsLoading(true);
        setError(null);

        try {
            const newSchedule = await createSchedule(location.id, scheduleData);
            setSchedules(prevSchedules => [...prevSchedules, newSchedule]);
            onUpdated?.();
        } catch (err) {
            setError(t("scheduleCreateError"));
            notifications.show({
                title: t("errorSaving"),
                message: t("scheduleCreateError"),
                color: "red",
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Handle updating an existing schedule
    const handleUpdateSchedule = async (scheduleId: string, scheduleData: ScheduleInput) => {
        setIsLoading(true);
        setError(null);

        try {
            const updatedSchedule = await updateSchedule(scheduleId, scheduleData);
            setSchedules(prevSchedules =>
                prevSchedules.map(s => (s.id === scheduleId ? updatedSchedule : s)),
            );
            onUpdated?.();
        } catch (err) {
            setError(t("scheduleUpdateError"));
            notifications.show({
                title: t("errorSaving"),
                message: t("scheduleUpdateError"),
                color: "red",
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Handle deleting a schedule
    const handleDeleteSchedule = async (scheduleId: string) => {
        // Set loading state
        setIsLoading(true);
        setError(null);

        try {
            // Call the delete API
            await deleteSchedule(scheduleId);

            setSchedules(prevSchedules => prevSchedules.filter(s => s.id !== scheduleId));

            // Call the onUpdated callback if provided
            onUpdated?.();

            // Show success notification
            notifications.show({
                title: t("locationDeleted"), // Using existing key for deletion success
                message: t("scheduleDeleteError"), // Using the error message key without parameters
                color: "green",
            });
        } catch (err) {
            setError(t("scheduleDeleteError"));
            notifications.show({
                title: t("errorDeleting"),
                message: t("scheduleDeleteError"),
                color: "red",
            });
        } finally {
            // Always reset loading state when operation completes
            setIsLoading(false);
        }
    };

    return (
        <Stack gap="lg">
            {/* Show SchedulesList first, so it's always visible */}
            <SchedulesList
                schedules={schedules}
                onCreateSchedule={handleCreateSchedule}
                onUpdateSchedule={handleUpdateSchedule}
                onDeleteSchedule={handleDeleteSchedule}
            />

            {/* Show error if any */}
            {error && (
                <Paper p="md" withBorder bg="red.0">
                    <Text c="red">{error}</Text>
                </Paper>
            )}

            {/* Loading indicator at the bottom */}
            {isLoading && (
                <Group justify="center" py="md">
                    <Loader size="sm" />
                </Group>
            )}
        </Stack>
    );
}
