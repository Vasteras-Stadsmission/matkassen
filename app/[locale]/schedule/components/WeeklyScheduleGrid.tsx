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
import ReschedulePickupModal from "./ReschedulePickupModal";
import { FoodParcel, updateFoodParcelSchedule } from "@/app/[locale]/schedule/actions";
import {
    formatDateToYMD,
    formatStockholmDate,
    isPastTimeSlot,
    toStockholmTime,
} from "@/app/utils/date-utils";
import { useTranslations } from "next-intl";

const TIME_SLOTS = Array.from({ length: 18 }, (_, i) => {
    const hour = Math.floor(i / 2) + 8; // Start from 8:00
    const minute = (i % 2) * 30; // 0 or 30 minutes
    return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
});

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
    const t = useTranslations("schedule");

    const DAYS_OF_WEEK = [
        t("days.monday"),
        t("days.tuesday"),
        t("days.wednesday"),
        t("days.thursday"),
        t("days.friday"),
        t("days.saturday"),
        t("days.sunday"),
    ];

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

    // State for reschedule outside of week modal
    const [rescheduleModalOpened, { open: openRescheduleModal, close: closeRescheduleModal }] =
        useDisclosure(false);
    const [selectedParcelForReschedule, setSelectedParcelForReschedule] =
        useState<FoodParcel | null>(null);

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
            const dateKey = formatDateToYMD(date);
            newParcelsBySlot[dateKey] = {};
            newParcelCountByDate[dateKey] = 0;

            TIME_SLOTS.forEach(timeSlot => {
                newParcelsBySlot[dateKey][timeSlot] = [];
            });
        });

        // Place parcels in their respective slots
        foodParcels.forEach(parcel => {
            const dateKey = formatDateToYMD(parcel.pickupDate);

            // Count parcels by date
            if (!newParcelCountByDate[dateKey]) {
                newParcelCountByDate[dateKey] = 0;
            }
            newParcelCountByDate[dateKey]++;

            // Determine time slot based on earliest pickup time
            const pickupTime = toStockholmTime(parcel.pickupEarliestTime);
            const hours = pickupTime.getHours();
            const minutes = pickupTime.getMinutes();
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

        // Check if we're dropping on another parcel (or self) instead of a time slot
        if (!targetSlotId.startsWith("day-")) {
            // If the target ID doesn't start with "day-", it's likely a parcel ID
            // This happens when dropping directly on another parcel or on the same parcel
            return;
        }

        // Check if the source time slot is in the past
        const isPastSource = isPastTimeSlot(
            parcel.pickupDate,
            formatTime(parcel.pickupEarliestTime),
        );
        if (isPastSource) {
            showNotification({
                title: t("reschedule.error"),
                message: t("reschedule.pastSourceError"),
                color: "red",
            });
            return;
        }

        // Parse target slot information
        try {
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
            if (isPastTimeSlot(date, timeStr)) {
                showNotification({
                    title: t("reschedule.error"),
                    message: t("reschedule.pastError"),
                    color: "red",
                });
                return;
            }

            // Skip if time slot is the same as the current one
            const parcelDateYMD = formatDateToYMD(parcel.pickupDate);
            const targetDateYMD = formatDateToYMD(date);
            const parcelTimeFormatted = formatTime(parcel.pickupEarliestTime);

            const isSameTimeSlot =
                parcelDateYMD === targetDateYMD && parcelTimeFormatted === timeStr;

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
                    title: t("reschedule.success"),
                    message: t("reschedule.successMessage", { name: draggedParcel.householdName }),
                    color: "green",
                });
                onParcelRescheduled();
            } else {
                showNotification({
                    title: t("reschedule.error"),
                    message: result.error || t("reschedule.genericError"),
                    color: "red",
                });
            }
        } catch (error) {
            console.error("Error rescheduling pickup:", error);
            showNotification({
                title: t("reschedule.error"),
                message: t("reschedule.genericError"),
                color: "red",
            });
        } finally {
            setIsSubmitting(false);
            close();
        }
    };

    // Check if a date is in the past (entire day)
    const isPastDate = (date: Date) => {
        const stockholmToday = toStockholmTime(new Date());
        stockholmToday.setHours(0, 0, 0, 0);

        const stockholmCompareDate = toStockholmTime(date);
        stockholmCompareDate.setHours(0, 0, 0, 0);

        return stockholmCompareDate < stockholmToday;
    };

    // Format date for display
    const formatDate = (date: Date) => {
        return formatStockholmDate(date, "MMM d");
    };

    // Format time for display
    const formatTime = (date: Date) => {
        return formatStockholmDate(date, "HH:mm");
    };

    // Handler for reschedule button clicks
    const handleRescheduleClick = (parcel: FoodParcel) => {
        // Check if the source time slot is in the past
        const isPastSource = isPastTimeSlot(
            parcel.pickupDate,
            formatTime(parcel.pickupEarliestTime),
        );
        if (isPastSource) {
            showNotification({
                title: t("reschedule.error"),
                message: t("reschedule.pastSourceError"),
                color: "red",
            });
            return;
        }

        setSelectedParcelForReschedule(parcel);
        openRescheduleModal();
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
                                const dateInStockholm = toStockholmTime(date);
                                const dayOfWeek = dateInStockholm.getDay();
                                const isWeekend = dayOfWeek === 6 || dayOfWeek === 0;
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
                                                data-testid="capacity-indicator"
                                            >
                                                {parcelCountByDate[formatDateToYMD(date)] || 0}/
                                                {maxParcelsPerDay || "∞"}
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
                                            const dateKey = formatDateToYMD(date);
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
                                                        parcels={parcelsInSlot.map(parcel => ({
                                                            ...parcel,
                                                            element: (
                                                                <PickupCard
                                                                    key={parcel.id}
                                                                    foodParcel={parcel}
                                                                    isCompact={true}
                                                                    onReschedule={
                                                                        handleRescheduleClick
                                                                    }
                                                                />
                                                            ),
                                                        }))}
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
            <Modal
                opened={opened}
                onClose={close}
                title={t("reschedule.confirmTitle")}
                centered
                size="md"
            >
                {draggedParcel && targetSlot && (
                    <Box p="md">
                        <Text fw={500} mb="md">
                            {t("reschedule.confirmQuestion", { name: draggedParcel.householdName })}
                        </Text>

                        <Paper withBorder p="md" radius="md" mb="md">
                            <Group justify="space-between" mb="xs">
                                <Text fw={500}>{t("reschedule.from")}:</Text>
                                <Text>
                                    {formatDate(draggedParcel.pickupDate)},{" "}
                                    {formatTime(draggedParcel.pickupEarliestTime)} -{" "}
                                    {formatTime(draggedParcel.pickupLatestTime)}
                                </Text>
                            </Group>

                            <Group justify="space-between" mb="xs">
                                <Text fw={500}>{t("reschedule.to2")}:</Text>
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
                                {t("reschedule.cancel")}
                            </Button>
                            <Button
                                color="blue"
                                onClick={handleConfirmReschedule}
                                loading={isSubmitting}
                                leftSection={<IconCheck size="1rem" />}
                            >
                                {t("reschedule.confirm")}
                            </Button>
                        </Group>
                    </Box>
                )}
            </Modal>

            <ReschedulePickupModal
                opened={rescheduleModalOpened}
                onClose={closeRescheduleModal}
                foodParcel={selectedParcelForReschedule}
                onRescheduled={onParcelRescheduled}
            />
        </>
    );
}
