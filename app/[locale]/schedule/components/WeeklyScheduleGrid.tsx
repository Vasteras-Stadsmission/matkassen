"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import {
    Box,
    Grid,
    Group,
    Modal,
    Paper,
    ScrollArea,
    Text,
    Button,
    Tooltip,
    Code,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { showNotification } from "@mantine/notifications";
import { IconArrowBackUp, IconCheck, IconInfoCircle } from "@tabler/icons-react";
import TimeSlotCell from "./TimeSlotCell";
import PickupCard from "./PickupCard";
import ReschedulePickupModal from "./ReschedulePickupModal";
import {
    FoodParcel,
    updateFoodParcelSchedule,
    getPickupLocationSchedules,
    LocationScheduleInfo,
} from "@/app/[locale]/schedule/actions";
import {
    formatDateToYMD,
    formatStockholmDate,
    isPastTimeSlot,
    toStockholmTime,
    formatTime,
} from "@/app/utils/date-utils";
import {
    isDateAvailable,
    isTimeAvailable,
    getAvailableTimeRange,
} from "@/app/utils/schedule/location-availability";
import { useTranslations } from "next-intl";
import { TranslationFunction } from "../../types";

// Define TimeSlotGridData type
interface TimeSlotGridData {
    days: {
        date: Date;
        isAvailable: boolean;
        isSelected: boolean;
        unavailableReason?: string;
    }[];
    timeslots: string[];
}

// Define a more comprehensive set of time slots from 06:00 to 22:00
const ALL_TIME_SLOTS = Array.from({ length: 33 }, (_, i) => {
    const hour = Math.floor(i / 2) + 6; // Start from 06:00
    const minute = (i % 2) * 30; // 0 or 30 minutes
    return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
});

const DEFAULT_TIME_SLOTS = [
    "09:00",
    "09:30",
    "10:00",
    "10:30",
    "11:00",
    "11:30",
    "12:00",
    "12:30",
    "13:00",
    "13:30",
    "14:00",
    "14:30",
    "15:00",
    "15:30",
    "16:00",
    "16:30",
    "17:00",
];

interface WeeklyScheduleGridProps {
    weekDates: Date[];
    foodParcels: FoodParcel[];
    maxParcelsPerDay: number;
    maxParcelsPerSlot?: number;
    onParcelRescheduled: () => void;
    locationId?: string | null; // Add locationId as prop
}

