"use client";

import { useState, useEffect } from "react";
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

    // Update schedules when location changes
    useEffect(() => {
        setSchedules(location.schedules || []);
    }, [location]);

    // Handle creating a new schedule
    const handleCreateSchedule = async (scheduleData: ScheduleInput) => {
        setIsLoading(true);
        setError(null);

        try {
            const newSchedule = await createSchedule(location.id, scheduleData);
            setSchedules(prevSchedules => [...prevSchedules, newSchedule]);
            if (onUpdated) onUpdated();
        } catch (err) {
            console.error("Error creating schedule:", err);
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
            if (onUpdated) onUpdated();
        } catch (err) {
            console.error("Error updating schedule:", err);
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
        setIsLoading(true);
        setError(null);

        try {
            await deleteSchedule(scheduleId);
            setSchedules(prevSchedules => prevSchedules.filter(s => s.id !== scheduleId));
            if (onUpdated) onUpdated();
        } catch (err) {
            console.error("Error deleting schedule:", err);
            setError(t("scheduleDeleteError"));
            notifications.show({
                title: t("errorDeleting"),
                message: t("scheduleDeleteError"),
                color: "red",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Stack gap="lg">
            {/* <Text size="sm">{t("configureEachWeekday")}</Text> */}

            {isLoading && (
                <Group justify="center" py="md">
                    <Loader size="sm" />
                </Group>
            )}

            {error && (
                <Paper p="md" withBorder bg="red.0">
                    <Text c="red">{error}</Text>
                </Paper>
            )}

            <SchedulesList
                schedules={schedules}
                onCreateSchedule={handleCreateSchedule}
                onUpdateSchedule={handleUpdateSchedule}
                onDeleteSchedule={handleDeleteSchedule}
            />
        </Stack>
    );
}
