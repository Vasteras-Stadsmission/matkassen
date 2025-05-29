"use client";

import { useEffect, useState, Suspense } from "react";
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
import { FoodParcel, PickupLocation, getFoodParcelsForWeek, getPickupLocations } from "../actions";
import WeeklyScheduleGrid from "../components/WeeklyScheduleGrid";
import { getISOWeekNumber, getWeekDates } from "@/app/utils/date-utils";
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

    // Combined initialization effect that handles URL parameters and initial data loading
    useEffect(() => {
        // Flag to track if component is mounted to prevent state updates after unmount
        let isMounted = true;

        async function initialize() {
            // Step 1: Set initial date from URL or use current date
            const initialDate = dateFromParams || new Date();
            if (isMounted) setCurrentDate(initialDate);

            // Step 2: Calculate week dates synchronously to avoid an extra render
            const { start, end } = getWeekDates(initialDate);
            const weekNumber = getISOWeekNumber(initialDate);
            const year = initialDate.getFullYear();

            // Generate an array of dates for the week
            const dates: Date[] = [];
            const current = new Date(start);

            while (current <= end) {
                dates.push(new Date(current));
                current.setDate(current.getDate() + 1);
            }

            if (isMounted) {
                setWeekDates(dates);
                setWeekNumber(weekNumber);
                setYear(year);
            }

            // Step 3: Load locations and select initial location
            try {
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

        initialize();

        return () => {
            isMounted = false;
        };
    }, [locationIdFromParams, dateFromParams]);

    // Update week dates when current date changes (after initial load)
    useEffect(() => {
        // Skip this effect on initial render, which is handled by the initialization effect
        if (weekDates.length === 0) return;

        const { start, end } = getWeekDates(currentDate);
        const weekNumber = getISOWeekNumber(currentDate);
        const year = currentDate.getFullYear();

        // Generate an array of dates for the week
        const dates: Date[] = [];
        const current = new Date(start);

        while (current <= end) {
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
    }, [currentDate, selectedLocationId, weekDates.length]);

    // Helper function to load food parcels that can be reused
    const loadFoodParcels = async (locationId: string, dates: Date[]) => {
        if (!locationId || dates.length === 0) return;

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
    };

    // Handle location change - only reload parcels when location changes
    const handleLocationChange = (value: string | null) => {
        if (value === selectedLocationId) return; // Skip if same location
        setSelectedLocationId(value);

        if (value && weekDates.length > 0) {
            loadFoodParcels(value, weekDates);
        } else {
            // Clear parcels if no location selected
            setFoodParcels([]);
        }
    };

    // Navigate to previous week
    const goToPreviousWeek = () => {
        setIsLoadingParcels(true); // Set loading when changing week
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() - 7);
        setCurrentDate(newDate);
    };

    // Navigate to next week
    const goToNextWeek = () => {
        setIsLoadingParcels(true); // Set loading when changing week
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + 7);
        setCurrentDate(newDate);
    };

    // Go to today
    const goToToday = () => {
        setIsLoadingParcels(true); // Set loading when changing week
        setCurrentDate(new Date());
    };

    // Refresh food parcels after rescheduling - reuse the helper function
    const handleParcelRescheduled = async () => {
        if (!selectedLocationId || weekDates.length === 0) return;
        await loadFoodParcels(selectedLocationId, weekDates);
    };

    // Handle date selection from calendar
    const handleDateSelect = (value: string) => {
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
                            data={locations.map(loc => ({ value: loc.id, label: loc.name }))}
                            value={selectedLocationId}
                            onChange={handleLocationChange}
                            disabled={isLoadingLocations}
                            rightSection={isLoadingLocations ? <Loader size="xs" /> : null}
                            style={{ minWidth: 250 }}
                            size="xs"
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

// Main exported component that properly handles search params with Suspense
export default function SchedulePageClient() {
    const [locationId, setLocationId] = useState<string | null>(null);
    const [date, setDate] = useState<Date | null>(null);
    const [paramsLoaded, setParamsLoaded] = useState(false);

    // Component to handle search params with proper Suspense
    function SearchParamsComponentWithSuspense() {
        const { locationId: locationIdFromUrl, dateParam } = SearchParamsHandler();

        // Only run the effect once to prevent cascading updates
        useEffect(() => {
            // Batch the state updates together to reduce renders
            let newLocationId = null;
            let newDate = null;

            if (locationIdFromUrl) {
                newLocationId = locationIdFromUrl;
            }

            if (dateParam) {
                const parsedDate = new Date(dateParam);
                if (!isNaN(parsedDate.getTime())) {
                    newDate = parsedDate;
                }
            }

            // Set all the state at once to minimize renders
            setLocationId(newLocationId);
            setDate(newDate);
            setParamsLoaded(true);
        }, [dateParam, locationIdFromUrl]); // Add missing dependencies

        return null;
    }

    // Use a more explicit conditional rendering to ensure the content doesn't load
    // until params have been processed, preventing double-loading
    return (
        <>
            {/* Wrap the component using useSearchParams in Suspense */}
            <Suspense fallback={null}>
                <SearchParamsComponentWithSuspense />
            </Suspense>

            {/* Only render the main content once params have been processed */}
            {(paramsLoaded || (!locationId && !date)) && (
                <SchedulePageContent locationIdFromParams={locationId} dateFromParams={date} />
            )}
        </>
    );
}
