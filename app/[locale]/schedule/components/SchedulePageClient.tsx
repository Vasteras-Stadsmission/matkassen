"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
    Container,
    Title,
    Select,
    Group,
    Button,
    Stack,
    Text,
    Paper,
    Loader,
    Center,
    ActionIcon,
    Modal,
    Badge,
} from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { useDisclosure } from "@mantine/hooks";
import {
    IconCalendar,
    IconChevronLeft,
    IconChevronRight,
    IconCalendarDue,
    IconClock,
} from "@tabler/icons-react";
import { getFoodParcelsForWeek, getPickupLocations } from "../actions";
import { FoodParcel, PickupLocation } from "../types";
import { recomputeOutsideHoursCountAction } from "../client-actions";
import WeeklyScheduleGrid from "../components/WeeklyScheduleGrid";
import { getISOWeekNumber, getWeekDates } from "../../../utils/date-utils";
import { useTranslations } from "next-intl";

const DEFAULT_MAX_PARCELS_PER_SLOT = 4;

// This component safely accesses search params inside a Suspense boundary
function SearchParamsHandler() {
    const searchParams = useSearchParams();
    const locationId = searchParams.get("location");
    const dateParam = searchParams.get("date");

    return { locationId, dateParam };
}

function SchedulePageContent({
    locationIdFromParams,
    dateFromParams,
}: {
    locationIdFromParams: string | null;
    dateFromParams: Date | null;
}) {
    const t = useTranslations();

    // State for locations
    const [locations, setLocations] = useState<PickupLocation[]>([]);
    const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

    // State for selected week
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    const [weekDates, setWeekDates] = useState<Date[]>([]);
    const [weekNumber, setWeekNumber] = useState<number>(0);
    const [year, setYear] = useState<number>(0);

    // State for food parcels
    const [foodParcels, setFoodParcels] = useState<FoodParcel[]>([]);

    // Loading states
    const [isLoadingLocations, setIsLoadingLocations] = useState(true);
    const [isLoadingParcels, setIsLoadingParcels] = useState(false);

    // Date picker state
    const [datePickerOpened, { open: openDatePicker, close: closeDatePicker }] =
        useDisclosure(false);

    // Memoized loader to fetch parcels for a week
    const loadFoodParcels = useCallback(async (locationId: string, inputDates: Date[]) => {
        if (!locationId) return;

        // Always ensure we have a complete 7-day week
        let dates = inputDates;
        if (!dates || dates.length !== 7) {
            const baseDate = dates && dates[0] ? dates[0] : new Date();
            const { start } = getWeekDates(baseDate);
            dates = [];
            const current = new Date(start);
            for (let i = 0; i < 7; i++) {
                dates.push(new Date(current));
                current.setDate(current.getDate() + 1);
            }
        }

        setIsLoadingParcels(true);
        try {
            const weekStart = dates[0];
            const weekEnd = dates[dates.length - 1];

            const parcels = await getFoodParcelsForWeek(locationId, weekStart, weekEnd);

            setFoodParcels(parcels);
        } catch (error) {
            console.error("Error loading food parcels:", error);
        } finally {
            setIsLoadingParcels(false);
        }
    }, []);

    // Combined initialization effect that handles URL parameters and initial data loading
    useEffect(() => {
        // Flag to track if component is mounted to prevent state updates after unmount
        let isMounted = true;

        async function initialize() {
            try {
                // Step 1: Set initial date from URL or use current date
                const initialDate = dateFromParams || new Date();
                if (isMounted) setCurrentDate(initialDate);

                // Step 2: Calculate week dates synchronously to avoid an extra render
                const { start } = getWeekDates(initialDate);
                const weekNumber = getISOWeekNumber(initialDate);
                const year = initialDate.getFullYear();

                // Generate an array of dates for the week
                const dates: Date[] = [];
                const current = new Date(start);

                // Always generate exactly 7 days (Monday through Sunday)
                // instead of relying on the end date calculation
                for (let i = 0; i < 7; i++) {
                    dates.push(new Date(current));
                    current.setDate(current.getDate() + 1);
                }

                if (isMounted) {
                    setWeekDates(dates);
                    setWeekNumber(weekNumber);
                    setYear(year);
                }

                // Step 3: Load locations
                setIsLoadingLocations(true);
                const locationsData = await getPickupLocations();

                if (isMounted) {
                    setLocations(locationsData);

                    // Determine which location to select - prioritize URL param
                    const locationToSelect =
                        locationIdFromParams ||
                        (locationsData.length > 0 ? locationsData[0].id : null);

                    setSelectedLocationId(locationToSelect);

                    // Step 4: Load food parcels only if we have a location and dates
                    if (locationToSelect && dates.length > 0) {
                        await loadFoodParcels(locationToSelect, dates);
                    }
                }
            } catch (error) {
                console.error("Error initializing schedule data:", error);
            } finally {
                if (isMounted) setIsLoadingLocations(false);
            }
        }

        // Add a small delay to ensure proper hydration
        const timeoutId = setTimeout(() => {
            initialize();
        }, 0);

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
    }, [locationIdFromParams, dateFromParams, loadFoodParcels]);

    // Update week dates when current date changes (after initial load)
    useEffect(() => {
        // Skip this effect on initial render, which is handled by the initialization effect
        if (weekDates.length === 0) return;

        const { start } = getWeekDates(currentDate);
        const weekNumber = getISOWeekNumber(currentDate);
        const year = currentDate.getFullYear();

        // Generate an array of dates for the week
        const dates: Date[] = [];
        const current = new Date(start);

        // Always generate exactly 7 days (Monday through Sunday)
        // instead of relying on the end date calculation
        for (let i = 0; i < 7; i++) {
            dates.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }

        setWeekDates(dates);
        setWeekNumber(weekNumber);
        setYear(year);

        // Only load food parcels if we have a location selected
        if (selectedLocationId) {
            loadFoodParcels(selectedLocationId, dates);
        }
    }, [currentDate, selectedLocationId, weekDates.length, loadFoodParcels]);

    // loadFoodParcels is defined above to satisfy dependencies in effects

    // Handle location change - only reload parcels when location changes
    const handleLocationChange = (value: string | null) => {
        if (value === selectedLocationId) return; // Skip if same location
        setSelectedLocationId(value);

        if (value && weekDates.length > 0) {
            // Ensure we always use a 7-day week
            if (weekDates.length === 7) {
                loadFoodParcels(value, weekDates);
            } else {
                // Regenerate proper 7-day week if weekDates is incomplete
                const { start } = getWeekDates(currentDate);
                const dates: Date[] = [];
                const current = new Date(start);
                for (let i = 0; i < 7; i++) {
                    dates.push(new Date(current));
                    current.setDate(current.getDate() + 1);
                }
                loadFoodParcels(value, dates);
            }
            recomputeOutsideHoursCountAction(value).catch(err =>
                console.error("Recompute outside-hours count failed:", err),
            );
        } else {
            // Clear parcels if no location selected
            setFoodParcels([]);
        }
    };

    const goToPreviousWeek = () => {
        setIsLoadingParcels(true); // Set loading when changing week
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() - 7);
        setCurrentDate(newDate);
    };

    const goToNextWeek = () => {
        setIsLoadingParcels(true); // Set loading when changing week
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + 7);
        setCurrentDate(newDate);
    };

    const goToToday = () => {
        setIsLoadingParcels(true); // Set loading when changing week
        setCurrentDate(new Date());
    };

    // Refresh food parcels after rescheduling - reuse the helper function
    const handleParcelRescheduled = async () => {
        if (!selectedLocationId || weekDates.length === 0) return;
        await loadFoodParcels(selectedLocationId, weekDates);
    };

    // Listen for schedule grid refresh events (e.g., when schedules are deleted)
    useEffect(() => {
        const handleRefreshScheduleGrid = async () => {
            if (!selectedLocationId || weekDates.length === 0) return;
            await loadFoodParcels(selectedLocationId, weekDates);
        };

        window.addEventListener("refreshScheduleGrid", handleRefreshScheduleGrid);
        return () => window.removeEventListener("refreshScheduleGrid", handleRefreshScheduleGrid);
    }, [selectedLocationId, weekDates, loadFoodParcels]);

    // Handle date selection from calendar
    const handleDateSelect = (value: string | null) => {
        if (!value) return;
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
            setIsLoadingParcels(true); // Set loading when changing date
            setCurrentDate(date);
            closeDatePicker();
        }
    };

    // Get max parcels per day for the selected location
    const getMaxParcelsPerDay = (): number => {
        if (!selectedLocationId) return Infinity;

        const location = locations.find(loc => loc.id === selectedLocationId);
        return location?.maxParcelsPerDay || Infinity;
    };

    return (
        <Container fluid p="md">
            <Stack gap="sm">
                {/* Header section */}
                <Group justify="space-between" align="flex-end">
                    <Title order={1}>{t("schedule.title")}</Title>
                </Group>

                {/* Controls section */}
                <Paper withBorder p="xs" radius="md">
                    <Group justify="space-between" align="center">
                        <Select
                            label={t("foodParcels.pickupLocation")}
                            placeholder={t("foodParcels.selectLocation")}
                            data={locations.map(loc => ({
                                value: loc.id,
                                label: loc.name,
                                // Store as a custom property that we'll access in renderOption
                                ...loc,
                            }))}
                            value={selectedLocationId}
                            onChange={handleLocationChange}
                            disabled={isLoadingLocations}
                            rightSection={isLoadingLocations ? <Loader size="xs" /> : null}
                            style={{ minWidth: 250 }}
                            size="xs"
                            renderOption={({ option }) => {
                                // Type assertion to access our custom properties
                                const locationOption = option as PickupLocation & {
                                    value: string;
                                    label: string;
                                };
                                return (
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            width: "100%",
                                        }}
                                    >
                                        <span>{option.label}</span>
                                        {locationOption.outsideHoursCount > 0 && (
                                            <Badge size="xs" color="red" radius="xl">
                                                {locationOption.outsideHoursCount}
                                            </Badge>
                                        )}
                                    </div>
                                );
                            }}
                        />

                        <Group gap="xs">
                            <Button
                                variant="outline"
                                leftSection={<IconCalendarDue size="0.9rem" />}
                                onClick={goToToday}
                                size="md"
                            >
                                {t("schedule.today")}
                            </Button>

                            <Group gap={8}>
                                <ActionIcon
                                    variant="light"
                                    color="blue"
                                    onClick={goToPreviousWeek}
                                    size="lg"
                                >
                                    <IconChevronLeft size="1rem" />
                                </ActionIcon>

                                <Button
                                    variant="subtle"
                                    onClick={openDatePicker}
                                    rightSection={<IconCalendar size="0.9rem" />}
                                    size="lg"
                                >
                                    {t("schedule.weekLabel", {
                                        week: String(weekNumber),
                                        year: String(year),
                                    })}
                                </Button>

                                <ActionIcon
                                    variant="light"
                                    color="blue"
                                    onClick={goToNextWeek}
                                    size="lg"
                                >
                                    <IconChevronRight size="1rem" />
                                </ActionIcon>
                            </Group>
                        </Group>
                    </Group>
                </Paper>

                {/* Schedule grid */}
                <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
                    {isLoadingParcels || isLoadingLocations ? (
                        <Center style={{ height: 400 }}>
                            <Stack align="center" gap="xs">
                                <Loader size="md" />
                                <Text c="dimmed">{t("schedule.loading")}</Text>
                            </Stack>
                        </Center>
                    ) : foodParcels.length === 0 && !isLoadingParcels ? (
                        <Center style={{ height: 400 }}>
                            <Stack align="center" gap="xs">
                                <IconClock
                                    size="3rem"
                                    stroke={1.5}
                                    color="var(--mantine-color-gray-5)"
                                />
                                <Text c="dimmed">{t("schedule.noFoodSupport")}</Text>
                                {selectedLocationId && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleParcelRescheduled}
                                    >
                                        {t("schedule.refresh")}
                                    </Button>
                                )}
                            </Stack>
                        </Center>
                    ) : (
                        <WeeklyScheduleGrid
                            weekDates={weekDates}
                            foodParcels={foodParcels}
                            maxParcelsPerDay={getMaxParcelsPerDay()}
                            maxParcelsPerSlot={DEFAULT_MAX_PARCELS_PER_SLOT}
                            onParcelRescheduled={handleParcelRescheduled}
                            locationId={selectedLocationId}
                        />
                    )}
                </Paper>
            </Stack>

            {/* Date picker modal */}
            <Modal
                opened={datePickerOpened}
                onClose={closeDatePicker}
                title={t("schedule.selectWeek")}
                centered
                overlayProps={{
                    opacity: 0.55,
                    blur: 3,
                }}
            >
                <DatePicker
                    type="default"
                    value={currentDate}
                    onChange={handleDateSelect}
                    numberOfColumns={2}
                    size="md"
                />
            </Modal>
        </Container>
    );
}

