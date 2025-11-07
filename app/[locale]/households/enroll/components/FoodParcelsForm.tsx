"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { showNotification } from "@mantine/notifications";
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
    Modal,
    Alert,
} from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { toStockholmTime, minutesToHHmm, subtractMinutesFromHHmm } from "@/app/utils/date-utils";
import {
    IconClock,
    IconCalendar,
    IconWand,
    IconCheck,
    IconX,
    IconExclamationMark,
    IconBuildingStore,
    IconAlertCircle,
} from "@tabler/icons-react";
import { getTimeRange, TimeGrid } from "@mantine/dates";
import {
    getPickupLocationsAction,
    getPickupLocationSchedulesAction,
    getPickupLocationCapacityForRangeAction,
    getLocationSlotDurationAction,
} from "../client-actions";
import { FoodParcels, FoodParcel } from "../types";
import { useTranslations } from "next-intl";
import { TranslationFunction } from "../../../types";
import { type LocationScheduleInfo, type LocationScheduleDay } from "@/app/[locale]/schedule/types";

interface ValidationError {
    field: string;
    message: string;
    code?: string;
}

interface PickupLocation {
    value: string;
    label: string;
}

interface FoodParcelsFormProps {
    data: FoodParcels;
    updateData: (data: FoodParcels) => void;
    error?: ValidationError | null;
    validationErrors?: Array<{
        field: string;
        code: string;
        message: string;
        details?: Record<string, unknown>;
    }>;
}

