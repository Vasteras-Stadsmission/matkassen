"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    SimpleGrid,
    Title,
    Text,
    Card,
    Select,
    Table,
    Stack,
    Box,
    Tooltip,
    Group,
    Button,
    Paper,
    ActionIcon,
    Loader,
} from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { nanoid } from "@/app/db/schema";
import {
    IconClock,
    IconCalendar,
    IconWand,
    IconCheck,
    IconX,
    IconExclamationMark,
    IconChevronDown,
    IconBuildingStore,
} from "@tabler/icons-react";
import {
    getPickupLocationsAction,
    getPickupLocationSchedulesAction,
    getPickupLocationCapacityForRangeAction,
    getLocationSlotDurationAction,
} from "../client-actions";
import { FoodParcels, FoodParcel } from "../types";
import { useTranslations } from "next-intl";

interface ValidationError {
    field: string;
    message: string;
}

interface PickupLocation {
    value: string;
    label: string;
}

interface FoodParcelsFormProps {
    data: FoodParcels;
    updateData: (data: FoodParcels) => void;
    error?: ValidationError | null;
}

// Types for location schedule
interface ScheduleDay {
    weekday: string;
    isOpen: boolean;
    openingTime: string | null;
    closingTime: string | null;
}

interface Schedule {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
    days: ScheduleDay[];
}

interface SpecialDay {
    date: Date;
    openingTime: string;
    closingTime: string;
    isClosed: boolean;
}

interface LocationSchedules {
    schedules: Schedule[];
    specialDays: SpecialDay[];
}

