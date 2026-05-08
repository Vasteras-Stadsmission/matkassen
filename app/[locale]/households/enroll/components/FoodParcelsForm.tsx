"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { showNotification } from "@mantine/notifications";
import {
    SimpleGrid,
    Title,
    Text,
    Card,
    Select,
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
import { useLocale, useTranslations } from "next-intl";
import { TranslationFunction } from "../../../types";
import { type LocationScheduleInfo, type LocationScheduleDay } from "@/app/[locale]/schedule/types";
import { Time } from "@/app/utils/time-provider";

interface ValidationError {
    field: string;
    message: string;
    code?: string;
}

interface PickupLocation {
    value: string;
    label: string;
}

type OpeningHoursRange = { openingTime: string; closingTime: string };

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

type ParcelValidationError = NonNullable<FoodParcelsFormProps["validationErrors"]>[number];

export default function FoodParcelsForm({
    data,
    updateData,
    error,
    validationErrors,
}: FoodParcelsFormProps) {
    const t = useTranslations("foodParcels") as TranslationFunction;
    const tCommon = useTranslations("handoutLocations");
    const locale = useLocale();

    const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [timeErrors, setTimeErrors] = useState<{ [key: string]: string }>({});
    const [bulkTimeMode, setBulkTimeMode] = useState(false);
    const [bulkStartTime, setBulkStartTime] = useState("12:00");
    const [bulkTimeError, setBulkTimeError] = useState<string | null>(null);
    // Add state for location schedules
    const [locationSchedules, setLocationSchedules] = useState<LocationScheduleInfo | null>(null);
    const [locationSchedulesById, setLocationSchedulesById] = useState<
        Record<string, LocationScheduleInfo>
    >({});
    // Add state for slot duration
    const [slotDuration, setSlotDuration] = useState<number>(15); // Default to 15 minutes
    const [slotDurationsById, setSlotDurationsById] = useState<Record<string, number>>({});

    const locationNameById = useMemo(() => {
        return new Map(pickupLocations.map(location => [location.value, location.label]));
    }, [pickupLocations]);

    const dateKey = (date: Date): string => {
        const localDate = new Date(date);
        const year = localDate.getFullYear();
        const month = String(localDate.getMonth() + 1).padStart(2, "0");
        const day = String(localDate.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };

    const sameCalendarDay = (left: Date, right: Date): boolean => dateKey(left) === dateKey(right);

    // Derive opening hours for dates from location schedules
    const getOpeningHoursForDate = useCallback(
        (date: Date): OpeningHoursRange | null => {
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
    const activeLocationRequestRef = useRef(0);

    // State for time selection modal
    const [timeModalOpened, setTimeModalOpened] = useState(false);
    const [selectedParcelIndex, setSelectedParcelIndex] = useState<number | null>(null);

    // Use shared date utils from app/utils/date-utils

    // moved below where formState is declared

    // Check if a date is in the past (entire day) using Stockholm timezone
    const isPastDate = useCallback((date: Date) => {
        const stockholmToday = toStockholmTime(Time.now().toDate());
        stockholmToday.setHours(0, 0, 0, 0);

        const stockholmCompareDate = toStockholmTime(date);
        stockholmCompareDate.setHours(0, 0, 0, 0);

        return stockholmCompareDate < stockholmToday;
    }, []);

    const [formState, setFormState] = useState<FoodParcels>({
        pickupLocationId: data.pickupLocationId || "",
        parcels: data.parcels || [],
    });

    const getParcelLocationId = useCallback(
        (parcel: FoodParcel): string => parcel.pickupLocationId || formState.pickupLocationId,
        [formState.pickupLocationId],
    );

    const getOpeningHoursForLocationDate = useCallback(
        (locationId: string, date: Date): OpeningHoursRange | null => {
            const schedules = locationSchedulesById[locationId];
            if (!schedules) {
                return formState.pickupLocationId === locationId
                    ? getOpeningHoursForDate(date)
                    : null;
            }

            const dateOnly = new Date(date);
            dateOnly.setHours(0, 0, 0, 0);

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

            for (const schedule of schedules.schedules) {
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
            const trim = (t: string) => (t.length >= 5 ? t.substring(0, 5) : t);
            return { openingTime: trim(earliest), closingTime: trim(latest) };
        },
        [formState.pickupLocationId, getOpeningHoursForDate, locationSchedulesById],
    );

    const getSlotDurationForLocation = useCallback(
        (locationId: string): number => {
            return (
                slotDurationsById[locationId] ??
                (locationId === formState.pickupLocationId ? slotDuration : 15)
            );
        },
        [formState.pickupLocationId, slotDuration, slotDurationsById],
    );

    const selectedDatesForCurrentLocation = useMemo(() => {
        if (!formState.pickupLocationId) return [];

        return formState.parcels
            .filter(parcel => getParcelLocationId(parcel) === formState.pickupLocationId)
            .map(parcel => new Date(parcel.pickupDate));
    }, [formState.parcels, formState.pickupLocationId, getParcelLocationId]);

    const selectedDateKeysForOtherLocations = useMemo(() => {
        if (!formState.pickupLocationId) return new Set<string>();

        return new Set(
            formState.parcels
                .filter(parcel => getParcelLocationId(parcel) !== formState.pickupLocationId)
                .map(parcel => dateKey(new Date(parcel.pickupDate))),
        );
    }, [formState.parcels, formState.pickupLocationId, getParcelLocationId]);

    const activeLocationDataReady =
        !formState.pickupLocationId ||
        (capacityData !== null &&
            locationSchedulesById[formState.pickupLocationId] !== undefined &&
            slotDurationsById[formState.pickupLocationId] !== undefined);

    const isLoadingActiveLocationData =
        !!formState.pickupLocationId && (!activeLocationDataReady || loadingCapacityData);

    const selectedSlotDurations = useMemo(() => {
        return Array.from(
            new Set(
                formState.parcels.map(parcel =>
                    getSlotDurationForLocation(getParcelLocationId(parcel)),
                ),
            ),
        );
    }, [formState.parcels, getParcelLocationId, getSlotDurationForLocation]);

    // Precompute common opening hours for bulk selection (needs formState)
    const bulkCommonRange = useMemo(() => {
        if (formState.parcels.length === 0) return null;
        // Consider only non-past dates for bulk operations
        const ranges = formState.parcels
            .filter(parcel => !isPastDate(new Date(parcel.pickupDate)))
            .map(parcel =>
                getOpeningHoursForLocationDate(
                    getParcelLocationId(parcel),
                    new Date(parcel.pickupDate),
                ),
            );

        if (ranges.length === 0 || ranges.some(range => !range)) return null;

        let maxOpening: string | null = null;
        let minClosing: string | null = null;

        for (const range of ranges) {
            if (!range) return null;
            if (maxOpening === null || range.openingTime > maxOpening) {
                maxOpening = range.openingTime;
            }
            if (minClosing === null || range.closingTime < minClosing) {
                minClosing = range.closingTime;
            }
        }

        if (!maxOpening || !minClosing || maxOpening >= minClosing) return null;
        return { openingTime: maxOpening, closingTime: minClosing };
    }, [formState.parcels, getOpeningHoursForLocationDate, getParcelLocationId, isPastDate]);

    const bulkSlotDuration = useMemo(() => {
        const durations = new Set(
            formState.parcels
                .filter(parcel => !isPastDate(new Date(parcel.pickupDate)))
                .map(parcel => getSlotDurationForLocation(getParcelLocationId(parcel))),
        );

        return durations.size === 1 ? Array.from(durations)[0] : null;
    }, [formState.parcels, getParcelLocationId, getSlotDurationForLocation, isPastDate]);

    // Check whether all selected parcel dates share identical opening/closing times
    const doAllSelectedDatesShareSameHours = useCallback((): {
        same: boolean;
        representative?: { openingTime: string; closingTime: string } | null;
        summary?: Record<string, number>;
    } => {
        if (formState.parcels.length === 0) {
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
            const range = getOpeningHoursForLocationDate(getParcelLocationId(parcel), parcelDate);
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
    }, [formState.parcels, getOpeningHoursForLocationDate, getParcelLocationId, isPastDate]);

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
        const locationId = formState.pickupLocationId;
        const requestId = activeLocationRequestRef.current + 1;
        activeLocationRequestRef.current = requestId;

        if (!locationId) {
            setCapacityData(null);
            setLocationSchedules(null);
            setSlotDuration(15);
            setLoadingCapacityData(false);
            return;
        }

        let cancelled = false;
        setCapacityData(null);
        setLocationSchedules(null);
        setLoadingCapacityData(true);

        async function fetchActiveLocationData() {
            try {
                // Set the date range for capacity check (current month + next month)
                const today = Time.now().toDate();
                const startDate = new Date(today);
                startDate.setDate(1); // First day of current month

                const endDate = new Date(today);
                endDate.setMonth(endDate.getMonth() + 2, 0); // Last day of next month

                const [capacity, schedules, duration] = await Promise.all([
                    getPickupLocationCapacityForRangeAction(locationId, startDate, endDate),
                    getPickupLocationSchedulesAction(locationId),
                    getLocationSlotDurationAction(locationId),
                ]);

                if (cancelled || activeLocationRequestRef.current !== requestId) return;

                setCapacityData(capacity);
                setLocationSchedules(schedules);
                setLocationSchedulesById(prev => ({
                    ...prev,
                    [locationId]: schedules,
                }));
                setSlotDuration(duration);
                setSlotDurationsById(prev => ({
                    ...prev,
                    [locationId]: duration,
                }));
            } catch {
                if (cancelled || activeLocationRequestRef.current !== requestId) return;

                setCapacityData({
                    hasLimit: false,
                    maxPerDay: null,
                    dateCapacities: {},
                });
                setLocationSchedules(null);
                setLocationSchedulesById(prev => ({
                    ...prev,
                    [locationId]: { schedules: [] },
                }));
                setSlotDuration(15);
                setSlotDurationsById(prev => ({
                    ...prev,
                    [locationId]: 15,
                }));
            } finally {
                if (!cancelled && activeLocationRequestRef.current === requestId) {
                    setLoadingCapacityData(false);
                }
            }
        }

        fetchActiveLocationData();

        return () => {
            cancelled = true;
        };
    }, [formState.pickupLocationId]);

    useEffect(() => {
        const locationIds = Array.from(
            new Set(
                formState.parcels
                    .map(parcel => getParcelLocationId(parcel))
                    .filter((locationId): locationId is string => !!locationId),
            ),
        );

        locationIds.forEach(locationId => {
            if (!locationSchedulesById[locationId]) {
                getPickupLocationSchedulesAction(locationId)
                    .then(schedules => {
                        setLocationSchedulesById(prev => ({ ...prev, [locationId]: schedules }));
                    })
                    .catch(() => {
                        // Error fetching location schedules for selected parcel row
                    });
            }

            if (slotDurationsById[locationId] === undefined) {
                getLocationSlotDurationAction(locationId)
                    .then(duration => {
                        setSlotDurationsById(prev => ({ ...prev, [locationId]: duration }));
                    })
                    .catch(() => {
                        // Error fetching slot duration for selected parcel row
                    });
            }
        });
    }, [formState.parcels, getParcelLocationId, locationSchedulesById, slotDurationsById]);

    const isDateExcluded = (date: Date): boolean => {
        const localDate = new Date(date);
        const dateForComparison = new Date(localDate);
        dateForComparison.setHours(0, 0, 0, 0);

        // Always allow dates that are already selected - this is critical for deselection
        const isAlreadySelected = selectedDatesForCurrentLocation.some(selectedDate => {
            const selected = new Date(selectedDate);
            selected.setHours(0, 0, 0, 0);
            return selected.getTime() === dateForComparison.getTime();
        });

        if (isAlreadySelected) {
            return false; // Never exclude dates that are already selected
        }

        if (!activeLocationDataReady) {
            return true;
        }

        if (selectedDateKeysForOtherLocations.has(dateKey(dateForComparison))) {
            return true;
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
        const now = Time.now().toDate();
        const today = new Date(now);
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
        const capacityDateKey = `${year}-${month}-${day}`;
        const dateString = localDate.toDateString();

        // Count parcels from database
        const dbParcelCount = capacityData?.dateCapacities?.[capacityDateKey] || 0;

        // Count selected dates for this same day in the current session
        const selectedDateCount = selectedDatesForCurrentLocation.filter(
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
        const capacityDateKey = `${year}-${month}-${day}`;
        const dateString = localDate.toDateString();

        // Count parcels from database
        const dbParcelCount = capacityData?.dateCapacities?.[capacityDateKey] || 0;

        // Count selected dates for this same day in the current session (excluding the current date if it's selected)
        const selectedDateCount = selectedDatesForCurrentLocation.filter(
            selectedDate => new Date(selectedDate).toDateString() === dateString,
        ).length;

        // Calculate total count (database + selected in current session)
        const totalCount = dbParcelCount + selectedDateCount;
        const maxPerDay = capacityData?.maxPerDay || null;

        const isFullyBooked = maxPerDay !== null && totalCount >= maxPerDay;

        const dayOfWeek = localDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        const today = Time.now().toDate();
        today.setHours(0, 0, 0, 0);
        const dateForComparison = new Date(localDate);
        dateForComparison.setHours(0, 0, 0, 0);
        const isToday = dateForComparison.getTime() === today.getTime();

        const isSelected = selectedDatesForCurrentLocation.some(selectedDate => {
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
            const updatedState = {
                ...formState,
                pickupLocationId: "",
            };
            setFormState(updatedState);
            updateData(updatedState);
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
        const today = Time.now().toDate();
        const todayStockholm = toStockholmTime(today);
        todayStockholm.setHours(0, 0, 0, 0);

        const compareDateStockholm = toStockholmTime(date);
        compareDateStockholm.setHours(0, 0, 0, 0);

        if (compareDateStockholm.getTime() !== todayStockholm.getTime()) {
            return slots; // Future date - all slots valid
        }

        // For today, filter out past slots
        const now = Time.now().toDate();
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

    const createParcelForLocationDate = useCallback(
        (locationId: string, date: Date): FoodParcel => {
            const range = getOpeningHoursForLocationDate(locationId, date);
            const duration = getSlotDurationForLocation(locationId);
            const defaultTimeSlot = range
                ? getFirstAvailableSlot(range.openingTime, range.closingTime)
                : "12:00";
            const [hours, minutes] = defaultTimeSlot.split(":").map((n: string) => parseInt(n, 10));

            const earliestTime = new Date(date);
            earliestTime.setHours(hours, minutes, 0, 0);

            const latestTime = new Date(earliestTime);
            latestTime.setMinutes(latestTime.getMinutes() + duration);

            return {
                pickupLocationId: locationId,
                pickupDate: new Date(date),
                pickupEarliestTime: earliestTime,
                pickupLatestTime: latestTime,
            };
        },
        [getFirstAvailableSlot, getOpeningHoursForLocationDate, getSlotDurationForLocation],
    );

    const showSelectionNotification = useCallback((date: Date, message: string) => {
        setTimeout(() => {
            setCapacityNotification({
                date,
                message,
                isAvailable: false,
            });

            if (capacityNotificationTimeoutRef.current) {
                clearTimeout(capacityNotificationTimeoutRef.current);
            }

            capacityNotificationTimeoutRef.current = setTimeout(() => {
                setCapacityNotification(null);
            }, 5000);
        }, 0);
    }, []);

    const handleDatesChange = (dates: string[]) => {
        if (!formState.pickupLocationId) return;
        if (!activeLocationDataReady) {
            showSelectionNotification(Time.now().toDate(), t("locationDataLoading"));
            return;
        }

        // Convert string dates to Date objects for internal processing
        const dateObjects = dates.map(dateStr => new Date(dateStr));
        const selectedDateKeys = new Set(dateObjects.map(date => dateKey(date)));

        // If the user is trying to add a new date (length has increased)
        if (dateObjects.length > selectedDatesForCurrentLocation.length) {
            const addedDate = dateObjects.find(
                newDate =>
                    !selectedDatesForCurrentLocation.some(existingDate =>
                        sameCalendarDay(existingDate, newDate),
                    ),
            );

            if (addedDate) {
                const localDate = new Date(addedDate);
                if (selectedDateKeysForOtherLocations.has(dateKey(localDate))) {
                    showSelectionNotification(
                        localDate,
                        t("dateAlreadySelected", {
                            date: localDate.toLocaleDateString(locale),
                        }),
                    );
                    return;
                }

                const year = localDate.getFullYear();
                const month = String(localDate.getMonth() + 1).padStart(2, "0");
                const day = String(localDate.getDate()).padStart(2, "0");
                const addedDateKey = `${year}-${month}-${day}`;

                // Count parcels from database
                const dbParcelCount = capacityData?.dateCapacities?.[addedDateKey] || 0;

                // Count existing selected dates for this same day
                const existingDateCount = selectedDatesForCurrentLocation.filter(selectedDate =>
                    sameCalendarDay(selectedDate, localDate),
                ).length;

                // Total count including the new date being added (+1)
                const totalCount = dbParcelCount + existingDateCount + 1;
                const maxPerDay = capacityData?.maxPerDay || null;
                const isAvailable = maxPerDay === null || totalCount <= maxPerDay;

                // If the date is unavailable (at or over capacity), don't add it
                if (!isAvailable && maxPerDay !== null) {
                    // Revert the selection by removing the date that was just added
                    showSelectionNotification(localDate, t("capacityFull", { maximum: maxPerDay }));

                    return;
                }
            }
        }

        const otherLocationParcels = formState.parcels.filter(
            parcel => getParcelLocationId(parcel) !== formState.pickupLocationId,
        );
        const currentLocationExistingParcels = formState.parcels.filter(
            parcel => getParcelLocationId(parcel) === formState.pickupLocationId,
        );
        const preservedCurrentLocationParcels = currentLocationExistingParcels.filter(parcel =>
            selectedDateKeys.has(dateKey(new Date(parcel.pickupDate))),
        );
        const existingCurrentDateKeys = new Set(
            preservedCurrentLocationParcels.map(parcel => dateKey(new Date(parcel.pickupDate))),
        );
        const newParcels = dateObjects
            .filter(date => !existingCurrentDateKeys.has(dateKey(date)))
            .map(date => createParcelForLocationDate(formState.pickupLocationId, date));

        const updatedState = {
            ...formState,
            parcels: [...otherLocationParcels, ...preservedCurrentLocationParcels, ...newParcels],
        };

        setFormState(updatedState);
        updateData(updatedState);
    };

    const updateParcelTime = (index: number, field: keyof FoodParcel, time: Date) => {
        // Only allow updating the start time (pickupEarliestTime)
        if (field === "pickupEarliestTime") {
            const updatedParcels = [...formState.parcels];
            const parcel = updatedParcels[index];
            const parcelLocationId = getParcelLocationId(parcel);
            const duration = getSlotDurationForLocation(parcelLocationId);

            // Set the new start time
            const newStartTime = new Date(time);

            // Calculate the new end time based on slot duration
            const newEndTime = new Date(newStartTime);
            newEndTime.setMinutes(newEndTime.getMinutes() + duration);

            // Clear any existing errors
            const newTimeErrors = { ...timeErrors };
            delete newTimeErrors[`${index}-pickupEarliestTime`];
            delete newTimeErrors[`${index}-pickupLatestTime`];

            // Update the parcel with both new times
            updatedParcels[index] = {
                ...parcel,
                pickupLocationId: parcelLocationId,
                pickupEarliestTime: newStartTime,
                pickupLatestTime: newEndTime,
            };

            const updatedState = { ...formState, parcels: updatedParcels };
            setFormState(updatedState);
            updateData(updatedState);
            setTimeErrors(newTimeErrors);
        }
    };

    const removeParcelAtIndex = (index: number) => {
        const parcel = formState.parcels[index];
        if (!parcel || isPastDate(new Date(parcel.pickupDate))) return;

        const updatedState = {
            ...formState,
            parcels: formState.parcels.filter((_, parcelIndex) => parcelIndex !== index),
        };
        setFormState(updatedState);
        updateData(updatedState);
    };

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
            const parcelLocationId = getParcelLocationId(parcel);
            const duration = getSlotDurationForLocation(parcelLocationId);
            const range = getOpeningHoursForLocationDate(parcelLocationId, parcelDate);
            if (!range) {
                invalidDates.push(parcelDate.toLocaleDateString(locale));
                return;
            }

            const [openH, openM] = range.openingTime.split(":").map(n => parseInt(n, 10));
            const [closeH, closeM] = range.closingTime.split(":").map(n => parseInt(n, 10));
            const openingTotal = openH * 60 + openM;
            const closingTotal = closeH * 60 + closeM;
            const latestAllowedStart = closingTotal - duration;
            const chosenTotal = hours * 60 + roundedMinutes;

            if (chosenTotal < openingTotal || chosenTotal > latestAllowedStart) {
                invalidDates.push(parcelDate.toLocaleDateString(locale));
            }
        });

        if (invalidDates.length > 0) {
            setBulkTimeError(
                t("bulk.timeOutsideHours", {
                    time: bulkStartTime,
                    dates: invalidDates.join(", "),
                }),
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

            const duration = getSlotDurationForLocation(getParcelLocationId(parcel));

            // Calculate the end time based on slot duration
            const newEndTime = new Date(newStartTime);
            newEndTime.setMinutes(newEndTime.getMinutes() + duration);

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

    const numberDetail = (value: unknown): number | null => {
        const parsed =
            typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;

        return Number.isFinite(parsed) ? parsed : null;
    };

    const formatValidationErrorMessage = (error: ParcelValidationError): string => {
        const details = error.details ?? {};
        const date = typeof details.date === "string" ? details.date : "";
        const timeSlot = typeof details.timeSlot === "string" ? details.timeSlot : "";
        const current = numberDetail(details.current);
        const maximum = numberDetail(details.maximum);

        if (
            (error.code === "MAX_DAILY_CAPACITY_REACHED" || error.code === "CAPACITY_REACHED") &&
            date &&
            current !== null &&
            maximum !== null
        ) {
            return t("validationErrors.capacityReachedDetailed", {
                date,
                current,
                maximum,
            });
        }

        if (error.code === "MAX_DAILY_CAPACITY_REACHED" || error.code === "CAPACITY_REACHED") {
            return t("validationErrors.capacityReached");
        }

        if (
            (error.code === "MAX_SLOT_CAPACITY_REACHED" ||
                error.code === "SLOT_CAPACITY_REACHED") &&
            date &&
            timeSlot &&
            current !== null &&
            maximum !== null
        ) {
            return t("validationErrors.slotCapacityReachedDetailed", {
                date,
                timeSlot,
                current,
                maximum,
            });
        }

        if (error.code === "MAX_SLOT_CAPACITY_REACHED" || error.code === "SLOT_CAPACITY_REACHED") {
            return t("validationErrors.slotCapacityReached");
        }

        if (
            (error.code === "HOUSEHOLD_DOUBLE_BOOKING" ||
                error.code === "DOUBLE_BOOKING" ||
                error.code === "TIME_SLOT_CONFLICT") &&
            date
        ) {
            return t("validationErrors.doubleBookingDetailed", { date });
        }

        if (
            error.code === "HOUSEHOLD_DOUBLE_BOOKING" ||
            error.code === "DOUBLE_BOOKING" ||
            error.code === "TIME_SLOT_CONFLICT"
        ) {
            return t("validationErrors.doubleBooking");
        }

        if (
            (error.code === "OUTSIDE_OPERATING_HOURS" || error.code === "OUTSIDE_OPENING_HOURS") &&
            date &&
            timeSlot
        ) {
            return t("validationErrors.outsideOperatingHoursDetailed", { date, timeSlot });
        }

        if (error.code === "OUTSIDE_OPERATING_HOURS" || error.code === "OUTSIDE_OPENING_HOURS") {
            return t("validationErrors.outsideOperatingHours");
        }

        if (error.code === "PAST_TIME_SLOT" || error.code === "PAST_PICKUP_TIME") {
            return t("validationErrors.pastTimeSlot");
        }

        if (error.code === "LOCATION_NOT_FOUND") {
            return t("validationErrors.locationNotFound");
        }

        if (error.code === "PARCEL_NOT_FOUND") {
            return t("validationErrors.parcelNotFound");
        }

        return error.code
            ? t("validationErrors.unknownWithCode", { code: error.code })
            : t("validationErrors.unknown");
    };

    const validationErrorSummaries = Array.from(
        (validationErrors ?? [])
            .reduce((summaries, error) => {
                const message = formatValidationErrorMessage(error);
                const existing = summaries.get(message);

                if (existing) {
                    existing.count += 1;
                } else {
                    summaries.set(message, { message, count: 1 });
                }

                return summaries;
            }, new Map<string, { message: string; count: number }>())
            .values(),
    );

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
                        {validationErrorSummaries.map(({ message, count }) => {
                            return (
                                <Text key={message} size="sm" c="red" ml="lg">
                                    • {message}
                                    {count > 1
                                        ? ` ${t("validationErrors.repeated", { count })}`
                                        : ""}
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
                            value={selectedDatesForCurrentLocation.map(
                                date => date.toISOString().split("T")[0],
                            )}
                            onChange={handleDatesChange}
                            minDate={Time.now().toDate()}
                            numberOfColumns={2}
                            renderDay={dateString => renderDay(new Date(dateString))}
                            excludeDate={dateString => isDateExcluded(new Date(dateString))}
                            withWeekNumbers
                        />

                        {isLoadingActiveLocationData && (
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
                            {t("selectedParcels")} ({formState.parcels.length})
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
                                    if (!check.same || bulkSlotDuration === null) {
                                        // Build a concise explanation for the user
                                        const summaryParts = Object.entries(check.summary || {})
                                            .map(
                                                ([k, v]) =>
                                                    `${k === "CLOSED" ? t("bulk.closed") : k} (${v})`,
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
                                                        const endMinutes =
                                                            minutes + (bulkSlotDuration ?? 15);
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
                                    {selectedSlotDurations.length === 1
                                        ? t("slotDuration", {
                                              duration: selectedSlotDurations[0].toString(),
                                          })
                                        : t("slotDurationVaries")}
                                </Text>
                            </Group>
                        </Paper>
                    </Group>

                    <Stack gap="sm">
                        {formState.parcels.map((parcel, index) => {
                            const date = new Date(parcel.pickupDate);
                            const isParcelPastDate = isPastDate(date);
                            const parcelLocationId = getParcelLocationId(parcel);
                            const parcelSlotDuration = getSlotDurationForLocation(parcelLocationId);
                            const locationName =
                                locationNameById.get(parcelLocationId) || t("unknownLocation");

                            return (
                                <Paper
                                    key={
                                        parcel.id
                                            ? parcel.id
                                            : `${parcelLocationId}-${dateKey(date)}`
                                    }
                                    radius="md"
                                    withBorder
                                    p="sm"
                                    style={{
                                        backgroundColor: isParcelPastDate
                                            ? "var(--mantine-color-gray-0)"
                                            : "white",
                                        opacity: isParcelPastDate ? 0.65 : 1,
                                    }}
                                >
                                    <SimpleGrid
                                        cols={{ base: 1, sm: 4 }}
                                        spacing="sm"
                                        verticalSpacing="xs"
                                        style={{ alignItems: "center" }}
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
                                            <Stack gap={2}>
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
                                                    {date.toLocaleDateString(locale, {
                                                        day: "numeric",
                                                        month: "short",
                                                        year: "numeric",
                                                    })}
                                                </Text>
                                                {isParcelPastDate && (
                                                    <Text size="xs" c="red">
                                                        {tCommon("past")}
                                                    </Text>
                                                )}
                                            </Stack>
                                        </Group>

                                        <Group gap="xs">
                                            <IconBuildingStore
                                                size="0.95rem"
                                                style={{ color: "var(--mantine-color-gray-6)" }}
                                            />
                                            <Stack gap={2}>
                                                <Text size="sm" fw={500}>
                                                    {locationName}
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    {t("slotDurationShort", {
                                                        duration: parcelSlotDuration.toString(),
                                                    })}
                                                </Text>
                                            </Stack>
                                        </Group>

                                        <Tooltip
                                            label={
                                                timeErrors[`${index}-pickupEarliestTime`] ||
                                                timeErrors[`${index}-pickupLatestTime`]
                                            }
                                            style={{
                                                color: "white",
                                                backgroundColor: "var(--mantine-color-red-6)",
                                            }}
                                            position="top"
                                            withArrow
                                            opened={
                                                !!(
                                                    timeErrors[`${index}-pickupEarliestTime`] ||
                                                    timeErrors[`${index}-pickupLatestTime`]
                                                )
                                            }
                                            withinPortal
                                        >
                                            <Group gap="xs" align="center">
                                                <Button
                                                    variant="subtle"
                                                    size="sm"
                                                    leftSection={<IconClock size="0.9rem" />}
                                                    onClick={() => {
                                                        if (!isParcelPastDate) {
                                                            setSelectedParcelIndex(index);
                                                            setTimeModalOpened(true);
                                                        }
                                                    }}
                                                    disabled={isParcelPastDate}
                                                    styles={{
                                                        root: {
                                                            fontWeight: 500,
                                                            minWidth: "88px",
                                                            height: "32px",
                                                            padding: "0 8px",
                                                        },
                                                    }}
                                                >
                                                    {(() => {
                                                        const hours = parcel.pickupEarliestTime
                                                            .getHours()
                                                            .toString()
                                                            .padStart(2, "0");
                                                        const roundedMinutes =
                                                            Math.floor(
                                                                parcel.pickupEarliestTime.getMinutes() /
                                                                    15,
                                                            ) * 15;
                                                        const minutes = roundedMinutes
                                                            .toString()
                                                            .padStart(2, "0");
                                                        return `${hours}:${minutes}`;
                                                    })()}
                                                </Button>

                                                <Text size="sm" c="dimmed" fw={500}>
                                                    →
                                                </Text>

                                                <Text size="sm" fw={500}>
                                                    {`${parcel.pickupLatestTime
                                                        .getHours()
                                                        .toString()
                                                        .padStart(2, "0")}:${parcel.pickupLatestTime
                                                        .getMinutes()
                                                        .toString()
                                                        .padStart(2, "0")}`}
                                                </Text>
                                            </Group>
                                        </Tooltip>

                                        <Group justify="flex-end">
                                            <Tooltip label={t("removeParcel")} withArrow>
                                                <ActionIcon
                                                    variant="subtle"
                                                    color="red"
                                                    aria-label={t("removeParcel")}
                                                    disabled={isParcelPastDate}
                                                    onClick={() => removeParcelAtIndex(index)}
                                                >
                                                    <IconX size="1rem" />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Group>
                                    </SimpleGrid>
                                </Paper>
                            );
                        })}
                    </Stack>
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
                                          ).toLocaleDateString(locale)
                                        : ""
                                }`
                              : ""}
                    </Text>

                    {(() => {
                        const interval = minutesToHHmm(slotDuration);
                        let availableSlots: string[] = [];

                        if (selectedParcelIndex === -1) {
                            // Bulk mode
                            const duration = bulkSlotDuration ?? slotDuration;
                            const start = bulkCommonRange?.openingTime || "09:00";
                            const rawEnd = bulkCommonRange?.closingTime || "17:00";
                            const adjustedEnd = subtractMinutesFromHHmm(rawEnd, duration);
                            availableSlots = getTimeRange({
                                startTime: start,
                                endTime: adjustedEnd,
                                interval: minutesToHHmm(duration),
                            });
                        } else if (
                            selectedParcelIndex !== null &&
                            formState.parcels[selectedParcelIndex]
                        ) {
                            // Individual parcel mode
                            const parcel = formState.parcels[selectedParcelIndex];
                            const parcelLocationId = getParcelLocationId(parcel);
                            const duration = getSlotDurationForLocation(parcelLocationId);
                            const parcelDate = new Date(parcel.pickupDate);
                            const range = getOpeningHoursForLocationDate(
                                parcelLocationId,
                                parcelDate,
                            );
                            const start = range?.openingTime || "09:00";
                            const rawEnd = range?.closingTime || "17:00";
                            const adjustedEnd = subtractMinutesFromHHmm(rawEnd, duration);

                            const allSlots = getTimeRange({
                                startTime: start,
                                endTime: adjustedEnd,
                                interval: minutesToHHmm(duration),
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
