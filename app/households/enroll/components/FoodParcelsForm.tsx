"use client";

import { useState, useEffect, useCallback } from "react";
import { SimpleGrid, Title, Text, Card, Select, Table, Stack, Box } from "@mantine/core";
import { DatePicker, DatePickerInput, TimeInput } from "@mantine/dates";
import { nanoid } from "@/app/db/schema";
import { IconClock, IconCalendar } from "@tabler/icons-react";
import { getPickupLocations } from "../actions";
import { FoodParcels, FoodParcel } from "../types";

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

export default function FoodParcelsForm({ data, updateData, error }: FoodParcelsFormProps) {
    const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
    const [locationError, setLocationError] = useState<string | null>(null);

    // Use the data from parent component or initialize with defaults
    const [formState, setFormState] = useState<FoodParcels>({
        pickupLocationId: data.pickupLocationId || "",
        totalCount: data.totalCount || 4,
        weekday: data.weekday || "1",
        repeatValue: data.repeatValue || "weekly",
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
        parcels: data.parcels || [],
    });

    // Array of selected dates for the multi-date picker
    const [selectedDates, setSelectedDates] = useState<Date[]>(
        data.parcels?.map(parcel => new Date(parcel.pickupDate)) || [],
    );

    // Update formState when parent data changes (e.g., when navigating back to this step)
    useEffect(() => {
        // Clear location error if we have a pickupLocationId
        if (data.pickupLocationId) {
            setLocationError(null);
        }

        setFormState(prevState => ({
            ...prevState,
            pickupLocationId: data.pickupLocationId || prevState.pickupLocationId,
            parcels: data.parcels?.length > 0 ? data.parcels : prevState.parcels,
        }));
    }, [data]);

    // Set validation error if provided from parent
    useEffect(() => {
        if (error && error.field === "pickupLocationId") {
            setLocationError(error.message);
        } else {
            setLocationError(null);
        }
    }, [error]);

    // Fetch pickup locations on component mount
    useEffect(() => {
        async function fetchData() {
            try {
                const locations = await getPickupLocations();

                // If we don't have any locations in the DB, use dummy data
                if (locations.length === 0) {
                    setPickupLocations([
                        { value: "loc1", label: "Västerås Stadsmission" },
                        { value: "loc2", label: "Klara Kyrka" },
                    ]);
                } else {
                    // Map DB locations to format needed for Select component
                    setPickupLocations(
                        locations.map(loc => ({
                            value: loc.id,
                            label: loc.name,
                        })),
                    );
                }
            } catch (error) {
                console.error("Error fetching pickup locations:", error);
                // Fallback to dummy data
                setPickupLocations([
                    { value: "loc1", label: "Västerås Stadsmission" },
                    { value: "loc2", label: "Klara Kyrka" },
                ]);
            }
        }

        fetchData();
    }, []);

    // Clear location error when user selects a location
    const handleLocationChange = (value: string | null) => {
        setLocationError(null);
        handleParameterChange("pickupLocationId", value);
    };

    // Generate food parcels based on selected dates
    const generateParcels = useCallback((): FoodParcel[] => {
        return selectedDates.map(date => {
            // Look for an existing parcel with this date
            const existingParcel = formState.parcels.find(
                p => new Date(p.pickupDate).toDateString() === new Date(date).toDateString(),
            );

            if (existingParcel) {
                // Keep the existing parcel with its time settings
                return { ...existingParcel };
            }

            // Create a new parcel with default times
            const earliestTime = new Date(date);
            earliestTime.setHours(12, 0, 0);

            const latestTime = new Date(date);
            latestTime.setHours(13, 0, 0);

            return {
                id: nanoid(8),
                pickupDate: new Date(date),
                pickupEarliestTime: earliestTime,
                pickupLatestTime: latestTime,
            };
        });
    }, [selectedDates, formState.parcels]);

    // Handle multiple dates selection
    const handleDatesChange = (dates: Date[]) => {
        setSelectedDates(dates);
    };

    // Update state when parameters change
    const handleParameterChange = (field: keyof FoodParcels, value: unknown) => {
        setFormState(prev => ({ ...prev, [field]: value }));
    };

    // Apply changes and generate parcels
    const applyChanges = useCallback(() => {
        const parcels = generateParcels();
        const updatedState = {
            ...formState,
            parcels,
            totalCount: selectedDates.length,
        };

        // Only update if there's an actual change to avoid loops
        if (
            JSON.stringify(updatedState.parcels) !== JSON.stringify(formState.parcels) ||
            updatedState.totalCount !== formState.totalCount
        ) {
            setFormState(updatedState);
            updateData(updatedState);
        }
    }, [formState, generateParcels, updateData, selectedDates.length]);

    // Update pickup time for a specific parcel
    const updateParcelTime = (index: number, field: keyof FoodParcel, time: Date) => {
        const updatedParcels = [...formState.parcels];
        updatedParcels[index] = {
            ...updatedParcels[index],
            [field]: time,
        };

        const updatedState = { ...formState, parcels: updatedParcels };
        setFormState(updatedState);
        updateData(updatedState);
    };

    // Update pickup date for a specific parcel
    const updateParcelDate = (index: number, date: Date) => {
        const updatedParcels = [...formState.parcels];

        // Keep the same time but update the date
        const earliestTime = new Date(updatedParcels[index].pickupEarliestTime);
        const latestTime = new Date(updatedParcels[index].pickupLatestTime);

        // Set new date but keep original times
        const newEarliestTime = new Date(date);
        newEarliestTime.setHours(earliestTime.getHours(), earliestTime.getMinutes(), 0, 0);

        const newLatestTime = new Date(date);
        newLatestTime.setHours(latestTime.getHours(), latestTime.getMinutes(), 0, 0);

        updatedParcels[index] = {
            ...updatedParcels[index],
            pickupDate: date,
            pickupEarliestTime: newEarliestTime,
            pickupLatestTime: newLatestTime,
        };

        const updatedState = { ...formState, parcels: updatedParcels };
        setFormState(updatedState);
        updateData(updatedState);
    };

    // Helper function to convert Date to string in HH:mm format for TimeInput
    const formatTimeForInput = (date: Date): string => {
        return date.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    // Helper function to parse time string to Date
    const parseTimeString = (timeStr: string, baseDate: Date): Date => {
        const [hours, minutes] = timeStr.split(":").map(Number);
        const newDate = new Date(baseDate);
        newDate.setHours(hours, minutes, 0, 0);
        return newDate;
    };

    // Update selectedDates when parcels change from parent
    useEffect(() => {
        if (
            data.parcels?.length > 0 &&
            JSON.stringify(data.parcels) !== JSON.stringify(formState.parcels)
        ) {
            setSelectedDates(data.parcels.map(parcel => new Date(parcel.pickupDate)));
        }
    }, [data.parcels, formState.parcels]);

    // Generate parcels when selected dates change
    useEffect(() => {
        if (selectedDates.length > 0) {
            applyChanges();
        }
    }, [selectedDates, applyChanges]);

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                Matkassar
            </Title>
            <Text c="dimmed" size="sm" mb="lg">
                Schemalägg matkassar för hushållet med hämtplats och tider.
            </Text>

            <Title order={5} mb="sm">
                Inställningar för schemaläggning
            </Title>

            <SimpleGrid cols={{ base: 1, sm: 1 }} spacing="md" mb="lg">
                <Select
                    label="Hämtplats"
                    placeholder="Välj hämtplats"
                    data={pickupLocations}
                    value={formState.pickupLocationId}
                    onChange={handleLocationChange}
                    withAsterisk
                    error={locationError}
                />

                <Stack>
                    <Text fw={500} size="sm" mb={7}>
                        Välj datum för matkassar{" "}
                        <span style={{ color: "var(--mantine-color-red-6)" }}>*</span>
                    </Text>
                    <Box
                        style={{
                            height: "290px", // Set a fixed height for the calendar container
                            overflow: "hidden", // Prevent any overflow
                        }}
                    >
                        <DatePicker
                            type="multiple"
                            value={selectedDates}
                            onChange={handleDatesChange}
                            minDate={new Date()}
                            numberOfColumns={2}
                        />
                    </Box>
                    <Text size="xs" c="dimmed">
                        Välj alla datum när hushållet ska få en matkasse
                    </Text>
                </Stack>
            </SimpleGrid>

            {formState.parcels.length > 0 && (
                <>
                    <Title order={5} mt="md" mb="sm">
                        Schemalagda matkassar
                    </Title>
                    <Text size="sm" mb="md" c="dimmed">
                        Klicka på datum eller tider för att anpassa varje matkasse. Standardhämttid
                        är 12:00-13:00.
                    </Text>

                    <Table striped highlightOnHover>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Datum</Table.Th>
                                <Table.Th>Tidigast hämttid</Table.Th>
                                <Table.Th>Senast hämttid</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {formState.parcels.map((parcel, index) => (
                                <Table.Tr key={parcel.id || index}>
                                    <Table.Td>
                                        <DatePickerInput
                                            placeholder="Välj datum"
                                            value={new Date(parcel.pickupDate)}
                                            onChange={date => date && updateParcelDate(index, date)}
                                            minDate={new Date()}
                                            valueFormat="DD MMM YYYY"
                                            size="xs"
                                            leftSection={<IconCalendar size="1rem" />}
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <TimeInput
                                            value={formatTimeForInput(parcel.pickupEarliestTime)}
                                            onChange={event => {
                                                const timeStr = event.currentTarget.value;
                                                if (timeStr) {
                                                    const newDate = parseTimeString(
                                                        timeStr,
                                                        parcel.pickupDate,
                                                    );
                                                    updateParcelTime(
                                                        index,
                                                        "pickupEarliestTime",
                                                        newDate,
                                                    );
                                                }
                                            }}
                                            size="xs"
                                            leftSection={<IconClock size="1rem" />}
                                            aria-label="Tidigast hämttid"
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <TimeInput
                                            value={formatTimeForInput(parcel.pickupLatestTime)}
                                            onChange={event => {
                                                const timeStr = event.currentTarget.value;
                                                if (timeStr) {
                                                    const newDate = parseTimeString(
                                                        timeStr,
                                                        parcel.pickupDate,
                                                    );
                                                    updateParcelTime(
                                                        index,
                                                        "pickupLatestTime",
                                                        newDate,
                                                    );
                                                }
                                            }}
                                            size="xs"
                                            leftSection={<IconClock size="1rem" />}
                                            aria-label="Senast hämttid"
                                        />
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </>
            )}
        </Card>
    );
}
