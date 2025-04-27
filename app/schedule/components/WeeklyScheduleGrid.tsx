"use client";

import { useEffect, useState } from "react";
import {
    DndContext,
    DragEndEvent,
    DragStartEvent,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    DragOverlay,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Box, Grid, Group, Modal, Paper, ScrollArea, Text, Button } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { showNotification } from "@mantine/notifications";
import { IconArrowBackUp, IconCheck } from "@tabler/icons-react";
import TimeSlotCell from "./TimeSlotCell";
import PickupCard from "./PickupCard";
import { FoodParcel, updateFoodParcelSchedule } from "@/app/schedule/actions";

const TIME_SLOTS = Array.from({ length: 18 }, (_, i) => {
    const hour = Math.floor(i / 2) + 8; // Start from 8:00
    const minute = (i % 2) * 30; // 0 or 30 minutes
    return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
});

const DAYS_OF_WEEK = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];

interface WeeklyScheduleGridProps {
    weekDates: Date[];
    foodParcels: FoodParcel[];
    maxParcelsPerDay: number;
    maxParcelsPerSlot?: number;
    onParcelRescheduled: () => void;
}

export default function WeeklyScheduleGrid({
    weekDates,
    foodParcels,
    maxParcelsPerDay,
    maxParcelsPerSlot = 3,
    onParcelRescheduled,
}: WeeklyScheduleGridProps) {
    // Group parcels by date and time slot
    const [parcelsBySlot, setParcelsBySlot] = useState<
        Record<string, Record<string, FoodParcel[]>>
    >({});

    // State for active drag overlay
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const activeDragParcel = activeDragId ? foodParcels.find(p => p.id === activeDragId) : null;

    // State for confirmation modal
    const [opened, { open, close }] = useDisclosure(false);
    const [draggedParcel, setDraggedParcel] = useState<FoodParcel | null>(null);
    const [targetSlot, setTargetSlot] = useState<{
        date: Date;
        startDateTime: Date;
        endDateTime: Date;
    } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Count parcels by date for capacity limits
    const [parcelCountByDate, setParcelCountByDate] = useState<Record<string, number>>({});

    // Setup DnD sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Minimum drag distance before activation
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    // Organize parcels by date and time slot on component mount or when food parcels change
    useEffect(() => {
        const newParcelsBySlot: Record<string, Record<string, FoodParcel[]>> = {};
        const newParcelCountByDate: Record<string, number> = {};

        // Initialize empty slots for all dates and times
        weekDates.forEach(date => {
            const dateKey = date.toISOString().split("T")[0];
            newParcelsBySlot[dateKey] = {};
            newParcelCountByDate[dateKey] = 0;

            TIME_SLOTS.forEach(timeSlot => {
                newParcelsBySlot[dateKey][timeSlot] = [];
            });
        });

        // Place parcels in their respective slots
        foodParcels.forEach(parcel => {
            const dateKey = parcel.pickupDate.toISOString().split("T")[0];

            // Count parcels by date
            if (!newParcelCountByDate[dateKey]) {
                newParcelCountByDate[dateKey] = 0;
            }
            newParcelCountByDate[dateKey]++;

            // Determine time slot based on earliest pickup time
            const hours = parcel.pickupEarliestTime.getHours();
            const minutes = parcel.pickupEarliestTime.getMinutes();
            const minuteRounded = minutes < 30 ? "00" : "30";
            const timeSlot = `${hours.toString().padStart(2, "0")}:${minuteRounded}`;

            // Add parcel to corresponding slot
            if (newParcelsBySlot[dateKey] && TIME_SLOTS.includes(timeSlot)) {
                if (!newParcelsBySlot[dateKey][timeSlot]) {
                    newParcelsBySlot[dateKey][timeSlot] = [];
                }
                newParcelsBySlot[dateKey][timeSlot].push(parcel);
            }
        });

        setParcelsBySlot(newParcelsBySlot);
        setParcelCountByDate(newParcelCountByDate);
    }, [foodParcels, weekDates]);

    // Handle drag start event
    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragId(event.active.id as string);
    };

    // Handle drag end event
    const handleDragEnd = (event: DragEndEvent) => {
        // Reset active drag state
        setActiveDragId(null);

        const { active, over } = event;

        if (!over) return;

        const parcelId = active.id as string;
        const targetSlotId = over.id as string;

        // Find the dragged parcel
        const parcel = foodParcels.find(p => p.id === parcelId);
        if (!parcel) return;

        // Parse target slot information
        try {
            // Skip if target ID doesn't match our expected format
            if (!targetSlotId.startsWith("day-")) {
                console.error(
                    "Invalid target slot ID format, doesn't start with 'day-':",
                    targetSlotId,
                );
                return;
            }

            // Parse the format: day-{dayIndex}-{dateStr}-{timeStr}
            const parts = targetSlotId.split("-");
            if (parts.length < 4) {
                // Need at least 'day', '{index}', part of date, time
                console.error("Invalid target slot ID format, not enough parts:", targetSlotId);
                return;
            }

            // Extract the day index
            const dayIndex = parseInt(parts[1], 10);
            if (isNaN(dayIndex) || dayIndex < 0 || dayIndex >= weekDates.length) {
                console.error("Invalid day index:", parts[1]);
                return;
            }

            // Get the date directly from weekDates using the index
            const date = new Date(weekDates[dayIndex]);
            if (isNaN(date.getTime())) {
                console.error("Invalid date from dayIndex:", dayIndex);
                return;
            }

            // Get the time which is now the last part
            const timeStr = parts[parts.length - 1];
            if (!timeStr || !/^\d{2}:\d{2}$/.test(timeStr)) {
                console.error("Invalid time format:", timeStr);
                return;
            }

            // Parse the time
            const [hoursStr, minutesStr] = timeStr.split(":");
            const hours = parseInt(hoursStr, 10);
            const minutes = parseInt(minutesStr, 10);

            if (
                isNaN(hours) ||
                isNaN(minutes) ||
                hours < 0 ||
                hours > 23 ||
                minutes < 0 ||
                minutes > 59
            ) {
                console.error("Invalid time values:", { hours, minutes });
                return;
            }

            // Set hours and minutes on the date from weekDates
            const startDateTime = new Date(date);
            startDateTime.setHours(hours, minutes, 0, 0);

            const endDateTime = new Date(startDateTime);
            endDateTime.setMinutes(endDateTime.getMinutes() + 30);

            // Validate dates before using them
            if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
                console.error("Invalid date/time calculation:", {
                    date,
                    hours,
                    minutes,
                    startDateTime,
                    endDateTime,
                });
                return;
            }

            // Check if the target time slot is in the past
            const now = new Date();
            if (startDateTime <= now) {
                showNotification({
                    title: "Schemaläggning misslyckades",
                    message: "Det går inte att boka matstöd i det förflutna.",
                    color: "red",
                });
                return;
            }

            // Skip if time slot is the same as the current one
            const isSameTimeSlot =
                parcel.pickupDate.toDateString() === date.toDateString() &&
                parcel.pickupEarliestTime.getHours() === hours &&
                parcel.pickupEarliestTime.getMinutes() === minutes;

            if (isSameTimeSlot) {
                return;
            }

            // Store info for confirmation modal
            setDraggedParcel(parcel);
            setTargetSlot({
                date,
                startDateTime,
                endDateTime,
            });

            // Open confirmation modal
            open();
        } catch (error) {
            console.error("Error parsing target slot:", error, targetSlotId);
        }
    };

    // Handle confirmation of rescheduling
    const handleConfirmReschedule = async () => {
        if (!draggedParcel || !targetSlot) return;

        try {
            setIsSubmitting(true);

            const result = await updateFoodParcelSchedule(draggedParcel.id, {
                date: targetSlot.date,
                startTime: targetSlot.startDateTime,
                endTime: targetSlot.endDateTime,
            });

            if (result.success) {
                showNotification({
                    title: "Schemaläggning uppdaterad",
                    message: `${draggedParcel.householdName} har schemalagts på ny tid.`,
                    color: "green",
                });
                onParcelRescheduled();
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
            close();
        }
    };

    // Check if a date is in the past (entire day)
    const isPastDate = (date: Date) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const compareDate = new Date(date);
        compareDate.setHours(0, 0, 0, 0);
        return compareDate < today;
    };

    // Format date for display
    const formatDate = (date: Date) => {
        return date.toLocaleDateString("sv-SE", {
            month: "short",
            day: "numeric",
        });
    };

    // Format time for display
    const formatTime = (date: Date) => {
        return date.toLocaleTimeString("sv-SE", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    return (
        <>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                onDragStart={handleDragStart}
            >
                <SortableContext items={foodParcels.map(p => p.id)}>
                    <Box style={{ display: "flex", flexDirection: "column", width: "100%" }}>
                        {/* Header row with days - now outside ScrollArea */}
                        <Grid columns={32} gutter="xs" style={{ width: "100%" }}>
                            {/* Empty cell in place of "Tid" label */}
                            <Grid.Col span={2}>
                                <div></div>
                            </Grid.Col>

                            {weekDates.map((date, index) => {
                                // Check if Saturday or Sunday (5 = Saturday, 6 = Sunday)
                                const isWeekend = date.getDay() === 6 || date.getDay() === 0;
                                const isPast = isPastDate(date);

                                // Determine background color for day header
                                const getBgColor = () => {
                                    if (isPast) return "gray.7"; // Grey out past dates
                                    if (isWeekend) return "red.7";
                                    return "blue.7";
                                };

                                return (
                                    <Grid.Col span={30 / 7} key={date.toISOString()}>
                                        <Paper
                                            p="xs"
                                            radius="sm"
                                            withBorder
                                            bg={getBgColor()}
                                            c="white"
                                            style={{
                                                height: "100%",
                                                position: "relative",
                                                opacity: isPast ? 0.8 : 1, // Reduce opacity for past dates
                                            }}
                                        >
                                            {/* Capacity indicator in top-right corner */}
                                            <Text
                                                size="xs"
                                                c="gray.2"
                                                style={{
                                                    position: "absolute",
                                                    top: 4,
                                                    right: 4,
                                                }}
                                            >
                                                {parcelCountByDate[
                                                    date.toISOString().split("T")[0]
                                                ] || 0}
                                                /{maxParcelsPerDay || "∞"}
                                            </Text>

                                            <Text fw={500} ta="center" size="sm">
                                                {DAYS_OF_WEEK[index]}
                                            </Text>
                                            <Text size="xs" ta="center">
                                                {formatDate(date)}
                                            </Text>
                                        </Paper>
                                    </Grid.Col>
                                );
                            })}
                        </Grid>

                        {/* Time slots grid - in ScrollArea */}
                        <ScrollArea.Autosize
                            h="calc(100vh - 240px)"
                            scrollbarSize={6}
                            type="hover"
                            scrollHideDelay={500}
                        >
                            <Box style={{ width: "100%" }}>
                                {TIME_SLOTS.map(timeSlot => (
                                    <Grid
                                        columns={32}
                                        gutter="xs"
                                        key={timeSlot}
                                        style={{ width: "100%" }}
                                    >
                                        {/* Time column */}
                                        <Grid.Col span={2}>
                                            <Paper
                                                p="xs"
                                                radius="sm"
                                                withBorder
                                                bg="gray.1"
                                                style={{ height: "100%" }}
                                            >
                                                <Text fw={500} size="xs" ta="center">
                                                    {timeSlot}
                                                </Text>
                                            </Paper>
                                        </Grid.Col>

                                        {/* Day columns */}
                                        {weekDates.map((date, dayIndex) => {
                                            const dateKey = date.toISOString().split("T")[0];
                                            const parcelsInSlot =
                                                parcelsBySlot[dateKey]?.[timeSlot] || [];
                                            const isOverCapacity =
                                                maxParcelsPerSlot !== undefined &&
                                                parcelsInSlot.length > maxParcelsPerSlot;

                                            return (
                                                <Grid.Col
                                                    span={30 / 7}
                                                    key={`${dateKey}-${timeSlot}`}
                                                >
                                                    <TimeSlotCell
                                                        date={date}
                                                        time={timeSlot}
                                                        parcels={parcelsInSlot}
                                                        maxParcelsPerSlot={maxParcelsPerSlot || 3}
                                                        isOverCapacity={isOverCapacity}
                                                        dayIndex={dayIndex}
                                                    />
                                                </Grid.Col>
                                            );
                                        })}
                                    </Grid>
                                ))}
                            </Box>
                        </ScrollArea.Autosize>
                    </Box>
                </SortableContext>
                {/* Add DragOverlay component for visual feedback during dragging */}
                <DragOverlay>
                    {activeDragParcel && (
                        <PickupCard foodParcel={activeDragParcel} isCompact={true} />
                    )}
                </DragOverlay>
            </DndContext>

            {/* Confirmation Modal */}
            <Modal opened={opened} onClose={close} title="Bekräfta ombokning" centered size="md">
                {draggedParcel && targetSlot && (
                    <Box p="md">
                        <Text fw={500} mb="md">
                            Vill du boka om matstöd för {draggedParcel.householdName}?
                        </Text>

                        <Paper withBorder p="md" radius="md" mb="md">
                            <Group justify="space-between" mb="xs">
                                <Text fw={500}>Från:</Text>
                                <Text>
                                    {formatDate(draggedParcel.pickupDate)},{" "}
                                    {formatTime(draggedParcel.pickupEarliestTime)} -{" "}
                                    {formatTime(draggedParcel.pickupLatestTime)}
                                </Text>
                            </Group>

                            <Group justify="space-between" mb="xs">
                                <Text fw={500}>Till:</Text>
                                <Text>
                                    {formatDate(targetSlot.date)},{" "}
                                    {formatTime(targetSlot.startDateTime)} -{" "}
                                    {formatTime(targetSlot.endDateTime)}
                                </Text>
                            </Group>
                        </Paper>

                        <Group justify="flex-end" mt="xl">
                            <Button
                                variant="outline"
                                onClick={close}
                                leftSection={<IconArrowBackUp size="1rem" />}
                            >
                                Avbryt
                            </Button>
                            <Button
                                color="blue"
                                onClick={handleConfirmReschedule}
                                loading={isSubmitting}
                                leftSection={<IconCheck size="1rem" />}
                            >
                                Bekräfta ändring
                            </Button>
                        </Group>
                    </Box>
                )}
            </Modal>
        </>
    );
}