export default function FoodParcelsForm({
    data,
    updateData,
    error,
    validationErrors,
}: FoodParcelsFormProps) {
    const t = useTranslations("foodParcels") as TranslationFunction;
    const tCommon = useTranslations("handoutLocations");

    const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [timeErrors, setTimeErrors] = useState<{ [key: string]: string }>({});
    const [bulkTimeMode, setBulkTimeMode] = useState(false);
    const [bulkStartTime, setBulkStartTime] = useState("12:00");
    const [bulkTimeError, setBulkTimeError] = useState<string | null>(null);
    // Add state for location schedules
    const [locationSchedules, setLocationSchedules] = useState<LocationScheduleInfo | null>(null);
    // Add state for slot duration
    const [slotDuration, setSlotDuration] = useState<number>(15); // Default to 15 minutes

    // Derive opening hours for dates from location schedules
    const getOpeningHoursForDate = useCallback(
        (date: Date): { openingTime: string; closingTime: string } | null => {
            if (!locationSchedules) return null;

            const dateOnly = new Date(date);
            dateOnly.setHours(0, 0, 0, 0);

            // Aggregate regular schedules covering this date
            // Note: Sunday is 0, Saturday is 6
            const weekdayNames = [
                "sunday",
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday",
            ];
            const weekday = weekdayNames[dateOnly.getDay()];

            let earliest: string | null = null;
            let latest: string | null = null;

            for (const schedule of locationSchedules.schedules) {
                const start = new Date(schedule.startDate);
                const end = new Date(schedule.endDate);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);

                if (dateOnly < start || dateOnly > end) continue;

                const day = schedule.days.find((d: LocationScheduleDay) => d.weekday === weekday);
                if (!day || !day.isOpen || !day.openingTime || !day.closingTime) continue;

                if (earliest === null || day.openingTime < earliest) earliest = day.openingTime;
                if (latest === null || day.closingTime > latest) latest = day.closingTime;
            }

            if (!earliest || !latest) return null;
            // Normalize to HH:MM (strip seconds) for consistent UI and calculations downstream
            const trim = (t: string) => (t.length >= 5 ? t.substring(0, 5) : t);
            return { openingTime: trim(earliest), closingTime: trim(latest) };
        },
        [locationSchedules],
    );

    const getCommonOpeningHoursForDates = useCallback(
        (dates: Date[]): { openingTime: string; closingTime: string } | null => {
            if (!dates.length) return null;
            let maxOpening: string | null = null;
            let minClosing: string | null = null;

            for (const date of dates) {
                const range = getOpeningHoursForDate(date);
                if (!range) return null; // any closed date breaks common range

                const { openingTime, closingTime } = range;
                if (maxOpening === null || openingTime > maxOpening) maxOpening = openingTime;
                if (minClosing === null || closingTime < minClosing) minClosing = closingTime;
            }

            if (!maxOpening || !minClosing) return null;
            if (maxOpening >= minClosing) return null;
            return { openingTime: maxOpening, closingTime: minClosing };
        },
        [getOpeningHoursForDate],
    );

    const [capacityNotification, setCapacityNotification] = useState<{
        date: Date;
        message: string;
        isAvailable: boolean;
    } | null>(null);

    const capacityNotificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const autoSelectedStateRef = useRef<FoodParcels | null>(null);

    const [capacityData, setCapacityData] = useState<{
        hasLimit: boolean;
        maxPerDay: number | null;
        dateCapacities: Record<string, number>;
    } | null>(null);
    const [loadingCapacityData, setLoadingCapacityData] = useState(false);

    // State for time selection modal
    const [timeModalOpened, setTimeModalOpened] = useState(false);
    const [selectedParcelIndex, setSelectedParcelIndex] = useState<number | null>(null);

    // Use shared date utils from app/utils/date-utils

    // moved below where formState is declared

    // Check if a date is in the past (entire day) using Stockholm timezone
    const isPastDate = useCallback((date: Date) => {
        const stockholmToday = toStockholmTime(new Date());
        stockholmToday.setHours(0, 0, 0, 0);

        const stockholmCompareDate = toStockholmTime(date);
        stockholmCompareDate.setHours(0, 0, 0, 0);

        return stockholmCompareDate < stockholmToday;
    }, []);

    const [formState, setFormState] = useState<FoodParcels>({
        pickupLocationId: data.pickupLocationId || "",
        parcels: data.parcels || [],
    });

    const [selectedDates, setSelectedDates] = useState<Date[]>(
        data.parcels?.map(parcel => new Date(parcel.pickupDate)) || [],
    );

    // Precompute common opening hours for bulk selection (needs formState)
    const bulkCommonRange = useMemo(() => {
        if (!locationSchedules || formState.parcels.length === 0) return null;
        // Consider only non-past dates for bulk operations
        const dates = formState.parcels
            .map(p => new Date(p.pickupDate))
            .filter(d => !isPastDate(d));
        if (dates.length === 0) return null;
        return getCommonOpeningHoursForDates(dates);
    }, [locationSchedules, formState.parcels, getCommonOpeningHoursForDates, isPastDate]);

    // Check whether all selected parcel dates share identical opening/closing times
    const doAllSelectedDatesShareSameHours = useCallback((): {
        same: boolean;
        representative?: { openingTime: string; closingTime: string } | null;
        summary?: Record<string, number>;
    } => {
        if (!locationSchedules || formState.parcels.length === 0) {
            return { same: false };
        }

        const counts: Record<string, number> = {};
        let representative: { openingTime: string; closingTime: string } | null = null;

        for (const parcel of formState.parcels) {
            const parcelDate = new Date(parcel.pickupDate);
            // Ignore past dates in bulk edit checks
            if (isPastDate(parcelDate)) {
                continue;
            }
            const range = getOpeningHoursForDate(parcelDate);
            if (!range) {
                // Closed date or unknown hours — treat as unique bucket
                const key = "CLOSED";
                counts[key] = (counts[key] || 0) + 1;
                continue;
            }
            const key = `${range.openingTime}-${range.closingTime}`;
            counts[key] = (counts[key] || 0) + 1;
            if (!representative) representative = range;
        }

        const distinct = Object.keys(counts);
        if (distinct.length === 1 && distinct[0] !== "CLOSED") {
            return { same: true, representative, summary: counts };
        }
        return { same: false, representative, summary: counts };
    }, [locationSchedules, formState.parcels, getOpeningHoursForDate, isPastDate]);

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
            } catch {
                // Error fetching pickup locations
                setPickupLocations([
                    { value: "loc1", label: "Västerås Stadsmission" },
                    { value: "loc2", label: "Klara Kyrka" },
                ]);
            }
        }

        fetchData();
    }, []);

    useEffect(() => {
        if (pickupLocations.length !== 1) return;

        const onlyLocation = pickupLocations[0];
        if (!onlyLocation?.value) return;

        setFormState(prevState => {
            if (prevState.pickupLocationId) {
                return prevState;
            }

            const updatedState = {
                ...prevState,
                pickupLocationId: onlyLocation.value,
            };
            autoSelectedStateRef.current = updatedState;
            return updatedState;
        });
    }, [pickupLocations]);

    useEffect(() => {
        if (!autoSelectedStateRef.current) return;

        updateData(autoSelectedStateRef.current);
        autoSelectedStateRef.current = null;
    }, [formState.pickupLocationId, updateData]);

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
            } catch {
                // Error fetching capacity data
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
                setLocationSchedules(schedules);
            } catch {
                // Error fetching location schedules
                setLocationSchedules(null);
            }
        }

        fetchSchedules();
    }, [formState.pickupLocationId]);

    // Also fetch location schedules on initial load if data has a pickup location
    useEffect(() => {
        async function fetchInitialSchedules() {
            if (data.pickupLocationId && !locationSchedules) {
                try {
                    const schedules = await getPickupLocationSchedulesAction(data.pickupLocationId);
                    setLocationSchedules(schedules);
                } catch {
                    // Error fetching initial location schedules
                }
            }
        }

        fetchInitialSchedules();
    }, [data.pickupLocationId, locationSchedules]);

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
            } catch {
                // Error fetching slot duration
                setSlotDuration(15); // Default to 15 minutes in case of error
            }
        }

        fetchSlotDuration();
    }, [formState.pickupLocationId]);

    const isDateExcluded = (date: Date): boolean => {
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
                    const dayConfig = schedule.days.find(
                        (day: LocationScheduleDay) => day.weekday === weekday,
                    );
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

        // Check if this is today and all opening hours have passed
        const now = new Date();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (dateForComparison.getTime() === today.getTime()) {
            // Get opening hours for today
            const openingHours = getOpeningHoursForDate(localDate);
            if (openingHours) {
                const [closeHour, closeMinute] = openingHours.closingTime
                    .split(":")
                    .map(n => parseInt(n, 10));
                const closingTime = new Date(localDate);
                closingTime.setHours(closeHour, closeMinute, 0, 0);

                // If current time is past closing time, exclude today
                if (now >= closingTime) {
                    return true; // Exclude today - all opening hours have passed
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
    };

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
            // Check regular schedules
            // Check if this day falls within any schedule and is an open day
            {
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
                        const dayConfig = schedule.days.find(
                            (day: LocationScheduleDay) => day.weekday === weekday,
                        );
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

    // Generate time slots based on opening/closing times and slot duration
    const generateTimeSlots = useCallback(
        (
            openingTime: string = "09:00",
            closingTime: string = "17:00",
            duration: number = slotDuration,
        ): string[] => {
            const slots: string[] = [];

            // Parse opening and closing times
            const [openHour, openMinute] = openingTime
                .split(":")
                .map((n: string) => parseInt(n, 10));
            const [closeHour, closeMinute] = closingTime
                .split(":")
                .map((n: string) => parseInt(n, 10));

            // Convert to minutes for easier calculation
            const openingMinutes = openHour * 60 + openMinute;
            const closingMinutes = closeHour * 60 + closeMinute;

            // Generate slots from opening time to (closing time - slot duration)
            let currentMinutes = openingMinutes;
            while (currentMinutes <= closingMinutes - duration) {
                const hour = Math.floor(currentMinutes / 60)
                    .toString()
                    .padStart(2, "0");
                const minute = (currentMinutes % 60).toString().padStart(2, "0");

                slots.push(`${hour}:${minute}`);
                currentMinutes += duration;
            }

            return slots;
        },
        [slotDuration],
    );

    // Filter time slots to exclude past times for today
    const filterPastTimeSlots = useCallback((slots: string[], date: Date): string[] => {
        // If not today, return all slots
        const today = new Date();
        const todayStockholm = toStockholmTime(today);
        todayStockholm.setHours(0, 0, 0, 0);

        const compareDateStockholm = toStockholmTime(date);
        compareDateStockholm.setHours(0, 0, 0, 0);

        if (compareDateStockholm.getTime() !== todayStockholm.getTime()) {
            return slots; // Future date - all slots valid
        }

        // For today, filter out past slots
        const now = new Date();
        return slots.filter(slot => {
            const [hours, minutes] = slot.split(":").map(Number);
            const slotDateTime = new Date(date);
            slotDateTime.setHours(hours, minutes, 0, 0);
            return slotDateTime > now;
        });
    }, []);

    // Get the first available slot for a given opening/closing time
    const getFirstAvailableSlot = useCallback(
        (openingTime: string = "09:00", closingTime: string = "17:00"): string => {
            const slots = generateTimeSlots(openingTime, closingTime, slotDuration);
            return slots.length > 0 ? slots[0] : "12:00";
        },
        [generateTimeSlots, slotDuration],
    );

    const generateParcels = useCallback((): FoodParcel[] => {
        // Track which date strings we've already processed to avoid duplicates
        const processedDates = new Set<string>();

        return selectedDates.map(date => {
            const dateString = new Date(date).toDateString();

            // Find an existing parcel for this exact date if there is one
            // CRITICAL: Only reuse parcels whose dates are still in selectedDates
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

            // Use the first available slot as default time, or noon as fallback
            const range = getOpeningHoursForDate(date);
            const defaultTimeSlot = range
                ? getFirstAvailableSlot(range.openingTime, range.closingTime)
                : "12:00";
            const [hours, minutes] = defaultTimeSlot.split(":").map((n: string) => parseInt(n, 10));

            const earliestTime = new Date(date);
            earliestTime.setHours(hours, minutes, 0, 0);

            // Calculate end time based on slot duration
            const latestTime = new Date(earliestTime);
            latestTime.setMinutes(latestTime.getMinutes() + slotDuration);

            // Do NOT pre-generate IDs for new parcels - let the server handle it
            // The absence of an ID signals to the backend that this is a new parcel
            return {
                id: undefined,
                pickupDate: new Date(date),
                pickupEarliestTime: earliestTime,
                pickupLatestTime: latestTime,
            };
        });
    }, [
        selectedDates,
        formState.parcels,
        slotDuration,
        getFirstAvailableSlot,
        getOpeningHoursForDate,
    ]);

    const handleDatesChange = (dates: string[]) => {
        // Convert string dates to Date objects for internal processing
        const dateObjects = dates.map(dateStr => new Date(dateStr));

        // If the user is trying to add a new date (length has increased)
        if (dateObjects.length > selectedDates.length) {
            const addedDate = dateObjects.find(
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
        setSelectedDates(dateObjects);
    };

    const handleParameterChange = (field: keyof FoodParcels, value: unknown) => {
        setFormState(prev => ({ ...prev, [field]: value }));
    };

    const applyChanges = useCallback(() => {
        const parcels = generateParcels();
        const updatedState = {
            ...formState,
            parcels,
        };

        if (JSON.stringify(updatedState.parcels) !== JSON.stringify(formState.parcels)) {
            setFormState(updatedState);
            updateData(updatedState);
        }
    }, [formState, generateParcels, updateData]);

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
        // CRITICAL: Always apply changes when selectedDates changes, even when empty
        // This ensures deselecting all dates properly clears the parcels list
        applyChanges();
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

        // Validate against opening hours for each upcoming parcel date
        const invalidDates: string[] = [];
        formState.parcels.forEach(parcel => {
            const parcelDate = new Date(parcel.pickupDate);
            if (isPastDate(parcelDate)) {
                return; // skip past dates
            }
            const range = getOpeningHoursForDate(parcelDate);
            if (!range) {
                invalidDates.push(parcelDate.toLocaleDateString("sv-SE"));
                return;
            }

            const [openH, openM] = range.openingTime.split(":").map(n => parseInt(n, 10));
            const [closeH, closeM] = range.closingTime.split(":").map(n => parseInt(n, 10));
            const openingTotal = openH * 60 + openM;
            const closingTotal = closeH * 60 + closeM;
            const latestAllowedStart = closingTotal - slotDuration;
            const chosenTotal = hours * 60 + roundedMinutes;

            if (chosenTotal < openingTotal || chosenTotal > latestAllowedStart) {
                invalidDates.push(parcelDate.toLocaleDateString("sv-SE"));
            }
        });

        if (invalidDates.length > 0) {
            setBulkTimeError(
                `Vald tid (${bulkStartTime}) ligger utanför öppettiderna för: ${invalidDates.join(", ")}`,
            );
            return;
        }

        // Calculate end time based on slot duration for each parcel (only upcoming updated)
        const updatedParcels = formState.parcels.map(parcel => {
            // Set the new start time
            const newStartTime = new Date(parcel.pickupDate);
            if (!isPastDate(newStartTime)) {
                newStartTime.setHours(hours, roundedMinutes, 0, 0);
            }

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

            {/* Show validation errors */}
            {validationErrors && validationErrors.length > 0 && (
                <Paper
                    p="sm"
                    withBorder
                    mb="md"
                    style={{
                        backgroundColor: "var(--mantine-color-red-0)",
                        borderColor: "var(--mantine-color-red-4)",
                    }}
                >
                    <Stack gap="xs">
                        <Group>
                            <IconExclamationMark size="1rem" color="var(--mantine-color-red-6)" />
                            <Text size="sm" fw={600} c="red">
                                {t("validationErrors.title", { default: "Validation Errors" })}
                            </Text>
                        </Group>
                        {validationErrors.map(error => {
                            // Map error codes to i18n keys
                            let errorMessage = error.message;

                            // Try to translate based on error code
                            const errorCodeMap: Record<
                                string,
                                | "validationErrors.pastTimeSlot"
                                | "validationErrors.capacityReached"
                                | "validationErrors.slotCapacityReached"
                                | "validationErrors.doubleBooking"
                                | "validationErrors.outsideOperatingHours"
                            > = {
                                PAST_TIME_SLOT: "validationErrors.pastTimeSlot",
                                PAST_PICKUP_TIME: "validationErrors.pastTimeSlot",
                                CAPACITY_REACHED: "validationErrors.capacityReached",
                                SLOT_CAPACITY_REACHED: "validationErrors.slotCapacityReached",
                                DOUBLE_BOOKING: "validationErrors.doubleBooking",
                                OUTSIDE_OPENING_HOURS: "validationErrors.outsideOperatingHours",
                            };

                            if (error.code && errorCodeMap[error.code]) {
                                // Type is safe because errorCodeMap values are string literal types
                                // that match the translation keys
                                errorMessage = t(errorCodeMap[error.code]);
                            }

                            return (
                                <Text
                                    key={`${error.field}-${error.code}`}
                                    size="sm"
                                    c="red"
                                    ml="lg"
                                >
                                    • {errorMessage}
                                </Text>
                            );
                        })}
                    </Stack>
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
                            value={selectedDates.map(date => date.toISOString().split("T")[0])}
                            onChange={handleDatesChange}
                            minDate={new Date()}
                            numberOfColumns={2}
                            renderDay={dateString => renderDay(new Date(dateString))}
                            excludeDate={dateString => isDateExcluded(new Date(dateString))}
                            withWeekNumbers
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
                                onClick={() => {
                                    const check = doAllSelectedDatesShareSameHours();
                                    if (!check.same) {
                                        // Build a concise explanation for the user
                                        const summaryParts = Object.entries(check.summary || {})
                                            .map(
                                                ([k, v]) =>
                                                    `${k === "CLOSED" ? "closed" : k} (${v})`,
                                            )
                                            .join(", ");
                                        showNotification({
                                            title: t("bulk.notAvailableTitle"),
                                            message:
                                                summaryParts && summaryParts.length > 0
                                                    ? t("bulk.notAvailableMsgWithSummary", {
                                                          summary: summaryParts,
                                                      })
                                                    : t("bulk.notAvailableMsg"),
                                            color: "yellow",
                                        });
                                        return;
                                    }
                                    // Initialize bulk start time from first upcoming parcel's current time
                                    const firstUpcoming = formState.parcels.find(
                                        p => !isPastDate(new Date(p.pickupDate)),
                                    );
                                    if (firstUpcoming) {
                                        const hh = firstUpcoming.pickupEarliestTime
                                            .getHours()
                                            .toString()
                                            .padStart(2, "0");
                                        const minsRaw =
                                            firstUpcoming.pickupEarliestTime.getMinutes();
                                        const mins = Math.floor(minsRaw / 15) * 15;
                                        setBulkStartTime(
                                            `${hh}:${mins.toString().padStart(2, "0")}`,
                                        );
                                    }
                                    setBulkTimeMode(true);
                                }}
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
                                    {t("bulkTimeHint")} – {t("bulk.upcomingOnly", {})}
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
                                                <Button
                                                    variant="subtle"
                                                    size="xs"
                                                    onClick={() => {
                                                        setSelectedParcelIndex(-1); // Use -1 to indicate bulk mode
                                                        setTimeModalOpened(true);
                                                    }}
                                                    styles={{
                                                        root: {
                                                            fontWeight: 500,
                                                            minWidth: "80px",
                                                            height: "28px",
                                                            padding: "0 8px",
                                                        },
                                                    }}
                                                >
                                                    {bulkStartTime}
                                                </Button>
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
                        {bulkTimeMode
                            ? `${t("bulkTimeHint")} – ${t("bulk.upcomingOnly", {})}`
                            : t("individualTimeHint")}
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
                            <Table.Tbody
                                key={locationSchedules ? "schedules-loaded" : "schedules-loading"}
                            >
                                {formState.parcels.map((parcel, index) => {
                                    // Compute facility opening hours via helper to ensure proper boundaries and format
                                    const date = new Date(parcel.pickupDate);
                                    const isParcelPastDate = isPastDate(date);
                                    const range = getOpeningHoursForDate(date);
                                    const openingHours = range
                                        ? `${range.openingTime} – ${range.closingTime}`
                                        : null;

                                    return (
                                        <Table.Tr
                                            key={parcel.id ? parcel.id : `index-${index}`}
                                            style={{
                                                borderBottom:
                                                    index !== formState.parcels.length - 1
                                                        ? "1px solid var(--mantine-color-gray-2)"
                                                        : "none",
                                                backgroundColor: isParcelPastDate
                                                    ? "var(--mantine-color-gray-0)"
                                                    : "transparent",
                                                opacity: isParcelPastDate ? 0.6 : 1,
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
                                                            color: isParcelPastDate
                                                                ? "var(--mantine-color-gray-5)"
                                                                : "var(--mantine-color-gray-6)",
                                                        }}
                                                    />
                                                    <Text
                                                        fw={500}
                                                        style={{
                                                            color: isParcelPastDate
                                                                ? "var(--mantine-color-gray-6)"
                                                                : "var(--mantine-color-gray-8)",
                                                            textDecoration: isParcelPastDate
                                                                ? "line-through"
                                                                : "none",
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
                                                    {isParcelPastDate && (
                                                        <Text
                                                            size="xs"
                                                            style={{
                                                                color: "var(--mantine-color-red-6)",
                                                                fontWeight: 500,
                                                                backgroundColor:
                                                                    "var(--mantine-color-red-0)",
                                                                padding: "2px 6px",
                                                                borderRadius: "4px",
                                                                fontSize: "0.7rem",
                                                            }}
                                                        >
                                                            {tCommon("past")}
                                                        </Text>
                                                    )}
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
                                                                        : isParcelPastDate
                                                                          ? "1px solid var(--mantine-color-gray-2)"
                                                                          : "1px solid var(--mantine-color-gray-3)",
                                                                borderRadius: "4px",
                                                                padding: "0px",
                                                                backgroundColor: isParcelPastDate
                                                                    ? "var(--mantine-color-gray-0)"
                                                                    : "white",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                opacity: isParcelPastDate ? 0.7 : 1,
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
                                                                                : isParcelPastDate
                                                                                  ? "var(--mantine-color-gray-5)"
                                                                                  : "var(--mantine-color-gray-6)",
                                                                    }}
                                                                />

                                                                <Group gap={0} align="center">
                                                                    <Button
                                                                        variant="subtle"
                                                                        size="sm"
                                                                        onClick={() => {
                                                                            if (!isParcelPastDate) {
                                                                                setSelectedParcelIndex(
                                                                                    index,
                                                                                );
                                                                                setTimeModalOpened(
                                                                                    true,
                                                                                );
                                                                            }
                                                                        }}
                                                                        disabled={isParcelPastDate}
                                                                        styles={{
                                                                            root: {
                                                                                fontWeight: 500,
                                                                                minWidth: "80px",
                                                                                height: "28px",
                                                                                padding: "0 8px",
                                                                                background:
                                                                                    isParcelPastDate
                                                                                        ? "var(--mantine-color-gray-1)"
                                                                                        : "transparent",
                                                                                cursor: isParcelPastDate
                                                                                    ? "not-allowed"
                                                                                    : "pointer",
                                                                                opacity:
                                                                                    isParcelPastDate
                                                                                        ? 0.6
                                                                                        : 1,
                                                                            },
                                                                        }}
                                                                    >
                                                                        {(() => {
                                                                            const hours =
                                                                                parcel.pickupEarliestTime
                                                                                    .getHours()
                                                                                    .toString()
                                                                                    .padStart(
                                                                                        2,
                                                                                        "0",
                                                                                    );
                                                                            const mins =
                                                                                parcel.pickupEarliestTime.getMinutes();
                                                                            // Round to nearest 15 min increment
                                                                            const roundedMins =
                                                                                Math.floor(
                                                                                    mins / 15,
                                                                                ) * 15;
                                                                            const minutes =
                                                                                roundedMins
                                                                                    .toString()
                                                                                    .padStart(
                                                                                        2,
                                                                                        "0",
                                                                                    );
                                                                            return `${hours}:${minutes}`;
                                                                        })()}
                                                                    </Button>
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

            {/* Time Selection Modal */}
            <Modal
                opened={timeModalOpened}
                onClose={() => {
                    setTimeModalOpened(false);
                    setSelectedParcelIndex(null);
                }}
                title={t("time.dateAndPickup")}
                size="md"
                centered
            >
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        {selectedParcelIndex === -1
                            ? t("setBulkTimes")
                            : selectedParcelIndex !== null
                              ? `${t("table.pickupTime")} ${t("for")} ${
                                    formState.parcels[selectedParcelIndex]?.pickupDate
                                        ? new Date(
                                              formState.parcels[selectedParcelIndex].pickupDate,
                                          ).toLocaleDateString()
                                        : ""
                                }`
                              : ""}
                    </Text>

                    {(() => {
                        const interval = minutesToHHmm(slotDuration);
                        let availableSlots: string[] = [];

                        if (selectedParcelIndex === -1) {
                            // Bulk mode
                            const start = bulkCommonRange?.openingTime || "09:00";
                            const rawEnd = bulkCommonRange?.closingTime || "17:00";
                            const adjustedEnd = subtractMinutesFromHHmm(rawEnd, slotDuration);
                            availableSlots = getTimeRange({
                                startTime: start,
                                endTime: adjustedEnd,
                                interval,
                            });
                        } else if (
                            selectedParcelIndex !== null &&
                            formState.parcels[selectedParcelIndex]
                        ) {
                            // Individual parcel mode
                            const parcel = formState.parcels[selectedParcelIndex];
                            const parcelDate = new Date(parcel.pickupDate);
                            const range = getOpeningHoursForDate(parcelDate);
                            const start = range?.openingTime || "09:00";
                            const rawEnd = range?.closingTime || "17:00";
                            const adjustedEnd = subtractMinutesFromHHmm(rawEnd, slotDuration);

                            const allSlots = getTimeRange({
                                startTime: start,
                                endTime: adjustedEnd,
                                interval,
                            });

                            availableSlots = filterPastTimeSlots(allSlots, parcelDate);
                        } else {
                            const adjusted = subtractMinutesFromHHmm("17:00", slotDuration);
                            availableSlots = getTimeRange({
                                startTime: "09:00",
                                endTime: adjusted,
                                interval,
                            });
                        }

                        if (availableSlots.length === 0) {
                            return (
                                <Alert
                                    icon={<IconAlertCircle size="1rem" />}
                                    title={t("time.noAvailableTimes")}
                                    color="yellow"
                                >
                                    {t("time.noAvailableTimesForToday")}
                                </Alert>
                            );
                        }

                        return (
                            <TimeGrid
                                value={
                                    selectedParcelIndex === -1
                                        ? bulkStartTime
                                        : selectedParcelIndex !== null &&
                                            formState.parcels[selectedParcelIndex]
                                          ? (() => {
                                                const parcel =
                                                    formState.parcels[selectedParcelIndex];
                                                const hours = parcel.pickupEarliestTime
                                                    .getHours()
                                                    .toString()
                                                    .padStart(2, "0");
                                                const mins = parcel.pickupEarliestTime.getMinutes();
                                                const roundedMins = Math.floor(mins / 15) * 15;
                                                const minutes = roundedMins
                                                    .toString()
                                                    .padStart(2, "0");
                                                return `${hours}:${minutes}`;
                                            })()
                                          : "12:00"
                                }
                                onChange={timeString => {
                                    if (!timeString) return;

                                    if (selectedParcelIndex === -1) {
                                        // Bulk mode: ensure stored value is HH:mm (strip seconds if provided)
                                        const parts = timeString.split(":");
                                        const hh = (parts[0] || "00").padStart(2, "0");
                                        const mm = (parts[1] || "00").padStart(2, "0");
                                        setBulkStartTime(`${hh}:${mm}`);
                                    } else if (selectedParcelIndex !== null) {
                                        // Individual parcel mode
                                        const [hours, minutes] = timeString.split(":");
                                        const parcel = formState.parcels[selectedParcelIndex];
                                        const newDate = new Date(parcel.pickupEarliestTime);
                                        newDate.setHours(parseInt(hours, 10));
                                        newDate.setMinutes(parseInt(minutes, 10));
                                        updateParcelTime(
                                            selectedParcelIndex,
                                            "pickupEarliestTime",
                                            newDate,
                                        );
                                    }

                                    setTimeModalOpened(false);
                                    setSelectedParcelIndex(null);
                                }}
                                data={availableSlots}
                                size="sm"
                                styles={{
                                    control: {
                                        minWidth: "100px",
                                        padding: "8px 12px",
                                    },
                                }}
                            />
                        );
                    })()}

                    <Group justify="flex-end" mt="md">
                        <Button
                            variant="default"
                            onClick={() => {
                                setTimeModalOpened(false);
                                setSelectedParcelIndex(null);
                            }}
                        >
                            {t("cancel")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Card>
    );
}
