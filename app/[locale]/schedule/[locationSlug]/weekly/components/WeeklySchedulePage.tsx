"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "@/app/i18n/navigation";
import { useTranslations } from "next-intl";
import {
    Container,
    Title,
    Group,
    Button,
    Stack,
    Text,
    Paper,
    Loader,
    Center,
    ActionIcon,
    Modal,
    Alert,
    Tabs,
} from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { useDisclosure } from "@mantine/hooks";
import {
    IconCalendar,
    IconChevronLeft,
    IconChevronRight,
    IconCalendarDue,
    IconClock,
    IconExclamationCircle,
} from "@tabler/icons-react";
import { getFoodParcelsForWeek, getPickupLocations } from "../../../actions";
import { findLocationBySlug } from "../../../utils/location-slugs";
import WeeklyScheduleGrid from "../../../components/WeeklyScheduleGrid";
import { getISOWeekNumber, getWeekDates } from "../../../../../utils/date-utils";
import { ParcelAdminDialog } from "@/components/ParcelAdminDialog";
import { LocationHeader } from "../../../components/LocationHeader";
import type { FoodParcel, PickupLocation } from "../../../types";

const DEFAULT_MAX_PARCELS_PER_SLOT = 4;

interface WeeklySchedulePageProps {
    locationSlug: string;
}

