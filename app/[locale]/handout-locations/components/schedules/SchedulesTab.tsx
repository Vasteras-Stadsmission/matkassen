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
import { objectsEqual } from "@/app/utils/deep-equal";

interface SchedulesTabProps {
    location: PickupLocationWithAllData;
    onUpdated?: () => void;
    onLocationUpdated?: (id: string, updatedLocation: Partial<PickupLocationWithAllData>) => void;
}

export function SchedulesTab({ location, onUpdated, onLocationUpdated }: SchedulesTabProps) {
    const t = useTranslations("handoutLocations");
    const [schedules, setSchedules] = useState<PickupLocationScheduleWithDays[]>(
        location.schedules || [],
    );
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sync with server state when location changes, but only if schedules actually changed
    // This prevents overwriting optimistic updates when the location object is re-created
    useEffect(() => {
        setSchedules(prevSchedules => {
            // Only update if the schedules array actually changed
            const newSchedules = location.schedules || [];
            if (!objectsEqual(prevSchedules, newSchedules)) {
                return newSchedules;
            }
            return prevSchedules;
        });
    }, [location.schedules]);

    // Handle creating a new schedule
    const handleCreateSchedule = async (scheduleData: ScheduleInput) => {
        setIsLoading(true);
        setError(null);

        try {
            // Call server action first - let server validation catch any issues
            const newSchedule = await createSchedule(location.id, scheduleData);
            // Only update state if server action succeeds
            setSchedules(prev => {
                const updated = [...prev, newSchedule];

                // Update parent component's state optimistically
                if (onLocationUpdated) {
                    onLocationUpdated(location.id, { schedules: updated });
                }

                return updated;
            });

            if (onUpdated) onUpdated();
        } catch (err) {
            console.error("❌ Error creating schedule:", err);
            // Display the specific error message from server validation
            const errorMessage = err instanceof Error ? err.message : t("scheduleCreateError");
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    // Handle updating an existing schedule
    const handleUpdateSchedule = async (id: string, scheduleData: ScheduleInput) => {
        setIsLoading(true);
        setError(null);

        try {
            // Call server action first - let server validation catch any issues
            const updatedSchedule = await updateSchedule(id, scheduleData);
            // Only update state if server action succeeds
            setSchedules(prev => {
                const updated = prev.map(schedule =>
                    schedule.id === id ? updatedSchedule : schedule,
                );

                // Update parent component's state optimistically
                if (onLocationUpdated) {
                    onLocationUpdated(location.id, { schedules: updated });
                }

                return updated;
            });

            if (onUpdated) onUpdated();
        } catch (err) {
            console.error("Error updating schedule:", err);
            // Display the specific error message from server validation
            const errorMessage = err instanceof Error ? err.message : t("scheduleUpdateError");
            setError(errorMessage);
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
            setSchedules(prev => {
                const updated = prev.filter(schedule => schedule.id !== id);

                // Update parent component's state optimistically
                if (onLocationUpdated) {
                    onLocationUpdated(location.id, { schedules: updated });
                }

                return updated;
            });

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
