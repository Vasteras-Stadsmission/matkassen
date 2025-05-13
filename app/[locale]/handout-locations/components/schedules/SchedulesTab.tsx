"use client";

import { useState, useEffect } from "react";
import { Stack, LoadingOverlay, Paper, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import {
    PickupLocationWithAllData,
    ScheduleInput,
    PickupLocationScheduleWithDays,
} from "../../types";
import { SchedulesList } from "./SchedulesList";
import { createSchedule, updateSchedule, deleteSchedule } from "../../actions";

interface SchedulesTabProps {
    location: PickupLocationWithAllData;
    onUpdated?: () => void;
}

export function SchedulesTab({ location, onUpdated }: SchedulesTabProps) {
    const t = useTranslations("handoutLocations");
    const [schedules, setSchedules] = useState<PickupLocationScheduleWithDays[]>(
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
        } finally {
            setIsLoading(false);
        }
    };

    // Handle updating an existing schedule
    const handleUpdateSchedule = async (id: string, scheduleData: ScheduleInput) => {
        setIsLoading(true);
        setError(null);

        try {
            const updatedSchedule = await updateSchedule(id, scheduleData);
            setSchedules(prevSchedules =>
                prevSchedules.map(schedule => (schedule.id === id ? updatedSchedule : schedule)),
            );
            if (onUpdated) onUpdated();
        } catch (err) {
            console.error("Error updating schedule:", err);
            setError(t("scheduleUpdateError"));
        } finally {
            setIsLoading(false);
        }
    };

    // Handle deleting a schedule
    const handleDeleteSchedule = async (id: string) => {
        setIsLoading(true);
        setError(null);

        try {
            await deleteSchedule(id);
            setSchedules(prevSchedules => prevSchedules.filter(schedule => schedule.id !== id));
            if (onUpdated) onUpdated();
        } catch (err) {
            console.error("Error deleting schedule:", err);
            setError(t("scheduleDeleteError"));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Stack pos="relative">
            <LoadingOverlay visible={isLoading} />

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
