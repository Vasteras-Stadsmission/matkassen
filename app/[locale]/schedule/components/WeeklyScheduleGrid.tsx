"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
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
import { Box, Grid, Group, Modal, Paper, ScrollArea, Text, Button, Tooltip } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { showNotification } from "@mantine/notifications";
import { IconArrowBackUp, IconCheck, IconInfoCircle } from "@tabler/icons-react";
import TimeSlotCell from "./TimeSlotCell";
import PickupCard from "./PickupCard";
import ReschedulePickupModal from "./ReschedulePickupModal";
import { FoodParcel, type LocationScheduleInfo } from "@/app/[locale]/schedule/actions";
import {
    updateFoodParcelScheduleAction,
    getPickupLocationSchedulesAction,
    getLocationSlotDurationAction,
} from "@/app/[locale]/schedule/client-actions";
import {
    formatDateToYMD,
    formatStockholmDate,
    isPastTimeSlot,
    toStockholmTime,
    formatTime,
} from "@/app/utils/date-utils";
import { isDateAvailable, getAvailableTimeRange } from "@/app/utils/schedule/location-availability";
import { useTranslations } from "next-intl";
import { TranslationFunction } from "../../types";

// Type for time gaps
interface TimeGap {
    startTime: string;
    endTime: string;
    durationMinutes: number;
}

// Format minutes as hours and minutes
export function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours === 0) {
        return `${mins} min`;
    } else if (mins === 0) {
        return hours === 1 ? `${hours} hour` : `${hours} hours`;
    } else {
        return `${hours}h ${mins}m`;
    }
}

