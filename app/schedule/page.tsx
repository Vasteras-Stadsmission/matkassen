"use client";

import { useEffect, useState } from "react";
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
import { FoodParcel, PickupLocation, getFoodParcelsForWeek, getPickupLocations } from "./actions";
import WeeklyScheduleGrid from "./components/WeeklyScheduleGrid";
import { getISOWeekNumber, getWeekDates } from "@/app/utils/date-utils";

const DEFAULT_MAX_PARCELS_PER_SLOT = 4;

export default function SchedulePage() {
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

    // Initialize the component
    useEffect(() => {
        // Load pickup locations
        const loadLocations = async () => {
            setIsLoadingLocations(true);
            try {
                const locations = await getPickupLocations();
                setLocations(locations);

                // Select the first location by default if available
                if (locations.length > 0 && !selectedLocationId) {
                    setSelectedLocationId(locations[0].id);
                }
            } catch (error) {
                console.error("Error loading locations:", error);
            } finally {
                setIsLoadingLocations(false);
            }
        };

        loadLocations();
    }, [selectedLocationId]); // Adding selectedLocationId to dependency array

    // Update week dates when current date changes
    useEffect(() => {
        const updateWeekDates = async () => {
            try {
                // Use timezone-aware function to get the week dates
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
            } catch (error) {
                console.error("Error updating week dates:", error);
            }
        };

        updateWeekDates();
    }, [currentDate]);

    // Load food parcels when location or week changes
    useEffect(() => {
        const loadFoodParcels = async () => {
            if (!selectedLocationId || weekDates.length === 0) return;

            setIsLoadingParcels(true);
            try {
                const weekStart = weekDates[0];
                const weekEnd = weekDates[weekDates.length - 1];
                const parcels = await getFoodParcelsForWeek(selectedLocationId, weekStart, weekEnd);
                setFoodParcels(parcels);
            } catch (error) {
                console.error("Error loading food parcels:", error);
            } finally {
                setIsLoadingParcels(false);
            }
        };

        loadFoodParcels();
    }, [selectedLocationId, weekDates]);

    // Navigate to previous week
    const goToPreviousWeek = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() - 7);
        setCurrentDate(newDate);
    };

    // Navigate to next week
    const goToNextWeek = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + 7);
        setCurrentDate(newDate);
    };

    // Go to today
    const goToToday = () => {
        setCurrentDate(new Date());
    };

    // Handle location change
    const handleLocationChange = (value: string | null) => {
        setSelectedLocationId(value);
    };

    // Refresh food parcels after rescheduling
    const handleParcelRescheduled = async () => {
        if (!selectedLocationId || weekDates.length === 0) return;

        try {
            const weekStart = weekDates[0];
            const weekEnd = weekDates[weekDates.length - 1];
            const parcels = await getFoodParcelsForWeek(selectedLocationId, weekStart, weekEnd);
            setFoodParcels(parcels);
        } catch (error) {
            console.error("Error refreshing food parcels:", error);
        }
    };

    // Handle date selection from calendar
    const handleDateSelect = (date: Date | null) => {
        if (date) {
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
                    <Title order={1}>Schemaläggning av matstöd</Title>
                </Group>

                {/* Controls section */}
                <Paper withBorder p="xs" radius="md">
                    <Group justify="space-between" align="center">
                        <Select
                            label="Hämtplats"
                            placeholder="Välj hämtplats"
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
                                Idag
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
                                    Vecka {weekNumber}, {year}
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
                    {isLoadingParcels ? (
                        <Center style={{ height: 400 }}>
                            <Stack align="center" gap="xs">
                                <Loader size="md" />
                                <Text c="dimmed">Laddar schema...</Text>
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
                                <Text c="dimmed">Inga matstöd schemalagda denna vecka</Text>
                                {selectedLocationId && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleParcelRescheduled}
                                    >
                                        Uppdatera
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
                        />
                    )}
                </Paper>
            </Stack>

            {/* Date picker modal */}
            <Modal
                opened={datePickerOpened}
                onClose={closeDatePicker}
                title="Välj vecka"
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