export function WeeklySchedulePage({ locationSlug }: WeeklySchedulePageProps) {
    const router = useRouter();
    const t = useTranslations();

    // State for current location
    const [currentLocation, setCurrentLocation] = useState<PickupLocation | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);

    // State for selected week
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    const [weekDates, setWeekDates] = useState<Date[]>([]);
    const [weekNumber, setWeekNumber] = useState<number>(0);
    const [year, setYear] = useState<number>(0);

    // State for food parcels
    const [foodParcels, setFoodParcels] = useState<FoodParcel[]>([]);
    const lastParcelsRequestRef = useRef<string | null>(null);

    // Loading states
    const [isLoadingLocation, setIsLoadingLocation] = useState(true);
    const [isLoadingParcels, setIsLoadingParcels] = useState(false);

    // Admin dialog state
    const [adminDialogParcelId, setAdminDialogParcelId] = useState<string | null>(null);
    const [isAdminDialogOpen, setIsAdminDialogOpen] = useState(false);

    // Date picker state
    const [datePickerOpened, { open: openDatePicker, close: closeDatePicker }] =
        useDisclosure(false);

    // Memoized loader to fetch parcels for a week
    const loadFoodParcels = useCallback(
        async (locationId: string, inputDates: Date[], options: { force?: boolean } = {}) => {
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

            const requestKey = `${locationId}-${dates[0]?.toISOString().split("T")[0]}`;

            if (lastParcelsRequestRef.current === requestKey && !options.force) {
                return; // Skip duplicate requests
            }

            setIsLoadingParcels(true);
            lastParcelsRequestRef.current = requestKey;

            try {
                const parcels = await getFoodParcelsForWeek(locationId, dates[0], dates[6]);
                setFoodParcels(parcels);
            } catch {
                // Error boundary will handle display
                setFoodParcels([]);
            } finally {
                setIsLoadingParcels(false);
            }
        },
        [],
    );

    // Initialize location and dates
    useEffect(() => {
        let isMounted = true;

        async function initialize() {
            setIsLoadingLocation(true);
            setLocationError(null);

            try {
                // Load locations first to validate the slug
                const locationsData = await getPickupLocations();
                if (!isMounted) return;

                // Find the current location by slug
                const location = findLocationBySlug(locationsData, locationSlug);

                if (!location) {
                    setLocationError(`Location not found: ${locationSlug}`);
                    return;
                }

                setCurrentLocation(location);

                // Initialize week dates
                const { start } = getWeekDates(currentDate);
                const weekNumber = getISOWeekNumber(currentDate);
                const year = currentDate.getFullYear();

                const dates: Date[] = [];
                const current = new Date(start);
                for (let i = 0; i < 7; i++) {
                    dates.push(new Date(current));
                    current.setDate(current.getDate() + 1);
                }

                if (isMounted) {
                    setWeekDates(dates);
                    setWeekNumber(weekNumber);
                    setYear(year);

                    // Load parcels for this location and week
                    await loadFoodParcels(location.id, dates);
                }
            } catch {
                // Error boundary will handle display
                if (isMounted) {
                    setLocationError("Failed to load location data");
                }
            } finally {
                if (isMounted) {
                    setIsLoadingLocation(false);
                }
            }
        }

        initialize();

        return () => {
            isMounted = false;
        };
    }, [locationSlug, currentDate, loadFoodParcels]);

    // Navigation functions
    const goToToday = useCallback(() => {
        setCurrentDate(new Date());
    }, []);

    const goToPreviousWeek = useCallback(() => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            newDate.setDate(newDate.getDate() - 7);
            return newDate;
        });
    }, []);

    const goToNextWeek = useCallback(() => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            newDate.setDate(newDate.getDate() + 7);
            return newDate;
        });
    }, []);

    const handleDateSelect = useCallback(
        (value: string | null) => {
            if (value) {
                const date = new Date(value);
                setCurrentDate(date);
                closeDatePicker();
            }
        },
        [closeDatePicker],
    );

    // Handle parcel reschedule
    const handleParcelRescheduled = useCallback(() => {
        if (currentLocation) {
            loadFoodParcels(currentLocation.id, weekDates, { force: true });
        }
    }, [currentLocation, weekDates, loadFoodParcels]);

    // Admin dialog handlers
    const closeAdminDialog = useCallback(() => {
        setIsAdminDialogOpen(false);
        setAdminDialogParcelId(null);
    }, []);

    const handleParcelUpdated = useCallback(() => {
        // Refetch for all actions - PickupCard status dots need fresh data
        handleParcelRescheduled();
        closeAdminDialog();
    }, [handleParcelRescheduled, closeAdminDialog]);

    // Helper function to get max parcels per day
    const getMaxParcelsPerDay = useCallback(() => {
        return currentLocation?.maxParcelsPerDay || 50;
    }, [currentLocation]);

    if (isLoadingLocation) {
        return (
            <Container size="xl" py="md">
                <Center>
                    <Loader size="lg" />
                </Center>
            </Container>
        );
    }

    if (locationError || !currentLocation) {
        return (
            <Container size="xl" py="md">
                <Alert
                    icon={<IconExclamationCircle size={16} />}
                    title="Location Error"
                    color="red"
                >
                    {locationError || "Location not found"}
                </Alert>
            </Container>
        );
    }

    return (
        <Container size="xl" py="md">
            <Stack gap="md">
                <LocationHeader currentLocation={currentLocation} />

                {/* Page Header */}
                <div>
                    <Title order={1} size="h2">
                        {t("schedule.title")}
                    </Title>
                </div>

                {/* View Switcher */}
                <Tabs value="weekly" variant="pills">
                    <Tabs.List>
                        <Tabs.Tab
                            value="today"
                            leftSection={<IconCalendarDue size={14} />}
                            onClick={() => router.push(`/schedule/${locationSlug}/today`)}
                        >
                            {t("schedule.todayTab")}
                        </Tabs.Tab>
                        <Tabs.Tab value="weekly" leftSection={<IconCalendar size={14} />}>
                            {t("schedule.weeklyTab")}
                        </Tabs.Tab>
                    </Tabs.List>
                </Tabs>

                {/* Controls */}
                <Paper p="md" withBorder>
                    <div>
                        <Group gap="xs" justify="flex-end">
                            <Button
                                variant="outline"
                                leftSection={<IconCalendarDue size="0.9rem" />}
                                onClick={goToToday}
                                size="md"
                                style={{ minWidth: 140 }}
                            >
                                {t("schedule.currentWeek")}
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
                                    style={{ minWidth: 150 }}
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
                    </div>
                </Paper>

                {/* Schedule grid */}
                <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
                    {isLoadingParcels ? (
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
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleParcelRescheduled}
                                >
                                    {t("schedule.refresh")}
                                </Button>
                            </Stack>
                        </Center>
                    ) : (
                        <WeeklyScheduleGrid
                            weekDates={weekDates}
                            foodParcels={foodParcels}
                            maxParcelsPerDay={getMaxParcelsPerDay()}
                            maxParcelsPerSlot={DEFAULT_MAX_PARCELS_PER_SLOT}
                            onParcelRescheduled={handleParcelRescheduled}
                            locationId={currentLocation.id}
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

            {/* Admin parcel dialog */}
            <ParcelAdminDialog
                parcelId={adminDialogParcelId}
                opened={isAdminDialogOpen}
                onClose={closeAdminDialog}
                onParcelUpdated={handleParcelUpdated}
            />
        </Container>
    );
}