export default function SchedulePageClient() {
    const [locationId, setLocationId] = useState<string | null>(null);
    const [date, setDate] = useState<Date | null>(null);
    const [paramsLoaded, setParamsLoaded] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    // Ensure component is mounted before rendering content
    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Component to handle search params with proper Suspense
    function SearchParamsComponentWithSuspense() {
        const { locationId: locationIdFromUrl, dateParam } = SearchParamsHandler();

        useEffect(() => {
            let newLocationId: string | null = null;
            let newDate: Date | null = null;

            if (locationIdFromUrl) {
                newLocationId = locationIdFromUrl;
            }

            if (dateParam) {
                const parsedDate = new Date(dateParam);
                if (!isNaN(parsedDate.getTime())) {
                    newDate = parsedDate;
                }
            }

            setLocationId(newLocationId);
            setDate(newDate);
            setParamsLoaded(true);
        }, [dateParam, locationIdFromUrl]);

        return null;
    }

    // Don't render anything until the component is mounted (prevents hydration mismatch)
    if (!isMounted) {
        return (
            <Container fluid p="md">
                <Stack gap="sm">
                    <Group justify="space-between" align="flex-end">
                        <Title order={1}>Food Support Scheduling</Title>
                    </Group>
                    <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
                        <Center style={{ height: 400 }}>
                            <Stack align="center" gap="xs">
                                <Loader size="md" />
                                <Text c="dimmed">Loading...</Text>
                            </Stack>
                        </Center>
                    </Paper>
                </Stack>
            </Container>
        );
    }

    return (
        <>
            <Suspense fallback={null}>
                <SearchParamsComponentWithSuspense />
            </Suspense>

            {(paramsLoaded || (!locationId && !date)) && (
                <SchedulePageContent locationIdFromParams={locationId} dateFromParams={date} />
            )}
        </>
    );
}