// Generate day-specific time slots based on each day's opening/closing times and the slot duration
export function generateDaySpecificTimeSlots(
    date: Date,
    slotDurationMinutes: number,
    scheduleInfo: LocationScheduleInfo,
): string[] {
    // Check if the day is open
    const isOpen = isDateAvailable(date, scheduleInfo).isAvailable;
    if (!isOpen) {
        return []; // Return empty array for closed days
    }

    // Get the time range for this day
    const { earliestTime, latestTime } = getAvailableTimeRange(date, scheduleInfo);
    if (!earliestTime || !latestTime) {
        return []; // No time range available
    }

    // Parse the times
    const [openHour, openMinute] = earliestTime.split(":").map(Number);
    const [closeHour, closeMinute] = latestTime.split(":").map(Number);

    // Calculate total minutes for opening and closing
    const openingMinutes = openHour * 60 + openMinute;
    const closingMinutes = closeHour * 60 + closeMinute;

    // Generate slots
    const slots: string[] = [];

    // Start from the exact opening time
    let currentHour = openHour;
    let currentMinute = openMinute;
    let currentTotalMinutes = openingMinutes;

    // Generate slots until we reach closing time
    // A slot is valid if it starts before the closing time (so the appointment ends at or before closing time)
    while (currentTotalMinutes < closingMinutes) {
        const timeSlot = `${currentHour.toString().padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;
        slots.push(timeSlot);

        // Advance to the next slot using the specified duration
        currentMinute += slotDurationMinutes;
        if (currentMinute >= 60) {
            currentHour += Math.floor(currentMinute / 60);
            currentMinute = currentMinute % 60;
        }
        currentTotalMinutes += slotDurationMinutes;
    }

    return slots;
}

interface WeeklyScheduleGridProps {
    weekDates: Date[];
    foodParcels: FoodParcel[];
    maxParcelsPerDay: number;
    maxParcelsPerSlot?: number;
    onParcelRescheduled: () => void;
    locationId?: string | null;
}

export default function WeeklyScheduleGrid({
    weekDates,
    foodParcels,
    maxParcelsPerDay,
    maxParcelsPerSlot = 3,
    onParcelRescheduled,
    locationId,
}: WeeklyScheduleGridProps) {
    const t = useTranslations("schedule") as TranslationFunction;

    // State to store the location's slot duration
    const [slotDuration, setSlotDuration] = useState<number>(15); // Default to 15 minutes

    // Reference to track the last fetched location ID to prevent duplicate requests
    const lastFetchedLocationIdRef = useRef<string | null>(null);

    // Group parcels by date and time slot
    const [parcelsBySlot, setParcelsBySlot] = useState<
        Record<string, Record<string, FoodParcel[]>>
    >({});

    // State for active drag overlay
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const activeDragParcel = activeDragId
        ? foodParcels.find(p => p.id === activeDragId) || null
        : null;

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

    // State for location schedule information
    const [locationSchedules, setLocationSchedules] = useState<LocationScheduleInfo | null>(null);
    // State to track unavailable time slots
    const [unavailableTimeSlots, setUnavailableTimeSlots] = useState<{
        [key: string]: string[];
    }>({});

    // Filter TIME_SLOTS to only include those within the location's open hours
    const [filteredTimeSlots, setFilteredTimeSlots] = useState<string[]>([]);

    // Add loading state for schedule data
    const [isLoadingSchedule, setIsLoadingSchedule] = useState<boolean>(true);

    // Fetch the slot duration when locationId changes
    useEffect(() => {
        async function fetchSlotDuration() {
            if (locationId) {
                try {
                    const duration = await getLocationSlotDurationAction(locationId);
                    setSlotDuration(duration);
                    console.log(
                        `[fetchSlotDuration] Location ${locationId} has slot duration: ${duration} minutes`,
                    );
                } catch (error) {
                    console.error("Error fetching slot duration:", error);
                }
            }
        }

        if (locationId) {
            fetchSlotDuration();
        }
    }, [locationId]);

    // Generate day-specific time slots based on each day's opening/closing times and the slot duration
    const generateDaySpecificTimeSlots = useCallback(
        (scheduleInfo: LocationScheduleInfo) => {
            const daySlots: Record<string, string[]> = {};

            // Process each day in the week
            weekDates.forEach(date => {
                const dateFormatted = formatDateToYMD(date);
                const isOpen = isDateAvailable(date, scheduleInfo).isAvailable;

                // If the day is not open, set an empty array of slots
                if (!isOpen) {
                    daySlots[dateFormatted] = [];
                    return;
                }

                // Get the specific opening/closing times for this day
                const { earliestTime, latestTime } = getAvailableTimeRange(date, scheduleInfo);

                // If no time range is available, set an empty array
                if (!earliestTime || !latestTime) {
                    daySlots[dateFormatted] = [];
                    return;
                }

                // Parse the times
                const [openHour, openMinute] = earliestTime.split(":").map(Number);
                const [closeHour, closeMinute] = latestTime.split(":").map(Number);

                // Calculate total minutes for opening and closing
                const openingMinutes = openHour * 60 + openMinute;
                const closingMinutes = closeHour * 60 + closeMinute;

                // Generate slots for this day using the location's slot duration
                const slots: string[] = [];

                // Start from the exact opening time
                let currentHour = openHour;
                let currentMinute = openMinute;
                let currentTotalMinutes = openingMinutes;

                // Generate slots until we reach closing time
                // A slot is valid if it starts before the closing time (so it can end at or before closing time)
                while (currentTotalMinutes < closingMinutes) {
                    const timeSlot = `${currentHour.toString().padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;
                    slots.push(timeSlot);

                    // Advance to the next slot using the configured duration
                    currentMinute += slotDuration;
                    if (currentMinute >= 60) {
                        currentHour += Math.floor(currentMinute / 60);
                        currentMinute = currentMinute % 60;
                    }
                    currentTotalMinutes += slotDuration;
                }

                daySlots[dateFormatted] = slots;

                // Debug log
                console.log(
                    `[generateDaySpecificTimeSlots] Day ${dateFormatted} has ${slots.length} slots from ${earliestTime} to ${latestTime} with ${slotDuration}min interval`,
                );
            });

            return daySlots;
        },
        [weekDates, slotDuration],
    );

    // Function to collect all unique time slots from day-specific slots
    // We need this to create a complete grid with all possible time slots
    const getAllUniqueTimeSlots = useCallback((daySlots: Record<string, string[]>): string[] => {
        // Collect all unique time slots from all days
        const allSlotsSet = new Set<string>();

        Object.values(daySlots).forEach(daySlotArray => {
            daySlotArray.forEach(slot => allSlotsSet.add(slot));
        });

        // Convert to array and sort
        return Array.from(allSlotsSet).sort();
    }, []);

    // Create stable identifiers for the complex expressions used in dependency arrays
    const locationIdFromFoodParcels = useMemo(
        () =>
            foodParcels.length > 0 && !locationId
                ? foodParcels[0]?.locationId || foodParcels[0]?.pickup_location_id
                : null,
        [foodParcels, locationId],
    );

    const weekDatesFormatted = useMemo(
        () => JSON.stringify(weekDates.map(d => formatDateToYMD(d))),
        [weekDates],
    );

    // Fetch and process location schedules
    useEffect(() => {
        let isMounted = true;
        let fetchTimeoutId: NodeJS.Timeout | null = null;

        async function fetchLocationSchedules() {
            // Set loading state to true at the start of fetching
            setIsLoadingSchedule(true);

            try {
                let fetchLocationId: string | undefined;

                // Determine which locationId to use
                if (locationId) {
                    fetchLocationId = locationId;
                } else if (foodParcels.length > 0) {
                    fetchLocationId =
                        foodParcels[0].locationId || foodParcels[0].pickup_location_id;
                } else {
                    // No need to log, this is expected when the component initially renders
                    setIsLoadingSchedule(false);
                    return;
                }

                if (fetchLocationId) {
                    // Skip if we've already fetched this location's schedule
                    if (lastFetchedLocationIdRef.current === fetchLocationId && locationSchedules) {
                        setIsLoadingSchedule(false);
                        return;
                    }

                    // Only log in development
                    if (process.env.NODE_ENV === "development") {
                        console.log(`Fetching schedules for location ID: ${fetchLocationId}`);
                    }

                    const scheduleInfo = await getPickupLocationSchedulesAction(fetchLocationId);

                    // Guard against component unmount
                    if (!isMounted) return;

                    // Save the fetched location ID
                    lastFetchedLocationIdRef.current = fetchLocationId;
                    setLocationSchedules(scheduleInfo);

                    // Generate day-specific time slots based on the schedule and slot duration
                    const daySlots = generateDaySpecificTimeSlots(scheduleInfo);

                    // Generate a complete list of unique time slots across all days
                    const allTimeSlots = getAllUniqueTimeSlots(daySlots);
                    setFilteredTimeSlots(allTimeSlots.length > 0 ? allTimeSlots : []);

                    // Calculate which time slots are unavailable for each day
                    const unavailableSlots: Record<string, string[]> = {};

                    weekDates.forEach(date => {
                        const dateKey = formatDateToYMD(date);
                        const dayAvailable = isDateAvailable(date, scheduleInfo).isAvailable;

                        // If the day is unavailable, all slots are unavailable
                        if (!dayAvailable) {
                            unavailableSlots[dateKey] = [...allTimeSlots];
                            return;
                        }

                        // Otherwise, only slots outside the day's specific schedule are unavailable
                        const daySlotList = daySlots[dateKey] || [];
                        unavailableSlots[dateKey] = allTimeSlots.filter(
                            (slot: string) => !daySlotList.includes(slot),
                        );
                    });

                    setUnavailableTimeSlots(unavailableSlots);

                    // Set loading to false once everything is loaded
                    setIsLoadingSchedule(false);
                }
            } catch (error) {
                console.error("Error fetching location schedules:", error);
                // Set loading to false if there was an error
                setIsLoadingSchedule(false);
            }
        }

        // Add a small delay to batch potential multiple renders and avoid
        // redundant fetches when component updates frequently
        if (fetchTimeoutId) {
            clearTimeout(fetchTimeoutId);
        }

        fetchTimeoutId = setTimeout(() => {
            fetchLocationSchedules();
        }, 300); // Increased to 300ms to better debounce multiple rapid changes

        // Cleanup function
        return () => {
            isMounted = false;
            if (fetchTimeoutId) {
                clearTimeout(fetchTimeoutId);
            }
        };
    }, [
        // Only depend on these properties to avoid unnecessary fetches
        locationId,
        locationIdFromFoodParcels,
        weekDatesFormatted,
        generateDaySpecificTimeSlots,
        getAllUniqueTimeSlots,
        foodParcels,
        locationSchedules,
        weekDates,
    ]);

    // Organize parcels by date and time slot
    useEffect(() => {
        const newParcelsBySlot: Record<string, Record<string, FoodParcel[]>> = {};
        const newParcelCountByDate: Record<string, number> = {};

        // Initialize empty slots for all dates and times
        weekDates.forEach(date => {
            const dateKey = formatDateToYMD(date);
            newParcelsBySlot[dateKey] = {};
            newParcelCountByDate[dateKey] = 0;

            // Initialize all available time slots for this day
            (filteredTimeSlots || []).forEach(timeSlot => {
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

            // Round to the nearest slot based on slot duration
            const pickupTime = toStockholmTime(parcel.pickupEarliestTime);
            const hours = pickupTime.getHours();
            const minutes = pickupTime.getMinutes();

            // Round to the nearest slotDuration
            const slotIndex = Math.floor(minutes / slotDuration);
            const slotMinutes = slotIndex * slotDuration;
            const timeSlot = `${hours.toString().padStart(2, "0")}:${slotMinutes.toString().padStart(2, "0")}`;

            // Add parcel to corresponding slot
            if (newParcelsBySlot[dateKey] && !newParcelsBySlot[dateKey][timeSlot]) {
                newParcelsBySlot[dateKey][timeSlot] = [];
            }

            if (newParcelsBySlot[dateKey] && newParcelsBySlot[dateKey][timeSlot]) {
                newParcelsBySlot[dateKey][timeSlot].push(parcel);
            }
        });

        setParcelsBySlot(newParcelsBySlot);
        setParcelCountByDate(newParcelCountByDate);
    }, [foodParcels, weekDates, filteredTimeSlots, slotDuration]);

    // Setup DnD sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

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
            return;
        }

        // Check if the source time slot is in the past
        const isPastSource = isPastTimeSlot(
            parcel.pickupDate,
            formatTime(parcel.pickupEarliestTime),
        );
        if (isPastSource) {
            showNotification({
                title: t("reschedule.error", {}),
                message: t("reschedule.pastSourceError", {}),
                color: "red",
            });
            return;
        }

        // Parse target slot information
        try {
            // Parse the format: day-{dayIndex}-{dateStr}-{timeStr}
            const parts = targetSlotId.split("-");
            if (parts.length < 4) {
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

            // Check if this time slot is available according to location schedule
            if (locationSchedules) {
                const dateFormatted = formatDateToYMD(date);

                // Check if the target time slot is unavailable due to schedule
                if (unavailableTimeSlots[dateFormatted]?.includes(timeStr)) {
                    showNotification({
                        title: t("reschedule.error", {}),
                        message: t("reschedule.unavailableSlotError", {}),
                        color: "red",
                    });
                    return;
                }
            }

            // Set hours and minutes on the date from weekDates
            const startDateTime = new Date(date);
            startDateTime.setHours(hours, minutes, 0, 0);

            // Calculate end time based on the location's slot duration
            const endDateTime = new Date(startDateTime);
            endDateTime.setMinutes(endDateTime.getMinutes() + slotDuration);

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
                    title: t("reschedule.error", {}),
                    message: t("reschedule.pastError", {}),
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

            const result = await updateFoodParcelScheduleAction(draggedParcel.id, {
                date: targetSlot.date,
                startTime: targetSlot.startDateTime,
                endTime: targetSlot.endDateTime,
            });

            if (result.success) {
                showNotification({
                    title: t("reschedule.success", {}),
                    message: t("reschedule.successMessage", { name: draggedParcel.householdName }),
                    color: "green",
                });
                onParcelRescheduled();
            } else {
                showNotification({
                    title: t("reschedule.error", {}),
                    message: result.error || t("reschedule.genericError", {}),
                    color: "red",
                });
            }
        } catch (error) {
            console.error("Error rescheduling pickup:", error);
            showNotification({
                title: t("reschedule.error", {}),
                message: t("reschedule.genericError", {}),
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

    // Handler for reschedule button clicks
    const handleRescheduleClick = (parcel: FoodParcel) => {
        // Check if the source time slot is in the past
        const isPastSource = isPastTimeSlot(
            parcel.pickupDate,
            formatTime(parcel.pickupEarliestTime),
        );
        if (isPastSource) {
            showNotification({
                title: t("reschedule.error", {}),
                message: t("reschedule.pastSourceError", {}),
                color: "red",
            });
            return;
        }

        setSelectedParcelForReschedule(parcel);
        openRescheduleModal();
    };

    // Determine if a slot is unavailable based on day-specific schedules
    const isSlotUnavailableForDay = (date: Date, timeSlot: string): boolean => {
        const dateKey = formatDateToYMD(date);

        // Past dates are unavailable
        if (isPastDate(date)) {
            return true;
        }

        // Check if the day is available in the schedule
        const isDayAvailable = locationSchedules
            ? isDateAvailable(date, locationSchedules).isAvailable
            : false;

        if (!isDayAvailable) {
            return true;
        }

        // Check if this specific time slot is included in the day's available slots
        return unavailableTimeSlots[dateKey]?.includes(timeSlot) ?? true;
    };

    // Time Gap component for displaying gaps between time slots
    const TimeGapDivider = ({ gap, t }: { gap: TimeGap; t: TranslationFunction }) => {
        return (
            <Grid columns={32} gutter="xs" style={{ width: "100%", marginBottom: "8px" }}>
                <Grid.Col span={2}></Grid.Col>
                <Grid.Col span={30}>
                    <Paper
                        p="xs"
                        radius="sm"
                        withBorder
                        bg="gray.0"
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            borderStyle: "dashed",
                            borderColor: "#ccc",
                        }}
                    >
                        <Text size="xs" color="dimmed">
                            {t("timeGap")}: {formatDuration(gap.durationMinutes)} ({gap.startTime} -{" "}
                            {gap.endTime})
                        </Text>
                    </Paper>
                </Grid.Col>
            </Grid>
        );
    };

    return (
        <>
            {isLoadingSchedule ? (
                // Show loading skeleton when schedule data is loading
                <Box style={{ display: "flex", flexDirection: "column", width: "100%" }}>
                    {/* Skeleton header row with days */}
                    <Grid columns={32} gutter="xs" style={{ width: "100%" }}>
                        {/* Empty cell in place of time label */}
                        <Grid.Col span={2}>
                            <div></div>
                        </Grid.Col>

                        {weekDates.map((date, idx) => (
                            <Grid.Col span={30 / 7} key={idx}>
                                <Paper
                                    p="xs"
                                    radius="sm"
                                    withBorder
                                    bg="gray.3"
                                    style={{
                                        height: "100%",
                                        position: "relative",
                                    }}
                                >
                                    <Box mt={5} mb={5} h={16} w="80%" mx="auto" bg="gray.4" />
                                    <Box h={12} w="60%" mx="auto" bg="gray.4" />
                                </Paper>
                            </Grid.Col>
                        ))}
                    </Grid>

                    {/* Skeleton timeslots */}
                    <ScrollArea.Autosize
                        h="calc(100vh - 240px)"
                        scrollbarSize={6}
                        type="hover"
                        scrollHideDelay={500}
                    >
                        <Box style={{ width: "100%" }}>
                            {Array.from({ length: 8 }).map((_, slotIdx) => (
                                <Grid
                                    columns={32}
                                    gutter="xs"
                                    key={slotIdx}
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
                                            <Box h={14} w="80%" mx="auto" bg="gray.3" />
                                        </Paper>
                                    </Grid.Col>

                                    {/* Day columns */}
                                    {weekDates.map((_, dayIdx) => (
                                        <Grid.Col span={30 / 7} key={dayIdx}>
                                            <Paper
                                                p="xs"
                                                radius="sm"
                                                withBorder
                                                bg="gray.1"
                                                style={{ height: "60px" }}
                                            />
                                        </Grid.Col>
                                    ))}
                                </Grid>
                            ))}
                        </Box>
                    </ScrollArea.Autosize>
                </Box>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    onDragStart={handleDragStart}
                >
                    <SortableContext items={foodParcels.map(p => p.id)}>
                        <Box style={{ display: "flex", flexDirection: "column", width: "100%" }}>
                            {/* Header row with days */}
                            <Grid columns={32} gutter="xs" style={{ width: "100%" }}>
                                {/* Empty cell in place of time label */}
                                <Grid.Col span={2}>
                                    <div></div>
                                </Grid.Col>

                                {weekDates.map(date => {
                                    const isPast = isPastDate(date);

                                    // Check if this day is available in the location schedule
                                    const isDateUnavailable = locationSchedules
                                        ? !isDateAvailable(date, locationSchedules).isAvailable
                                        : true; // Default to unavailable if no schedule data

                                    // Determine background color for day header
                                    const getBgColor = () => {
                                        if (isPast || isDateUnavailable) return "gray.7"; // Grey out past or unavailable dates
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
                                                    opacity: isPast || isDateUnavailable ? 0.8 : 1,
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
                                                    {t(`days.${getWeekdayName(date)}`)}
                                                </Text>
                                                <Text size="xs" ta="center">
                                                    {formatDate(date)}
                                                </Text>

                                                {isDateUnavailable && (
                                                    <Tooltip
                                                        label={t("unavailableDay", {})}
                                                        position="bottom"
                                                        withArrow
                                                    >
                                                        <IconInfoCircle
                                                            size="0.9rem"
                                                            style={{
                                                                position: "absolute",
                                                                bottom: 4,
                                                                right: 4,
                                                                opacity: 0.8,
                                                            }}
                                                        />
                                                    </Tooltip>
                                                )}
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
                                    {(() => {
                                        // Create a combined array of time slots and gaps
                                        const renderedItems: React.ReactElement[] = [];

                                        // Iterate through sorted time slots and insert gap dividers in the right places
                                        const sortedTimeSlots = [...filteredTimeSlots].sort();
                                        sortedTimeSlots.forEach((timeSlot, index) => {
                                            // Add the normal time slot row
                                            renderedItems.push(
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
                                                            parcelsBySlot[dateKey]?.[timeSlot] ||
                                                            [];
                                                        const isOverCapacity =
                                                            maxParcelsPerSlot !== undefined &&
                                                            parcelsInSlot.length >
                                                                maxParcelsPerSlot;

                                                        // Check if this specific time slot is unavailable
                                                        const isSlotUnavailable =
                                                            isSlotUnavailableForDay(date, timeSlot);

                                                        // Determine the reason if slot is unavailable
                                                        const unavailableReason = isPastDate(date)
                                                            ? t("pastDateError", {
                                                                  defaultValue:
                                                                      "This date is in the past",
                                                              })
                                                            : locationSchedules &&
                                                                !isDateAvailable(
                                                                    date,
                                                                    locationSchedules,
                                                                ).isAvailable
                                                              ? t("unavailableDay", {
                                                                    defaultValue:
                                                                        "This location is not open on this day",
                                                                })
                                                              : unavailableTimeSlots[
                                                                      dateKey
                                                                  ]?.includes(timeSlot)
                                                                ? t("unavailableSlot", {
                                                                      defaultValue:
                                                                          "This time slot is outside operating hours",
                                                                  })
                                                                : undefined;

                                                        return (
                                                            <Grid.Col span={30 / 7} key={dayIndex}>
                                                                <TimeSlotCell
                                                                    date={date}
                                                                    time={timeSlot}
                                                                    parcels={parcelsInSlot.map(
                                                                        parcel => ({
                                                                            ...parcel,
                                                                            element: (
                                                                                <PickupCard
                                                                                    key={parcel.id}
                                                                                    foodParcel={
                                                                                        parcel
                                                                                    }
                                                                                    isCompact={true}
                                                                                    onReschedule={
                                                                                        handleRescheduleClick
                                                                                    }
                                                                                />
                                                                            ),
                                                                        }),
                                                                    )}
                                                                    maxParcelsPerSlot={
                                                                        maxParcelsPerSlot || 3
                                                                    }
                                                                    isOverCapacity={isOverCapacity}
                                                                    dayIndex={dayIndex}
                                                                    isUnavailable={
                                                                        isSlotUnavailable
                                                                    }
                                                                    unavailableReason={
                                                                        unavailableReason
                                                                    }
                                                                />
                                                            </Grid.Col>
                                                        );
                                                    })}
                                                </Grid>,
                                            );

                                            // Check if we should insert a gap divider after this time slot
                                            if (index < sortedTimeSlots.length - 1) {
                                                // Get the next time slot
                                                const nextTimeSlot = sortedTimeSlots[index + 1];

                                                // Use the detectTimeGap function to check for gaps
                                                const gapInfo = detectTimeGap(
                                                    timeSlot,
                                                    nextTimeSlot,
                                                    slotDuration,
                                                );

                                                // If we found a gap, insert a gap divider
                                                if (gapInfo) {
                                                    renderedItems.push(
                                                        <TimeGapDivider
                                                            key={`gap-${timeSlot}-${nextTimeSlot}`}
                                                            gap={gapInfo}
                                                            t={t}
                                                        />,
                                                    );
                                                }
                                            }
                                        });

                                        return renderedItems;
                                    })()}
                                </Box>
                            </ScrollArea.Autosize>
                        </Box>
                    </SortableContext>

                    {/* DragOverlay for visual feedback during dragging */}
                    <DragOverlay>
                        {activeDragParcel && (
                            <PickupCard foodParcel={activeDragParcel} isCompact={true} />
                        )}
                    </DragOverlay>
                </DndContext>
            )}

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
                locationSchedules={locationSchedules}
            />
        </>
    );
}

// Helper function to get weekday name in the format used in the database
function getWeekdayName(date: Date): string {
    const dayOfWeek = toStockholmTime(date).getDay();
    // Convert JavaScript's day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
    // to our database format (monday, tuesday, ..., sunday)
    return [
        "sunday", // JS: 0
        "monday", // JS: 1
        "tuesday", // JS: 2
        "wednesday", // JS: 3
        "thursday", // JS: 4
        "friday", // JS: 5
        "saturday", // JS: 6
    ][dayOfWeek];
}

// Type for time gaps
interface TimeGap {
    startTime: string;
    endTime: string;
    durationMinutes: number;
}

/**
 * Detects a gap between two time slots and creates a TimeGap object if one exists.
 * @param currentTimeSlot Current time slot in "HH:MM" format
 * @param nextTimeSlot Next time slot in "HH:MM" format
 * @param slotDuration Duration of a normal time slot in minutes
 * @returns A TimeGap object if a gap exists, null otherwise
 */
export function detectTimeGap(
    currentTimeSlot: string,
    nextTimeSlot: string,
    slotDuration: number,
): TimeGap | null {
    // Parse the times
    const [currentHours, currentMinutes] = currentTimeSlot.split(":").map(Number);
    const [nextHours, nextMinutes] = nextTimeSlot.split(":").map(Number);

    // Convert both times to minutes for easy comparison
    const currentTotalMinutes = currentHours * 60 + currentMinutes;
    const nextTotalMinutes = nextHours * 60 + nextMinutes;

    // Account for times that wrap around midnight
    let diffMinutes = nextTotalMinutes - currentTotalMinutes;
    if (diffMinutes < 0) {
        diffMinutes += 24 * 60; // Add a full day
    }

    // If the gap is larger than the normal slot duration, we have a gap
    if (diffMinutes > slotDuration) {
        // Calculate time at the end of the current slot (start of gap)
        let gapStartHour = currentHours;
        let gapStartMinute = currentMinutes + slotDuration;
        if (gapStartMinute >= 60) {
            gapStartHour += Math.floor(gapStartMinute / 60);
            gapStartMinute = gapStartMinute % 60;
        }
        const gapStartTime = `${gapStartHour.toString().padStart(2, "0")}:${gapStartMinute.toString().padStart(2, "0")}`;

        return {
            startTime: gapStartTime, // Start time is after the current slot ends
            endTime: nextTimeSlot,
            durationMinutes: diffMinutes - slotDuration, // Subtract the normal slot duration
        };
    }

    return null; // No gap detected
}

/**
 * Finds gaps in a sequence of time slots.
 * @param slots An array of time strings in format "HH:MM"
 * @param slotDuration Duration of a normal time slot in minutes (default: 15)
 * @returns Array of TimeGap objects representing gaps between consecutive time slots
 */
export function findTimeGaps(slots: string[], slotDuration: number = 15): TimeGap[] {
    if (!slots.length || slots.length <= 1) {
        return [];
    }

    // Sort the slots chronologically
    const sortedSlots = [...slots].sort((a, b) => {
        const [aHour, aMinute] = a.split(":").map(Number);
        const [bHour, bMinute] = b.split(":").map(Number);

        if (aHour !== bHour) {
            return aHour - bHour;
        }
        return aMinute - bMinute;
    });

    const gaps: TimeGap[] = [];

    // Go through each pair of adjacent time slots and check for gaps
    for (let i = 0; i < sortedSlots.length - 1; i++) {
        const currentSlot = sortedSlots[i];
        const nextSlot = sortedSlots[i + 1];

        const gapInfo = detectTimeGap(currentSlot, nextSlot, slotDuration);
        if (gapInfo) {
            gaps.push(gapInfo);
        }
    }

    return gaps;
}
