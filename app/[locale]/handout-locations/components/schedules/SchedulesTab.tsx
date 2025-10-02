"use client";

import { useState, useEffect } from "react";
import { Stack, Paper, Text, LoadingOverlay } from "@mantine/core";
import { useTranslations } from "next-intl";
import { notifications } from "@mantine/notifications";
import type { ActionResult } from "@/app/utils/auth/action-result";
import {
    PickupLocationWithAllData,
    ScheduleInput,
    PickupLocationScheduleWithDays,
} from "../../types";
import { createSchedule, updateSchedule, deleteSchedule } from "../../actions";
import { SchedulesList } from "./SchedulesList";
import { objectsEqual } from "../../../../utils/deep-equal";

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

    // Helper function to handle common operation pattern: loading state, server action, state update, and callbacks
    const handleScheduleOperation = async <T,>(
        operation: () => Promise<ActionResult<T>>,
        updateSchedules: (
            result: T,
            prev: PickupLocationScheduleWithDays[],
        ) => PickupLocationScheduleWithDays[],
        errorMessageKey: string,
        operationType?: "create" | "update" | "delete",
    ) => {
        setIsLoading(true);
        setError(null);

        try {
            const actionResult = await operation();

            if (!actionResult.success) {
                throw new Error(actionResult.error.message);
            }

            const result = actionResult.data;

            // Compute next schedules from current state outside of render phase
            const nextSchedules = updateSchedules(result, schedules);

            // Update local state
            setSchedules(nextSchedules);

            // Notify parent AFTER local state update scheduling to avoid setState during render warnings
            if (onLocationUpdated) {
                onLocationUpdated(location.id, { schedules: nextSchedules });
            }

            if (onUpdated) onUpdated();

            // Dispatch refresh event for deletions to update navbar badge
            if (operationType === "delete") {
                window.dispatchEvent(new CustomEvent("refreshOutsideHoursCount"));
            }

            // Dispatch event to refresh schedule grid
            window.dispatchEvent(new CustomEvent("refreshScheduleGrid"));

            // Show success notifications for all operations
            if (operationType === "create") {
                notifications.show({
                    title: t("locationCreated"), // Reuse existing key
                    message: "Schedule created successfully", // Simple message
                    color: "green",
                });
            } else if (operationType === "update") {
                notifications.show({
                    title: t("locationUpdated"), // Reuse existing key
                    message: "Schedule updated successfully", // Simple message
                    color: "green",
                });
            } else if (operationType === "delete") {
                notifications.show({
                    title: t("locationDeleted"), // Reuse existing key
                    message: "Schedule deleted successfully", // Simple message
                    color: "green",
                });
            }
        } catch (err) {
            console.error(`Error in schedule operation:`, err);
            const errorMessage =
                err instanceof Error
                    ? err.message
                    : errorMessageKey === "scheduleCreateError" ||
                        errorMessageKey === "scheduleUpdateError" ||
                        errorMessageKey === "scheduleDeleteError"
                      ? t(errorMessageKey)
                      : t("scheduleCreateError");
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateSchedule = async (scheduleData: ScheduleInput) => {
        await handleScheduleOperation(
            () => createSchedule(location.id, scheduleData),
            (newSchedule, prev) => [...prev, newSchedule],
            "scheduleCreateError",
            "create",
        );
    };

    const handleUpdateSchedule = async (id: string, scheduleData: ScheduleInput) => {
        await handleScheduleOperation(
            () => updateSchedule(id, scheduleData),
            (updatedSchedule, prev) =>
                prev.map(schedule => (schedule.id === id ? updatedSchedule : schedule)),
            "scheduleUpdateError",
            "update",
        );
    };

    const handleDeleteSchedule = async (id: string) => {
        await handleScheduleOperation(
            () => deleteSchedule(id),
            (_, prev) => prev.filter(schedule => schedule.id !== id),
            "scheduleDeleteError",
            "delete",
        );
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
                locationId={location.id}
            />
        </Stack>
    );
}