export default function WeeklyScheduleGrid({
    weekDates,
    foodParcels,
    maxParcelsPerDay,
    maxParcelsPerSlot = 3,
    onParcelRescheduled,
    locationId, // Destructure locationId prop
}: WeeklyScheduleGridProps) {
    const t = useTranslations("schedule") as TranslationFunction;

    // Reference to track the last fetched location ID to prevent duplicate requests
    const lastFetchedLocationIdRef = useRef<string | null>(null);

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

    // State for location schedule information
    const [locationSchedules, setLocationSchedules] = useState<LocationScheduleInfo | null>(null);
    // State to hold the timeslots grid data
    const [grid, setGrid] = useState<TimeSlotGridData | null>(null);
    // State to track unavailable time slots
    const [unavailableTimeSlots, setUnavailableTimeSlots] = useState<{
        [key: string]: string[];
    }>({});

    // Filter TIME_SLOTS to only include those within the location's open hours
    const [filteredTimeSlots, setFilteredTimeSlots] = useState<string[]>(DEFAULT_TIME_SLOTS);

    // Function to filter time slots based on location schedule - With stable function references
    const filterTimeSlotsBasedOnSchedule = useCallback(
        (scheduleInfo: LocationScheduleInfo) => {
            // Find all days in the week that have any availability
            const availableDays = weekDates.filter(
                date => isDateAvailable(date, scheduleInfo).isAvailable,
            );

            if (availableDays.length === 0) {
                // If no days are available, keep all default time slots
                setFilteredTimeSlots(DEFAULT_TIME_SLOTS);
                return;
            }

            // Find the earliest opening time and latest closing time across all available days
            let earliestOpeningTime = "23:59";
            let latestClosingTime = "00:00";

            availableDays.forEach(date => {
                const timeRange = getAvailableTimeRange(date, scheduleInfo);
                if (timeRange.earliestTime && timeRange.latestTime) {
                    if (timeRange.earliestTime < earliestOpeningTime) {
                        earliestOpeningTime = timeRange.earliestTime;
                    }
                    if (timeRange.latestTime > latestClosingTime) {
                        latestClosingTime = timeRange.latestTime;
                    }
                }
            });

            // Debug in development mode to see what time ranges we're finding
            console.log(
                `[filterTimeSlotsBasedOnSchedule] Earliest opening: ${earliestOpeningTime}, Latest closing: ${latestClosingTime}`,
            );

            // If we couldn't determine time ranges, use default slots
            if (earliestOpeningTime === "23:59" || latestClosingTime === "00:00") {
                setFilteredTimeSlots(DEFAULT_TIME_SLOTS);
                return;
            }

            // Convert times to hours and minutes for comparison
            const [startHour, startMinute] = earliestOpeningTime.split(":").map(Number);
            const [endHour, endMinute] = latestClosingTime.split(":").map(Number);

            // Calculate time in minutes for easier comparison
            const startTimeInMinutes = startHour * 60 + startMinute;
            const endTimeInMinutes = endHour * 60 + endMinute;

            // Generate all valid 30-minute time slots between opening and closing times
            const validTimeSlots: string[] = [];

            // Loop through the comprehensive ALL_TIME_SLOTS instead of DEFAULT_TIME_SLOTS
            // This ensures we can handle any opening hours (e.g., 08:00-12:00 or 14:00-19:00)
            for (const timeSlot of ALL_TIME_SLOTS) {
                const [slotHour, slotMinute] = timeSlot.split(":").map(Number);
                const slotTimeInMinutes = slotHour * 60 + slotMinute;

                // Include if slot is within or equal to opening time, and before closing time
                if (
                    slotTimeInMinutes >= startTimeInMinutes &&
                    slotTimeInMinutes < endTimeInMinutes
                ) {
                    validTimeSlots.push(timeSlot);
                }
            }

            console.log(`[filterTimeSlotsBasedOnSchedule] Valid time slots:`, validTimeSlots);

            // If no valid slots were found, fallback to default
            setFilteredTimeSlots(validTimeSlots.length > 0 ? validTimeSlots : DEFAULT_TIME_SLOTS);
        },
        [weekDates], // Only depend on weekDates
    );

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

            // Initialize all possible time slots - use ALL_TIME_SLOTS to ensure we cover all possible parcel times
            ALL_TIME_SLOTS.forEach(timeSlot => {
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
            if (newParcelsBySlot[dateKey]) {
                if (!newParcelsBySlot[dateKey][timeSlot]) {
                    newParcelsBySlot[dateKey][timeSlot] = [];
                }
                newParcelsBySlot[dateKey][timeSlot].push(parcel);
            }
        });

        setParcelsBySlot(newParcelsBySlot);
        setParcelCountByDate(newParcelCountByDate);
    }, [foodParcels, weekDates]);

    // Function to initialize or update grid data
    useEffect(() => {
        if (weekDates && locationSchedules) {
            const newGrid: TimeSlotGridData = {
                days: weekDates.map(date => {
                    const isAvailable = isDateAvailable(date, locationSchedules).isAvailable;
                    const isSelected = false; // Default to false, can be updated on slot select

                    return {
                        date,
                        isAvailable,
                        isSelected,
                    };
                }),
                timeslots: DEFAULT_TIME_SLOTS,
            };

            // Update grid state
            setGrid(newGrid);
        }
    }, [weekDates, locationSchedules, setGrid]);

    // Calculate which time slots are unavailable for each date
    const calculateUnavailableTimeSlots = useCallback(
        (scheduleInfo: LocationScheduleInfo) => {
            const unavailableSlots: { [key: string]: string[] } = {};

            // Process each day in the grid
            grid?.days.forEach(dayInfo => {
                const date = dayInfo.date;
                const dateFormatted = formatDateToYMD(date);

                // Initialize the array for this date if it doesn't exist
                if (!unavailableSlots[dateFormatted]) {
                    unavailableSlots[dateFormatted] = [];
                }

                // First check if the entire day is unavailable
                const dateAvailability = isDateAvailable(date, scheduleInfo);

                if (!dateAvailability.isAvailable) {
                    // If the entire day is unavailable, mark all time slots for this day as unavailable
                    grid.timeslots.forEach(timeSlot => {
                        unavailableSlots[dateFormatted].push(timeSlot);
                    });
                    return;
                }

                // Get the available time range for this day
                const timeRange = getAvailableTimeRange(date, scheduleInfo);

                // If there's no available time range, the day is closed
                if (!timeRange.earliestTime || !timeRange.latestTime) {
                    grid.timeslots.forEach(timeSlot => {
                        unavailableSlots[dateFormatted].push(timeSlot);
                    });
                    return;
                }

                // For days that are open, mark time slots outside operating hours as unavailable
                grid.timeslots.forEach(timeSlot => {
                    const timeAvailability = isTimeAvailable(date, timeSlot, scheduleInfo);

                    if (!timeAvailability.isAvailable) {
                        unavailableSlots[dateFormatted].push(timeSlot);
                    }
                });
            });

            return unavailableSlots;
        },
        [grid?.days, grid?.timeslots],
    );

    // Fetch location schedules when component mounts or when locationId changes
    useEffect(() => {
        let isMounted = true;
        let fetchTimeoutId: NodeJS.Timeout | null = null;

        async function fetchLocationSchedules() {
            try {
                let fetchLocationId: string | undefined;

                // First try to use the locationId prop passed directly from SchedulePageClient
                if (locationId) {
                    fetchLocationId = locationId;
                    console.log(`Using locationId prop: ${fetchLocationId}`);
                }
                // If that's not available, try to get it from the food parcels
                else if (foodParcels.length > 0) {
                    fetchLocationId =
                        foodParcels[0].locationId || foodParcels[0].pickup_location_id;
                    console.log(`Using location ID from food parcels: ${fetchLocationId}`);
                } else {
                    console.log("No location ID available, cannot fetch schedules");
                    return;
                }

                if (fetchLocationId) {
                    // To avoid duplicate requests to the same location when component rerenders,
                    // we'll track the last fetched location ID in a ref
                    if (lastFetchedLocationIdRef.current === fetchLocationId && locationSchedules) {
                        console.log(
                            `Using cached schedule data for location ID: ${fetchLocationId}`,
                        );
                        return;
                    }

                    console.log(`Fetching schedules for location ID: ${fetchLocationId}`);
                    const scheduleInfo = await getPickupLocationSchedules(fetchLocationId);

                    // Guard against component unmount during async operation
                    if (!isMounted) return;

                    console.log("Received schedule info:", scheduleInfo);

                    // Update the last fetched location ID ref
                    lastFetchedLocationIdRef.current = fetchLocationId;

                    setLocationSchedules(scheduleInfo);

                    // Calculate unavailable timeslots based on the location's schedule
                    const unavailableSlots = calculateUnavailableTimeSlots(scheduleInfo);
                    setUnavailableTimeSlots(unavailableSlots);

                    // Filter the time slots based on location schedules
                    filterTimeSlotsBasedOnSchedule(scheduleInfo);
                }
            } catch (error) {
                console.error("Error fetching location schedules:", error);
            }
        }

        // Add a small delay to avoid multiple rapid calls, helping with "Lifecenter Church" issue
        // by giving time for any parallel rendering to complete before making the request
        if (fetchTimeoutId) {
            clearTimeout(fetchTimeoutId);
        }

        fetchTimeoutId = setTimeout(() => {
            fetchLocationSchedules();
        }, 150); // Small delay to batch potential multiple renders

        // Cleanup function to prevent state updates after unmount
        return () => {
            isMounted = false;
            if (fetchTimeoutId) {
                clearTimeout(fetchTimeoutId);
            }
        };
    }, [
        locationId,
        calculateUnavailableTimeSlots,
        filterTimeSlotsBasedOnSchedule,
        // Include foodParcels and locationSchedules as proper dependencies
        foodParcels,
        locationSchedules,
    ]);

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

            const result = await updateFoodParcelSchedule(draggedParcel.id, {
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

                                // Direct debug for week 21
                                if (isWeek21(date)) {
                                    console.log(
                                        `%c[DEBUG] Rendering day ${date.toISOString()} (${DAYS_OF_WEEK[index]})`,
                                        "background: #ffeb3b; color: black; padding: 2px 4px;",
                                    );
                                    console.log(
                                        `Day of week JS: ${dayOfWeek}, weekday name in DB format: ${getWeekdayName(date)}`,
                                    );

                                    if (locationSchedules) {
                                        const availability = isDateAvailable(
                                            date,
                                            locationSchedules,
                                        );
                                        console.log(
                                            `Is available according to schedule: ${availability.isAvailable}`,
                                            availability,
                                        );

                                        // Check each schedule to find why days might be unavailable
                                        locationSchedules.schedules.forEach(schedule => {
                                            const startDate = new Date(schedule.startDate);
                                            const endDate = new Date(schedule.endDate);
                                            const isInRange = date >= startDate && date <= endDate;
                                            console.log(
                                                `Schedule ${schedule.name} (${startDate.toISOString()} - ${endDate.toISOString()}): ${isInRange ? "IN RANGE" : "out of range"}`,
                                            );

                                            if (isInRange) {
                                                const weekdayName = getWeekdayName(date);
                                                const dayConfig = schedule.days.find(
                                                    d => d.weekday === weekdayName,
                                                );
                                                console.log(
                                                    `Day config for ${weekdayName}:`,
                                                    dayConfig,
                                                );
                                            }
                                        });
                                    } else {
                                        console.log("No location schedules available");
                                    }
                                }

                                // Check if this day is available in the location schedule
                                const isDateUnavailable = locationSchedules
                                    ? !isDateAvailable(date, locationSchedules).isAvailable
                                    : true; // Default to unavailable if no schedule data

                                // Determine background color for day header
                                const getBgColor = () => {
                                    if (isPast || isDateUnavailable) return "gray.7"; // Grey out past or unavailable dates
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
                                                opacity: isPast || isDateUnavailable ? 0.8 : 1, // Reduce opacity for past or unavailable dates
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
                                {filteredTimeSlots.map(timeSlot => (
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

                                            // Check if this day is unavailable due to being in the past or having no schedule
                                            const isPast = isPastDate(date);

                                            // Check if this day is unavailable in the location schedule
                                            const isDateUnavailable = locationSchedules
                                                ? !isDateAvailable(date, locationSchedules)
                                                      .isAvailable
                                                : true; // Default to unavailable if no schedule data

                                            // Check if this specific time slot is unavailable
                                            const isSlotUnavailable =
                                                isPast ||
                                                isDateUnavailable ||
                                                unavailableTimeSlots[dateKey]?.includes(timeSlot) ||
                                                false;

                                            const unavailableReason = isPast
                                                ? t("pastDateError", {
                                                      defaultValue: "This date is in the past",
                                                  })
                                                : isDateUnavailable
                                                  ? t("unavailableDay", {
                                                        defaultValue:
                                                            "This location is not open on this day",
                                                    })
                                                  : unavailableTimeSlots[dateKey]?.includes(
                                                          timeSlot,
                                                      )
                                                    ? t("unavailableSlot", {
                                                          defaultValue:
                                                              "This time slot is outside operating hours",
                                                      })
                                                    : undefined;

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
                                                        isUnavailable={isSlotUnavailable}
                                                        unavailableReason={unavailableReason}
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
                locationSchedules={locationSchedules}
            />

            {/* Debug component to display schedule information for week 21 */}
            {weekDates.length > 0 && isWeek21(weekDates[0]) && (
                <Box p="md" mt="md" style={{ backgroundColor: "#f9f9f9", borderRadius: 8 }}>
                    <Text fw={500} mb="md">
                        Debug Info - Week 21
                    </Text>

                    <Grid gutter="md">
                        <Grid.Col span={6}>
                            <Text size="sm" color="dimmed">
                                Location Schedules:
                            </Text>
                            <Code block>{JSON.stringify(locationSchedules, null, 2)}</Code>
                        </Grid.Col>

                        <Grid.Col span={6}>
                            <Text size="sm" color="dimmed">
                                Unavailable Time Slots:
                            </Text>
                            <Code block>{JSON.stringify(unavailableTimeSlots, null, 2)}</Code>
                        </Grid.Col>
                    </Grid>
                </Box>
            )}
        </>
    );
}

// Helper function to check if a date is in week 21 of 2025
function isWeek21(date: Date): boolean {
    // Week 21 of 2025 is May 19-25
    const week21Start = new Date("2025-05-19T00:00:00");
    const week21End = new Date("2025-05-25T23:59:59");

    return date >= week21Start && date <= week21End;
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