export default function FoodParcelsForm({ data, updateData, error }: FoodParcelsFormProps) {
    const t = useTranslations("foodParcels");

    const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [timeErrors, setTimeErrors] = useState<{ [key: string]: string }>({});
    const [bulkTimeMode, setBulkTimeMode] = useState(false);
    const [bulkStartTime, setBulkStartTime] = useState("12:00");
    const [bulkTimeError, setBulkTimeError] = useState<string | null>(null);
    // Add state for location schedules
    const [locationSchedules, setLocationSchedules] = useState<LocationSchedules | null>(null);
    // Add state for slot duration
    const [slotDuration, setSlotDuration] = useState<number>(15); // Default to 15 minutes

    // We need to actually use this variable in the component
    const [capacityNotification, setCapacityNotification] = useState<{
        date: Date;
        message: string;
        isAvailable: boolean;
    } | null>(null);

    const capacityNotificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const [capacityData, setCapacityData] = useState<{
        hasLimit: boolean;
        maxPerDay: number | null;
        dateCapacities: Record<string, number>;
    } | null>(null);
    const [loadingCapacityData, setLoadingCapacityData] = useState(false);

    const [formState, setFormState] = useState<FoodParcels>({
        pickupLocationId: data.pickupLocationId || "",
        totalCount: data.totalCount || 4,
        weekday: data.weekday || "1",
        repeatValue: data.repeatValue || "weekly",
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
        parcels: data.parcels || [],
    });

    const [selectedDates, setSelectedDates] = useState<Date[]>(
        data.parcels?.map(parcel => new Date(parcel.pickupDate)) || [],
    );

    useEffect(() => {
        if (data.pickupLocationId) {
            setLocationError(null);
        }

        setFormState(prevState => ({
            ...prevState,
            pickupLocationId: data.pickupLocationId || prevState.pickupLocationId,
            parcels: data.parcels?.length > 0 ? data.parcels : prevState.parcels,
        }));
    }, [data]);

    useEffect(() => {
        if (error && error.field === "pickupLocationId") {
            setLocationError(error.message);
        } else {
            setLocationError(null);
        }
    }, [error]);

    useEffect(() => {
        async function fetchData() {
            try {
                const locations = await getPickupLocationsAction();

                if (locations.length === 0) {
                    setPickupLocations([
                        { value: "loc1", label: "Västerås Stadsmission" },
                        { value: "loc2", label: "Klara Kyrka" },
                    ]);
                } else {
                    setPickupLocations(
                        locations.map(loc => ({
                            value: loc.id,
                            label: loc.name,
                        })),
                    );
                }
            } catch (error) {
                console.error("Error fetching pickup locations:", error);
                setPickupLocations([
                    { value: "loc1", label: "Västerås Stadsmission" },
                    { value: "loc2", label: "Klara Kyrka" },
                ]);
            }
        }

        fetchData();
    }, []);

    useEffect(() => {
        return () => {
            if (capacityNotificationTimeoutRef.current) {
                clearTimeout(capacityNotificationTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        async function fetchCapacityData() {
            if (!formState.pickupLocationId) {
                setCapacityData(null);
                return;
            }

            setLoadingCapacityData(true);

            try {
                // Set the date range for capacity check (current month + next month)
                const today = new Date();
                const startDate = new Date(today);
                startDate.setDate(1); // First day of current month

                const endDate = new Date(today);
                endDate.setMonth(endDate.getMonth() + 2, 0); // Last day of next month

                const capacity = await getPickupLocationCapacityForRangeAction(
                    formState.pickupLocationId,
                    startDate,
                    endDate,
                );

                setCapacityData(capacity);
            } catch (error) {
                console.error("Error fetching capacity data:", error);
                setCapacityData(null);
            } finally {
                setLoadingCapacityData(false);
            }
        }

        fetchCapacityData();
    }, [formState.pickupLocationId]);

    // Fetch location schedules when pickup location changes
    useEffect(() => {
        async function fetchSchedules() {
            if (!formState.pickupLocationId) {
                setLocationSchedules(null);
                return;
            }

            try {
                const schedules = await getPickupLocationSchedulesAction(
                    formState.pickupLocationId,
                );
                // Cast the schedules object to the LocationSchedules type
                // This is a temporary solution until we update the API to return the correct type
                setLocationSchedules({
                    schedules: schedules.schedules,
                    specialDays: [], // Add empty specialDays array for compatibility
                } as unknown as LocationSchedules);
            } catch (error) {
                console.error("Error fetching location schedules:", error);
                setLocationSchedules(null);
            }
        }

        fetchSchedules();
    }, [formState.pickupLocationId]);

    // Fetch slot duration when pickup location changes
    useEffect(() => {
        async function fetchSlotDuration() {
            if (!formState.pickupLocationId) {
                setSlotDuration(15); // Default to 15 minutes
                return;
            }

            try {
                const duration = await getLocationSlotDurationAction(formState.pickupLocationId);
                setSlotDuration(duration);
            } catch (error) {
                console.error("Error fetching slot duration:", error);
                setSlotDuration(15); // Default to 15 minutes in case of error
            }
        }

        fetchSlotDuration();
    }, [formState.pickupLocationId]);

    const isDateExcluded = useCallback(
        (date: Date): boolean => {
            const localDate = new Date(date);
            const dateForComparison = new Date(localDate);
            dateForComparison.setHours(0, 0, 0, 0);

            // Always allow dates that are already selected - this is critical for deselection
            const isAlreadySelected = selectedDates.some(selectedDate => {
                const selected = new Date(selectedDate);
                selected.setHours(0, 0, 0, 0);
                return selected.getTime() === dateForComparison.getTime();
            });

            if (isAlreadySelected) {
                return false; // Never exclude dates that are already selected
            }

            // Check against location schedule
            if (locationSchedules) {
                // First check if it's a special day
                const specialDay = locationSchedules.specialDays.find(
                    day =>
                        new Date(day.date).toISOString().split("T")[0] ===
                        dateForComparison.toISOString().split("T")[0],
                );

                // If it's a special day marked as closed, exclude it
                if (specialDay && specialDay.isClosed) {
                    return true; // Exclude this date
                }

                // If it's a special day that's open, allow it
                if (specialDay && !specialDay.isClosed) {
                    // Don't exclude special days that are open
                } else {
                    // Check if this day falls within any schedule and is an open day
                    const dayOfWeek = localDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
                    // Convert JavaScript day of week to our weekday enum format
                    const weekdayNames = [
                        "sunday",
                        "monday",
                        "tuesday",
                        "wednesday",
                        "thursday",
                        "friday",
                        "saturday",
                    ];
                    const weekday = weekdayNames[dayOfWeek];

                    // Check all schedules
                    let isOpenOnThisDay = false;

                    for (const schedule of locationSchedules.schedules) {
                        // Check if date is within schedule's date range
                        const startDate = new Date(schedule.startDate);
                        const endDate = new Date(schedule.endDate);
                        startDate.setHours(0, 0, 0, 0);
                        endDate.setHours(23, 59, 59, 999);

                        if (dateForComparison >= startDate && dateForComparison <= endDate) {
                            // Check if this weekday is open in this schedule
                            const dayConfig = schedule.days.find(day => day.weekday === weekday);
                            if (dayConfig && dayConfig.isOpen) {
                                isOpenOnThisDay = true;
                                break; // Found an open schedule for this day
                            }
                        }
                    }

                    // If no schedule has this day open, exclude it
                    if (!isOpenOnThisDay) {
                        return true; // Exclude this date
                    }
                }
            }

            // For unselected dates, perform the capacity check
            const year = localDate.getFullYear();
            const month = String(localDate.getMonth() + 1).padStart(2, "0");
            const day = String(localDate.getDate()).padStart(2, "0");
            const dateKey = `${year}-${month}-${day}`;
            const dateString = localDate.toDateString();

            // Count parcels from database
            const dbParcelCount = capacityData?.dateCapacities?.[dateKey] || 0;

            // Count selected dates for this same day in the current session
            const selectedDateCount = selectedDates.filter(
                selectedDate => new Date(selectedDate).toDateString() === dateString,
            ).length;

            // Calculate total count (database + selected in current session)
            const totalCount = dbParcelCount + selectedDateCount;
            const maxPerDay = capacityData?.maxPerDay || null;

            // Exclude unselected dates that would exceed capacity
            return maxPerDay !== null && totalCount >= maxPerDay;
        },
        [capacityData, selectedDates, locationSchedules],
    );

    const renderDay = (date: Date) => {
        const localDate = new Date(date);

        const year = localDate.getFullYear();
        const month = String(localDate.getMonth() + 1).padStart(2, "0");
        const day = String(localDate.getDate()).padStart(2, "0");
        const dateKey = `${year}-${month}-${day}`;
        const dateString = localDate.toDateString();

        // Count parcels from database
        const dbParcelCount = capacityData?.dateCapacities?.[dateKey] || 0;

        // Count selected dates for this same day in the current session (excluding the current date if it's selected)
        const selectedDateCount = selectedDates.filter(
            selectedDate => new Date(selectedDate).toDateString() === dateString,
        ).length;

        // Calculate total count (database + selected in current session)
        const totalCount = dbParcelCount + selectedDateCount;
        const maxPerDay = capacityData?.maxPerDay || null;

        const isFullyBooked = maxPerDay !== null && totalCount >= maxPerDay;

        const dayOfWeek = localDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateForComparison = new Date(localDate);
        dateForComparison.setHours(0, 0, 0, 0);
        const isToday = dateForComparison.getTime() === today.getTime();

        const isSelected = selectedDates.some(selectedDate => {
            const selected = new Date(selectedDate);
            selected.setHours(0, 0, 0, 0);
            return selected.getTime() === dateForComparison.getTime();
        });

        // Check if the date is unavailable due to location schedule
        let isUnavailableDueToSchedule = false;
        if (locationSchedules) {
            // First check if it's a special day
            const specialDay = locationSchedules.specialDays.find(
                day =>
                    new Date(day.date).toISOString().split("T")[0] ===
                    dateForComparison.toISOString().split("T")[0],
            );

            // If it's a special day marked as closed, it's unavailable
            if (specialDay && specialDay.isClosed) {
                isUnavailableDueToSchedule = true;
            }
            // If it's not a special day that's open, check regular schedules
            else if (!specialDay || (specialDay && specialDay.isClosed)) {
                // Check if this day falls within any schedule and is an open day
                const weekdayNames = [
                    "sunday",
                    "monday",
                    "tuesday",
                    "wednesday",
                    "thursday",
                    "friday",
                    "saturday",
                ];
                const weekday = weekdayNames[dayOfWeek];

                // Assume unavailable unless we find an open schedule
                isUnavailableDueToSchedule = true;

                for (const schedule of locationSchedules.schedules) {
                    // Check if date is within schedule's date range
                    const startDate = new Date(schedule.startDate);
                    const endDate = new Date(schedule.endDate);
                    startDate.setHours(0, 0, 0, 0);
                    endDate.setHours(23, 59, 59, 999);

                    if (dateForComparison >= startDate && dateForComparison <= endDate) {
                        // Check if this weekday is open in this schedule
                        const dayConfig = schedule.days.find(day => day.weekday === weekday);
                        if (dayConfig && dayConfig.isOpen) {
                            isUnavailableDueToSchedule = false;
                            break; // Found an open schedule for this day
                        }
                    }
                }
            }
        }

        let dayStyle: React.CSSProperties = {};

        if (isSelected) {
            return (
                <div
                    style={{
                        backgroundColor: "var(--mantine-color-blue-filled)",
                        color: "white",
                        fontWeight: 500,
                    }}
                >
                    {localDate.getDate()}
                </div>
            );
        }

        // Apply style for dates unavailable due to schedule
        if (isUnavailableDueToSchedule) {
            dayStyle = {
                backgroundColor: "var(--mantine-color-gray-2)",
                color: "var(--mantine-color-gray-6)",
                textDecoration: "line-through",
                opacity: 0.5,
                fontWeight: 400,
            };
        }

        // Fully booked dates take precedence in styling
        if (isFullyBooked) {
            dayStyle = {
                backgroundColor: "var(--mantine-color-red-0)",
                color: "var(--mantine-color-red-8)",
                textDecoration: "line-through",
                opacity: 0.7,
                fontWeight: 400,
            };
        }

        if (isWeekend && !isFullyBooked && !isUnavailableDueToSchedule) {
            dayStyle = {
                ...dayStyle,
                opacity: dayStyle.opacity || 0.8,
                fontWeight: 400,
            };
        }

        if (isToday) {
            dayStyle = {
                ...dayStyle,
                fontWeight: 700,
                textDecoration: dayStyle.textDecoration || "none",
                border: "1px solid var(--mantine-color-blue-5)",
            };
        }

        return <div style={dayStyle}>{localDate.getDate()}</div>;
    };

    const handleLocationChange = (value: string | null) => {
        setLocationError(null);

        if (value) {
            const updatedState = {
                ...formState,
                pickupLocationId: value,
            };
            setFormState(updatedState);
            updateData(updatedState);
        } else {
            handleParameterChange("pickupLocationId", value);
        }
    };

    const generateParcels = useCallback((): FoodParcel[] => {
        // First preserve existing parcels by their ID
        const existingParcelsById = new Map();
        formState.parcels.forEach(parcel => {
            if (parcel.id) {
                existingParcelsById.set(parcel.id, parcel);
            }
        });

        // Track which date strings we've already processed
        const processedDates = new Set();

        return selectedDates.map(date => {
            const dateString = new Date(date).toDateString();

            // Find an existing parcel for this exact date if there is one
            const existingParcel = formState.parcels.find(
                p =>
                    new Date(p.pickupDate).toDateString() === dateString &&
                    p.id &&
                    !processedDates.has(p.id),
            );

            if (existingParcel && existingParcel.id) {
                // Mark this ID as processed so we don't reuse it
                processedDates.add(existingParcel.id);
                return existingParcel;
            }

            // Default start time to noon
            const earliestTime = new Date(date);
            earliestTime.setHours(12, 0, 0);

            // Calculate end time based on slot duration
            const latestTime = new Date(earliestTime);
            latestTime.setMinutes(latestTime.getMinutes() + slotDuration);

            // Always generate a new ID for new parcels
            return {
                id: nanoid(8),
                pickupDate: new Date(date),
                pickupEarliestTime: earliestTime,
                pickupLatestTime: latestTime,
            };
        });
    }, [selectedDates, formState.parcels, slotDuration]);

    const handleDatesChange = (dates: Date[]) => {
        // If the user is trying to add a new date (length has increased)
        if (dates.length > selectedDates.length) {
            const addedDate = dates.find(
                newDate =>
                    !selectedDates.some(
                        existingDate =>
                            new Date(existingDate).toDateString() ===
                            new Date(newDate).toDateString(),
                    ),
            );

            if (addedDate) {
                const localDate = new Date(addedDate);
                const year = localDate.getFullYear();
                const month = String(localDate.getMonth() + 1).padStart(2, "0");
                const day = String(localDate.getDate()).padStart(2, "0");
                const dateKey = `${year}-${month}-${day}`;
                const dateString = localDate.toDateString();

                // Count parcels from database
                const dbParcelCount = capacityData?.dateCapacities?.[dateKey] || 0;

                // Count existing selected dates for this same day
                const existingDateCount = selectedDates.filter(
                    selectedDate => new Date(selectedDate).toDateString() === dateString,
                ).length;

                // Total count including the new date being added (+1)
                const totalCount = dbParcelCount + existingDateCount + 1;
                const maxPerDay = capacityData?.maxPerDay || null;
                const isAvailable = maxPerDay === null || totalCount <= maxPerDay;

                // If the date is unavailable (at or over capacity), don't add it
                if (!isAvailable && maxPerDay !== null) {
                    // Revert the selection by removing the date that was just added
                    setTimeout(() => {
                        setSelectedDates(prevDates =>
                            prevDates.filter(date => new Date(date).toDateString() !== dateString),
                        );

                        // Optionally show a notification that the date is at capacity
                        setCapacityNotification({
                            date: localDate,
                            message: `Max antal (${maxPerDay}) matkassar bokade för detta datum`,
                            isAvailable: false,
                        });

                        if (capacityNotificationTimeoutRef.current) {
                            clearTimeout(capacityNotificationTimeoutRef.current);
                        }

                        capacityNotificationTimeoutRef.current = setTimeout(() => {
                            setCapacityNotification(null);
                        }, 5000);
                    }, 0);

                    return;
                }
            }
        }

        // If we got here, the selection change is valid
        setSelectedDates(dates);
    };

    const handleParameterChange = (field: keyof FoodParcels, value: unknown) => {
        setFormState(prev => ({ ...prev, [field]: value }));
    };

    const applyChanges = useCallback(() => {
        const parcels = generateParcels();
        const updatedState = {
            ...formState,
            parcels,
            totalCount: selectedDates.length,
        };

        if (
            JSON.stringify(updatedState.parcels) !== JSON.stringify(formState.parcels) ||
            updatedState.totalCount !== formState.totalCount
        ) {
            setFormState(updatedState);
            updateData(updatedState);
        }
    }, [formState, generateParcels, updateData, selectedDates.length]);

    const updateParcelTime = (index: number, field: keyof FoodParcel, time: Date) => {
        // Only allow updating the start time (pickupEarliestTime)
        if (field === "pickupEarliestTime") {
            const updatedParcels = [...formState.parcels];
            const parcel = updatedParcels[index];

            // Set the new start time
            const newStartTime = new Date(time);

            // Calculate the new end time based on slot duration
            const newEndTime = new Date(newStartTime);
            newEndTime.setMinutes(newEndTime.getMinutes() + slotDuration);

            // Clear any existing errors
            const newTimeErrors = { ...timeErrors };
            delete newTimeErrors[`${index}-pickupEarliestTime`];
            delete newTimeErrors[`${index}-pickupLatestTime`];

            // Update the parcel with both new times
            updatedParcels[index] = {
                ...parcel,
                pickupEarliestTime: newStartTime,
                pickupLatestTime: newEndTime,
            };

            const updatedState = { ...formState, parcels: updatedParcels };
            setFormState(updatedState);
            updateData(updatedState);
            setTimeErrors(newTimeErrors);
        }
    };

    useEffect(() => {
        if (
            data.parcels?.length > 0 &&
            JSON.stringify(data.parcels) !== JSON.stringify(formState.parcels)
        ) {
            setSelectedDates(data.parcels.map(parcel => new Date(parcel.pickupDate)));
        }
    }, [data.parcels, formState.parcels]);

    useEffect(() => {
        if (selectedDates.length > 0) {
            applyChanges();
        }
    }, [selectedDates, applyChanges]);

    const applyBulkTimeUpdate = () => {
        // Parse the time from the input
        const startTimeParts = bulkStartTime.split(":").map(part => parseInt(part, 10));

        // Validate the time parts - should be properly formatted since we're using dropdowns
        // Default to 0 if parsing fails
        const hours = !isNaN(startTimeParts[0]) ? startTimeParts[0] : 0;
        const minutes = !isNaN(startTimeParts[1]) ? startTimeParts[1] : 0;

        // Make sure minutes are rounded to 15-minute intervals
        const roundedMinutes = Math.floor(minutes / 15) * 15;

        setBulkTimeError(null);

        // Calculate end time based on slot duration for each parcel
        const updatedParcels = formState.parcels.map(parcel => {
            // Set the new start time
            const newStartTime = new Date(parcel.pickupDate);
            newStartTime.setHours(hours, roundedMinutes, 0, 0);

            // Calculate the end time based on slot duration
            const newEndTime = new Date(newStartTime);
            newEndTime.setMinutes(newEndTime.getMinutes() + slotDuration);

            return {
                ...parcel,
                pickupEarliestTime: newStartTime,
                pickupLatestTime: newEndTime,
            };
        });

        const updatedState = { ...formState, parcels: updatedParcels };
        setFormState(updatedState);
        updateData(updatedState);

        setBulkTimeMode(false);
        setTimeErrors({});
    };

    const cancelBulkTimeEdit = () => {
        setBulkTimeMode(false);
        setBulkTimeError(null);
    };

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                {t("title")}
            </Title>
            <Text style={{ color: "var(--mantine-color-dimmed)" }} size="sm" mb="lg">
                {t("description")}
            </Text>

            {/* Show capacity notification when available */}
            {capacityNotification && (
                <Paper
                    p="xs"
                    withBorder
                    mb="md"
                    style={{
                        backgroundColor: capacityNotification.isAvailable
                            ? "var(--mantine-color-green-0)"
                            : "var(--mantine-color-red-0)",
                        color: capacityNotification.isAvailable
                            ? "var(--mantine-color-green-8)"
                            : "var(--mantine-color-red-8)",
                    }}
                >
                    <Group>
                        {capacityNotification.isAvailable ? (
                            <IconCheck size="1rem" />
                        ) : (
                            <IconExclamationMark size="1rem" />
                        )}
                        <Text size="sm">{capacityNotification.message}</Text>
                    </Group>
                </Paper>
            )}

            <Title order={5} mb="sm">
                {t("settings")}
            </Title>

            <SimpleGrid cols={{ base: 1, sm: 1 }} spacing="md" mb="lg">
                <Select
                    label={t("pickupLocation")}
                    placeholder={t("selectLocation")}
                    data={pickupLocations}
                    value={formState.pickupLocationId}
                    onChange={handleLocationChange}
                    withAsterisk
                    error={locationError}
                />

                <Stack>
                    <Text fw={500} size="sm" mb={7}>
                        {t("selectDates")}{" "}
                        <span style={{ color: "var(--mantine-color-red-6)" }}>*</span>
                    </Text>

                    <Box
                        style={{
                            height: "290px",
                            overflow: "hidden",
                            position: "relative",
                        }}
                    >
                        <DatePicker
                            type="multiple"
                            value={selectedDates}
                            onChange={handleDatesChange}
                            minDate={new Date()}
                            numberOfColumns={2}
                            renderDay={renderDay}
                            excludeDate={isDateExcluded as (date: Date) => boolean}
                        />

                        {loadingCapacityData && formState.pickupLocationId && (
                            <Box
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: "rgba(255, 255, 255, 0.7)",
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    zIndex: 5,
                                }}
                            >
                                <Stack align="center" gap="xs">
                                    <Loader size="md" />
                                    <Text
                                        size="sm"
                                        style={{ color: "var(--mantine-color-dimmed)" }}
                                    >
                                        {t("loadingAvailability")}
                                    </Text>
                                </Stack>
                            </Box>
                        )}

                        {!formState.pickupLocationId && (
                            <Tooltip
                                label={t("selectLocationFirst")}
                                position="bottom"
                                withArrow
                                opened
                                style={{ backgroundColor: "var(--mantine-color-blue-6)" }}
                            >
                                <Box
                                    style={{
                                        position: "absolute",
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        background: "rgba(255, 255, 255, 0.5)",
                                        backdropFilter: "blur(2px)",
                                        zIndex: 5,
                                        cursor: "not-allowed",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    <IconExclamationMark
                                        size={48}
                                        style={{
                                            color: "var(--mantine-color-blue-6)",
                                            opacity: 0.5,
                                        }}
                                    />
                                </Box>
                            </Tooltip>
                        )}
                    </Box>
                    <Text size="xs" style={{ color: "var(--mantine-color-dimmed)" }}>
                        {t("selectDatesHint")}
                    </Text>

                    {/* Add legend to explain calendar styling */}
                    <Box mt="sm">
                        <Group gap="md">
                            <Group gap="xs">
                                <Box
                                    style={{
                                        width: "14px",
                                        height: "14px",
                                        backgroundColor: "var(--mantine-color-gray-2)",
                                        opacity: 0.5,
                                    }}
                                ></Box>
                                <Text size="xs" style={{ color: "var(--mantine-color-dimmed)" }}>
                                    {t("calendar.unavailableClosedDay")}
                                </Text>
                            </Group>
                            <Group gap="xs">
                                <Box
                                    style={{
                                        width: "14px",
                                        height: "14px",
                                        backgroundColor: "var(--mantine-color-red-0)",
                                        opacity: 0.7,
                                    }}
                                ></Box>
                                <Text size="xs" style={{ color: "var(--mantine-color-dimmed)" }}>
                                    {t("calendar.fullyBooked")}
                                </Text>
                            </Group>
                            <Group gap="xs">
                                <Box
                                    style={{
                                        width: "14px",
                                        height: "14px",
                                        backgroundColor: "var(--mantine-color-blue-filled)",
                                        color: "white",
                                    }}
                                ></Box>
                                <Text size="xs" style={{ color: "var(--mantine-color-dimmed)" }}>
                                    {t("calendar.selected")}
                                </Text>
                            </Group>
                        </Group>
                    </Box>
                </Stack>
            </SimpleGrid>

            {formState.parcels.length > 0 && (
                <>
                    <Group justify="space-between" align="center">
                        <Title order={5} mt="md" mb="sm">
                            {t("title")} ({selectedDates.length})
                        </Title>

                        {!bulkTimeMode ? (
                            <Button
                                leftSection={<IconWand size="1rem" />}
                                variant="light"
                                style={{
                                    backgroundColor: "var(--mantine-color-indigo-1)",
                                    color: "var(--mantine-color-indigo-6)",
                                }}
                                size="xs"
                                onClick={() => setBulkTimeMode(true)}
                            >
                                {t("setBulkTimes")}
                            </Button>
                        ) : (
                            <Text size="xs" style={{ color: "var(--mantine-color-dimmed)" }}>
                                {t("editingAllTimes")}
                            </Text>
                        )}
                    </Group>

                    {bulkTimeMode ? (
                        <Paper p="md" withBorder radius="md" mb="md">
                            <Stack>
                                <Text fw={500} size="sm">
                                    {t("bulkTimeHint")}
                                </Text>

                                {bulkTimeError && (
                                    <Text size="xs" style={{ color: "var(--mantine-color-red-6)" }}>
                                        {bulkTimeError}
                                    </Text>
                                )}

                                <Group align="flex-end" gap="lg">
                                    <Box style={{ flex: "0 0 auto" }}>
                                        <Text size="xs" fw={500} pb={5}>
                                            {t("table.pickupTime")}
                                        </Text>
                                        <Group gap="sm" align="center">
                                            <Group
                                                gap={0}
                                                align="center"
                                                style={{
                                                    padding: "4px 10px",
                                                    border: bulkTimeError
                                                        ? "1px solid var(--mantine-color-red-6)"
                                                        : "1px solid var(--mantine-color-gray-4)",
                                                    borderRadius: "var(--mantine-radius-sm)",
                                                    backgroundColor: "var(--mantine-color-white)",
                                                    width: "fit-content",
                                                }}
                                            >
                                                <IconClock
                                                    size="1rem"
                                                    style={{
                                                        marginRight: "6px",
                                                        color: bulkTimeError
                                                            ? "var(--mantine-color-red-6)"
                                                            : "var(--mantine-color-gray-6)",
                                                    }}
                                                />
                                                <Select
                                                    data={Array.from({ length: 24 }, (_, i) => ({
                                                        value: String(i).padStart(2, "0"),
                                                        label: String(i).padStart(2, "0"),
                                                    }))}
                                                    value={bulkStartTime.split(":")[0] || "00"}
                                                    onChange={value => {
                                                        if (value) {
                                                            const minutes =
                                                                bulkStartTime.split(":")[1] || "00";
                                                            setBulkStartTime(`${value}:${minutes}`);
                                                        }
                                                    }}
                                                    size="xs"
                                                    styles={{
                                                        input: {
                                                            width: "38px",
                                                            textAlign: "center",
                                                            fontWeight: 500,
                                                            border: "none",
                                                            background: "transparent",
                                                            padding: "0 2px",
                                                        },
                                                        dropdown: { minWidth: "70px" },
                                                    }}
                                                    rightSection={
                                                        <div style={{ pointerEvents: "none" }}>
                                                            <IconChevronDown
                                                                size="0.8rem"
                                                                style={{
                                                                    color: "var(--mantine-color-blue-6)",
                                                                }}
                                                            />
                                                        </div>
                                                    }
                                                    rightSectionWidth={15}
                                                    aria-label="Hour"
                                                />
                                                <Text fw={500}>:</Text>
                                                <Select
                                                    data={Array.from({ length: 4 }, (_, i) => ({
                                                        value: String(i * 15).padStart(2, "0"),
                                                        label: String(i * 15).padStart(2, "0"),
                                                    }))}
                                                    value={(() => {
                                                        const minsStr =
                                                            bulkStartTime.split(":")[1] || "00";
                                                        const mins = parseInt(minsStr, 10);
                                                        // Round to nearest 15 min increment
                                                        const roundedMins =
                                                            Math.floor(mins / 15) * 15;
                                                        return roundedMins
                                                            .toString()
                                                            .padStart(2, "0");
                                                    })()}
                                                    onChange={value => {
                                                        if (value) {
                                                            const hours =
                                                                bulkStartTime.split(":")[0] || "00";
                                                            setBulkStartTime(`${hours}:${value}`);
                                                        }
                                                    }}
                                                    size="xs"
                                                    styles={{
                                                        input: {
                                                            width: "38px",
                                                            textAlign: "center",
                                                            fontWeight: 500,
                                                            border: "none",
                                                            background: "transparent",
                                                            padding: "0 2px",
                                                        },
                                                        dropdown: { minWidth: "70px" },
                                                    }}
                                                    rightSection={
                                                        <div style={{ pointerEvents: "none" }}>
                                                            <IconChevronDown
                                                                size="0.8rem"
                                                                style={{
                                                                    color: "var(--mantine-color-blue-6)",
                                                                }}
                                                            />
                                                        </div>
                                                    }
                                                    rightSectionWidth={15}
                                                    aria-label="Minute"
                                                />
                                            </Group>

                                            <Text
                                                fw={500}
                                                size="sm"
                                                style={{ color: "var(--mantine-color-gray-6)" }}
                                            >
                                                →
                                            </Text>

                                            <Group
                                                gap={0}
                                                align="center"
                                                style={{
                                                    border: "1px solid var(--mantine-color-gray-3)",
                                                    borderRadius: "4px",
                                                    padding: "6px 10px",
                                                    backgroundColor: "var(--mantine-color-gray-1)",
                                                    width: "fit-content",
                                                }}
                                            >
                                                <IconClock
                                                    size="0.9rem"
                                                    style={{
                                                        marginRight: "6px",
                                                        color: "var(--mantine-color-gray-6)",
                                                    }}
                                                />
                                                <Text
                                                    fw={500}
                                                    style={{
                                                        fontSize: "0.9em",
                                                        color: "var(--mantine-color-gray-8)",
                                                    }}
                                                >
                                                    {(() => {
                                                        const [hours, minutes] = bulkStartTime
                                                            .split(":")
                                                            .map(n => parseInt(n, 10));
                                                        const endMinutes = minutes + slotDuration;
                                                        const endHours =
                                                            hours + Math.floor(endMinutes / 60);
                                                        const finalMinutes = endMinutes % 60;
                                                        return `${endHours.toString().padStart(2, "0")}:${finalMinutes.toString().padStart(2, "0")}`;
                                                    })()}
                                                </Text>
                                            </Group>
                                        </Group>
                                    </Box>

                                    <Group gap="sm">
                                        <Button
                                            size="xs"
                                            leftSection={<IconCheck size="1rem" />}
                                            style={{
                                                backgroundColor: "var(--mantine-color-teal-6)",
                                                color: "white",
                                            }}
                                            onClick={applyBulkTimeUpdate}
                                        >
                                            {t("time.updateAll")}
                                        </Button>

                                        <ActionIcon
                                            size="lg"
                                            variant="subtle"
                                            style={{ color: "var(--mantine-color-gray-6)" }}
                                            onClick={cancelBulkTimeEdit}
                                        >
                                            <IconX size="1rem" />
                                        </ActionIcon>
                                    </Group>
                                </Group>
                            </Stack>
                        </Paper>
                    ) : null}

                    <Text size="sm" mb="md" style={{ color: "var(--mantine-color-dimmed)" }}>
                        {bulkTimeMode ? t("bulkTimeHint") : t("individualTimeHint")}
                    </Text>

                    {/* Slot Duration Info - Always visible */}
                    <Group justify="space-between" align="center" mb="md">
                        <Paper
                            p="xs"
                            radius="md"
                            style={{
                                backgroundColor: "var(--mantine-color-gray-0)",
                                border: "1px solid var(--mantine-color-gray-3)",
                                display: "inline-block",
                            }}
                        >
                            <Group gap="xs">
                                <IconClock
                                    size="1rem"
                                    style={{ color: "var(--mantine-color-blue-6)" }}
                                />
                                <Text size="sm" fw={500}>
                                    {t("slotDuration", { duration: slotDuration.toString() })}
                                </Text>
                            </Group>
                        </Paper>
                    </Group>

                    <Paper radius="md" withBorder shadow="xs">
                        <Table striped={false} highlightOnHover verticalSpacing="sm">
                            <Table.Thead>
                                <Table.Tr
                                    style={{ backgroundColor: "var(--mantine-color-gray-0)" }}
                                >
                                    <Table.Th style={{ width: "20%", textAlign: "left" }}>
                                        {t("table.date")}
                                    </Table.Th>
                                    <Table.Th style={{ width: "50%", textAlign: "left" }}>
                                        {t("table.pickupTime")}
                                    </Table.Th>
                                    <Table.Th style={{ width: "30%", textAlign: "left" }}>
                                        {t("table.facilityHours")}
                                    </Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {formState.parcels.map((parcel, index) => {
                                    // Get opening hours data
                                    const date = new Date(parcel.pickupDate);
                                    const dateString = date.toISOString().split("T")[0];
                                    const weekdayNames = [
                                        "sunday",
                                        "monday",
                                        "tuesday",
                                        "wednesday",
                                        "thursday",
                                        "friday",
                                        "saturday",
                                    ];
                                    const weekday = weekdayNames[date.getDay()];

                                    let openingHours = null;
                                    // Check for special day schedule
                                    if (locationSchedules) {
                                        const specialDay = locationSchedules.specialDays.find(
                                            day =>
                                                new Date(day.date).toISOString().split("T")[0] ===
                                                dateString,
                                        );

                                        if (specialDay && !specialDay.isClosed) {
                                            openingHours = `${specialDay.openingTime} - ${specialDay.closingTime}`;
                                        } else {
                                            // Look for regular schedule
                                            for (const schedule of locationSchedules.schedules) {
                                                const startDate = new Date(schedule.startDate);
                                                const endDate = new Date(schedule.endDate);

                                                if (date >= startDate && date <= endDate) {
                                                    const dayConfig = schedule.days.find(
                                                        day => day.weekday === weekday,
                                                    );
                                                    if (
                                                        dayConfig &&
                                                        dayConfig.isOpen &&
                                                        dayConfig.openingTime &&
                                                        dayConfig.closingTime
                                                    ) {
                                                        openingHours = `${dayConfig.openingTime} - ${dayConfig.closingTime}`;
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    return (
                                        <Table.Tr
                                            key={parcel.id ? parcel.id : `index-${index}`}
                                            style={{
                                                borderBottom:
                                                    index !== formState.parcels.length - 1
                                                        ? "1px solid var(--mantine-color-gray-2)"
                                                        : "none",
                                            }}
                                        >
                                            {/* Date column */}
                                            <Table.Td
                                                p="xs"
                                                pl="sm"
                                                style={{ verticalAlign: "middle" }}
                                            >
                                                <Group gap="xs" align="center">
                                                    <IconCalendar
                                                        size="1rem"
                                                        style={{
                                                            color: "var(--mantine-color-gray-6)",
                                                        }}
                                                    />
                                                    <Text
                                                        fw={500}
                                                        style={{
                                                            color: "var(--mantine-color-gray-8)",
                                                        }}
                                                    >
                                                        {new Date(
                                                            parcel.pickupDate,
                                                        ).toLocaleDateString("sv-SE", {
                                                            day: "numeric",
                                                            month: "short",
                                                            year: "numeric",
                                                        })}
                                                    </Text>
                                                </Group>
                                            </Table.Td>

                                            {/* Time column */}
                                            <Table.Td p="xs" style={{ verticalAlign: "middle" }}>
                                                <Tooltip
                                                    label={
                                                        timeErrors[`${index}-pickupEarliestTime`] ||
                                                        timeErrors[`${index}-pickupLatestTime`]
                                                    }
                                                    style={{
                                                        color: "white",
                                                        backgroundColor:
                                                            "var(--mantine-color-red-6)",
                                                    }}
                                                    position="top"
                                                    withArrow
                                                    opened={
                                                        !!(
                                                            timeErrors[
                                                                `${index}-pickupEarliestTime`
                                                            ] ||
                                                            timeErrors[`${index}-pickupLatestTime`]
                                                        )
                                                    }
                                                    withinPortal
                                                >
                                                    <Group gap="md" align="center">
                                                        {/* Time selector */}
                                                        <Group
                                                            style={{
                                                                border:
                                                                    timeErrors[
                                                                        `${index}-pickupEarliestTime`
                                                                    ] ||
                                                                    timeErrors[
                                                                        `${index}-pickupLatestTime`
                                                                    ]
                                                                        ? "1px solid var(--mantine-color-red-5)"
                                                                        : "1px solid var(--mantine-color-gray-3)",
                                                                borderRadius: "4px",
                                                                padding: "0px",
                                                                backgroundColor: "white",
                                                                display: "flex",
                                                                alignItems: "center",
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    padding: "6px 10px",
                                                                }}
                                                            >
                                                                <IconClock
                                                                    size="0.9rem"
                                                                    style={{
                                                                        marginRight: "6px",
                                                                        color:
                                                                            timeErrors[
                                                                                `${index}-pickupEarliestTime`
                                                                            ] ||
                                                                            timeErrors[
                                                                                `${index}-pickupLatestTime`
                                                                            ]
                                                                                ? "var(--mantine-color-red-6)"
                                                                                : "var(--mantine-color-gray-6)",
                                                                    }}
                                                                />

                                                                <Group gap={0} align="center">
                                                                    <Select
                                                                        data={Array.from(
                                                                            { length: 24 },
                                                                            (_, i) => ({
                                                                                value: String(
                                                                                    i,
                                                                                ).padStart(2, "0"),
                                                                                label: String(
                                                                                    i,
                                                                                ).padStart(2, "0"),
                                                                            }),
                                                                        )}
                                                                        value={parcel.pickupEarliestTime
                                                                            .getHours()
                                                                            .toString()
                                                                            .padStart(2, "0")}
                                                                        onChange={value => {
                                                                            if (value) {
                                                                                const newDate =
                                                                                    new Date(
                                                                                        parcel.pickupEarliestTime,
                                                                                    );
                                                                                newDate.setHours(
                                                                                    parseInt(
                                                                                        value,
                                                                                        10,
                                                                                    ),
                                                                                );
                                                                                updateParcelTime(
                                                                                    index,
                                                                                    "pickupEarliestTime",
                                                                                    newDate,
                                                                                );
                                                                            }
                                                                        }}
                                                                        size="sm"
                                                                        styles={{
                                                                            input: {
                                                                                width: "38px",
                                                                                textAlign: "center",
                                                                                fontWeight: 500,
                                                                                border: "none",
                                                                                background:
                                                                                    "transparent",
                                                                                padding: "0px",
                                                                                cursor: "pointer",
                                                                                minHeight: "unset",
                                                                                height: "28px",
                                                                            },
                                                                            dropdown: {
                                                                                minWidth: "70px",
                                                                            },
                                                                            wrapper: {
                                                                                margin: 0,
                                                                            },
                                                                        }}
                                                                        rightSection={
                                                                            <div
                                                                                style={{
                                                                                    pointerEvents:
                                                                                        "none",
                                                                                }}
                                                                            >
                                                                                <IconChevronDown
                                                                                    size="0.8rem"
                                                                                    style={{
                                                                                        color: "var(--mantine-color-blue-6)",
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                        }
                                                                        rightSectionWidth={15}
                                                                        aria-label="Hour"
                                                                    />
                                                                    <Text fw={500}>:</Text>
                                                                    <Select
                                                                        data={Array.from(
                                                                            { length: 4 },
                                                                            (_, i) => ({
                                                                                value: String(
                                                                                    i * 15,
                                                                                ).padStart(2, "0"),
                                                                                label: String(
                                                                                    i * 15,
                                                                                ).padStart(2, "0"),
                                                                            }),
                                                                        )}
                                                                        value={(() => {
                                                                            const mins =
                                                                                parcel.pickupEarliestTime.getMinutes();
                                                                            // Round to nearest 15 min increment
                                                                            const roundedMins =
                                                                                Math.floor(
                                                                                    mins / 15,
                                                                                ) * 15;
                                                                            return roundedMins
                                                                                .toString()
                                                                                .padStart(2, "0");
                                                                        })()}
                                                                        onChange={value => {
                                                                            if (value) {
                                                                                const newDate =
                                                                                    new Date(
                                                                                        parcel.pickupEarliestTime,
                                                                                    );
                                                                                newDate.setMinutes(
                                                                                    parseInt(
                                                                                        value,
                                                                                        10,
                                                                                    ),
                                                                                );
                                                                                updateParcelTime(
                                                                                    index,
                                                                                    "pickupEarliestTime",
                                                                                    newDate,
                                                                                );
                                                                            }
                                                                        }}
                                                                        size="sm"
                                                                        styles={{
                                                                            input: {
                                                                                width: "38px",
                                                                                textAlign: "center",
                                                                                fontWeight: 500,
                                                                                border: "none",
                                                                                background:
                                                                                    "transparent",
                                                                                padding: "0px",
                                                                                cursor: "pointer",
                                                                                minHeight: "unset",
                                                                                height: "28px",
                                                                            },
                                                                            dropdown: {
                                                                                minWidth: "70px",
                                                                            },
                                                                            wrapper: {
                                                                                margin: 0,
                                                                            },
                                                                        }}
                                                                        rightSection={
                                                                            <div
                                                                                style={{
                                                                                    pointerEvents:
                                                                                        "none",
                                                                                }}
                                                                            >
                                                                                <IconChevronDown
                                                                                    size="0.8rem"
                                                                                    style={{
                                                                                        color: "var(--mantine-color-blue-6)",
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                        }
                                                                        rightSectionWidth={15}
                                                                        aria-label="Minute"
                                                                    />
                                                                </Group>
                                                            </div>
                                                        </Group>

                                                        <Text
                                                            fw={500}
                                                            size="sm"
                                                            style={{
                                                                color: "var(--mantine-color-gray-6)",
                                                            }}
                                                        >
                                                            →
                                                        </Text>

                                                        <Group
                                                            gap={0}
                                                            align="center"
                                                            style={{
                                                                border: "1px solid var(--mantine-color-gray-3)",
                                                                borderRadius: "4px",
                                                                padding: "6px 10px",
                                                                backgroundColor:
                                                                    "var(--mantine-color-gray-1)",
                                                                width: "fit-content",
                                                            }}
                                                        >
                                                            <IconClock
                                                                size="0.9rem"
                                                                style={{
                                                                    marginRight: "6px",
                                                                    color: "var(--mantine-color-gray-6)",
                                                                }}
                                                            />
                                                            <Text
                                                                fw={500}
                                                                style={{
                                                                    fontSize: "0.9em",
                                                                    color: "var(--mantine-color-gray-8)",
                                                                }}
                                                            >
                                                                {`${parcel.pickupLatestTime.getHours().toString().padStart(2, "0")}:${parcel.pickupLatestTime.getMinutes().toString().padStart(2, "0")}`}
                                                            </Text>
                                                        </Group>
                                                    </Group>
                                                </Tooltip>
                                            </Table.Td>

                                            {/* Facility hours column */}
                                            <Table.Td p="xs" style={{ verticalAlign: "middle" }}>
                                                {openingHours && (
                                                    <Group gap="xs">
                                                        <IconBuildingStore
                                                            size="0.9rem"
                                                            style={{
                                                                color: "var(--mantine-color-gray-6)",
                                                            }}
                                                        />
                                                        <Text size="sm" c="dimmed" fw={500}>
                                                            {openingHours}
                                                        </Text>
                                                    </Group>
                                                )}
                                            </Table.Td>
                                        </Table.Tr>
                                    );
                                })}
                            </Table.Tbody>
                        </Table>
                    </Paper>
                </>
            )}
        </Card>
    );
}
