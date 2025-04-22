"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "@mantine/core";
import { DatePicker, TimeInput } from "@mantine/dates";
import { nanoid } from "@/app/db/schema";
import { IconClock, IconCalendar, IconWand, IconCheck, IconX } from "@tabler/icons-react";
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
    const [timeErrors, setTimeErrors] = useState<{ [key: string]: string }>({});
    const [bulkTimeMode, setBulkTimeMode] = useState(false);
    const [bulkEarliestTime, setBulkEarliestTime] = useState("12:00");
    const [bulkLatestTime, setBulkLatestTime] = useState("13:00");
    const [bulkTimeError, setBulkTimeError] = useState<string | null>(null);

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

        // When a value is selected, update the form state and notify parent
        if (value) {
            const updatedState = {
                ...formState,
                pickupLocationId: value,
            };
            setFormState(updatedState);
            updateData(updatedState); // Make sure parent is updated immediately
        } else {
            handleParameterChange("pickupLocationId", value);
        }
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

    // Update pickup time for a specific parcel with validation
    const updateParcelTime = (index: number, field: keyof FoodParcel, time: Date) => {
        const updatedParcels = [...formState.parcels];
        const parcel = updatedParcels[index];

        // Make a temporary update to check validation
        const tempParcel = {
            ...parcel,
            [field]: time,
        };

        // Validate time ranges
        const errorKey = `${index}-${field}`;
        const oppositeField =
            field === "pickupEarliestTime" ? "pickupLatestTime" : "pickupEarliestTime";
        const oppositeErrorKey = `${index}-${oppositeField}`;

        // Clear current field error
        const newTimeErrors = { ...timeErrors };
        delete newTimeErrors[errorKey];

        // Perform validation
        if (
            field === "pickupEarliestTime" &&
            tempParcel.pickupEarliestTime >= tempParcel.pickupLatestTime
        ) {
            newTimeErrors[errorKey] = "Tidigast tid måste vara före senast tid";
        } else if (
            field === "pickupLatestTime" &&
            tempParcel.pickupLatestTime <= tempParcel.pickupEarliestTime
        ) {
            newTimeErrors[errorKey] = "Senast tid måste vara efter tidigast tid";
        } else {
            // If this field is now valid, clear any error on the opposite field too
            delete newTimeErrors[oppositeErrorKey];
        }

        setTimeErrors(newTimeErrors);

        // Update the parcel regardless of validation to show the user's input
        updatedParcels[index] = tempParcel;

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
        // Handle incomplete time input gracefully
        let hours = 0;
        let minutes = 0;

        if (!timeStr) {
            // Default to current values if input is empty
            const current = new Date(baseDate);
            return current;
        }

        const parts = timeStr.split(":");
        if (parts.length === 2) {
            // Normal format "HH:MM"
            hours = parseInt(parts[0], 10) || 0;
            minutes = parseInt(parts[1], 10) || 0;
        } else if (timeStr.length === 1 || timeStr.length === 2) {
            // Single digit or double digit (interpreted as hours)
            hours = parseInt(timeStr, 10) || 0;
            minutes = 0;
        } else if (timeStr.length === 3) {
            // Format like "123" -> interpret as 1:23
            hours = parseInt(timeStr.substring(0, 1), 10) || 0;
            minutes = parseInt(timeStr.substring(1), 10) || 0;
        } else if (timeStr.length === 4) {
            // Format like "1234" -> interpret as 12:34
            hours = parseInt(timeStr.substring(0, 2), 10) || 0;
            minutes = parseInt(timeStr.substring(2), 10) || 0;
        }

        // Enforce valid ranges
        hours = Math.min(Math.max(hours, 0), 23);
        minutes = Math.min(Math.max(minutes, 0), 59);

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

    // Apply bulk time update to all parcels
    const applyBulkTimeUpdate = () => {
        // Validate the bulk times
        const earliestParts = bulkEarliestTime.split(":").map(part => parseInt(part, 10));
        const latestParts = bulkLatestTime.split(":").map(part => parseInt(part, 10));

        const earliestDate = new Date();
        earliestDate.setHours(earliestParts[0] || 0, earliestParts[1] || 0, 0, 0);

        const latestDate = new Date();
        latestDate.setHours(latestParts[0] || 0, latestParts[1] || 0, 0, 0);

        // Check if earliest time is before latest time
        if (earliestDate >= latestDate) {
            setBulkTimeError("Tidigast tid måste vara före senast tid");
            return;
        }

        setBulkTimeError(null);

        // Update all parcels with the new times
        const updatedParcels = formState.parcels.map(parcel => {
            const newEarliestTime = new Date(parcel.pickupDate);
            newEarliestTime.setHours(earliestParts[0] || 0, earliestParts[1] || 0, 0, 0);

            const newLatestTime = new Date(parcel.pickupDate);
            newLatestTime.setHours(latestParts[0] || 0, latestParts[1] || 0, 0, 0);

            return {
                ...parcel,
                pickupEarliestTime: newEarliestTime,
                pickupLatestTime: newLatestTime,
            };
        });

        // Update form state and parent data
        const updatedState = { ...formState, parcels: updatedParcels };
        setFormState(updatedState);
        updateData(updatedState);

        // Exit bulk edit mode
        setBulkTimeMode(false);

        // Clear any individual time errors since all times have been updated
        setTimeErrors({});
    };

    // Cancel bulk time editing
    const cancelBulkTimeEdit = () => {
        setBulkTimeMode(false);
        setBulkTimeError(null);
    };

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
                    <Group justify="space-between" align="center">
                        <Title order={5} mt="md" mb="sm">
                            Schemalagda matkassar ({selectedDates.length})
                        </Title>

                        {!bulkTimeMode ? (
                            <Button
                                leftSection={<IconWand size="1rem" />}
                                variant="light"
                                color="indigo"
                                size="xs"
                                onClick={() => setBulkTimeMode(true)}
                            >
                                Sätt alla tider
                            </Button>
                        ) : (
                            <Text size="xs" c="dimmed">
                                Redigerar alla tider
                            </Text>
                        )}
                    </Group>

                    {bulkTimeMode ? (
                        <Paper p="md" withBorder radius="md" mb="md">
                            <Stack>
                                <Text fw={500} size="sm">
                                    Ställ in samma tid för alla matkassar
                                </Text>

                                {bulkTimeError && (
                                    <Text size="xs" c="red">
                                        {bulkTimeError}
                                    </Text>
                                )}

                                <Group align="flex-end">
                                    <Box style={{ width: "150px" }}>
                                        <Text size="xs" fw={500} pb={5}>
                                            Tidigast hämttid
                                        </Text>
                                        <TimeInput
                                            value={bulkEarliestTime}
                                            onChange={event =>
                                                setBulkEarliestTime(event.currentTarget.value)
                                            }
                                            size="xs"
                                            leftSection={<IconClock size="1rem" />}
                                            aria-label="Tidigast hämttid för alla"
                                            styles={theme => ({
                                                input: {
                                                    ...(bulkTimeError
                                                        ? {
                                                              borderColor: theme.colors.red[6],
                                                          }
                                                        : {}),
                                                },
                                            })}
                                        />
                                    </Box>

                                    <Box style={{ width: "150px" }}>
                                        <Text size="xs" fw={500} pb={5}>
                                            Senast hämttid
                                        </Text>
                                        <TimeInput
                                            value={bulkLatestTime}
                                            onChange={event =>
                                                setBulkLatestTime(event.currentTarget.value)
                                            }
                                            size="xs"
                                            leftSection={<IconClock size="1rem" />}
                                            aria-label="Senast hämttid för alla"
                                            styles={theme => ({
                                                input: {
                                                    ...(bulkTimeError
                                                        ? {
                                                              borderColor: theme.colors.red[6],
                                                          }
                                                        : {}),
                                                },
                                            })}
                                        />
                                    </Box>

                                    <Group>
                                        <Button
                                            size="xs"
                                            leftSection={<IconCheck size="1rem" />}
                                            color="teal"
                                            onClick={applyBulkTimeUpdate}
                                        >
                                            Uppdatera alla
                                        </Button>

                                        <ActionIcon
                                            size="lg"
                                            variant="subtle"
                                            color="gray"
                                            onClick={cancelBulkTimeEdit}
                                        >
                                            <IconX size="1rem" />
                                        </ActionIcon>
                                    </Group>
                                </Group>
                            </Stack>
                        </Paper>
                    ) : null}

                    <Text size="sm" mb="md" c="dimmed">
                        {bulkTimeMode
                            ? "Ställ in samma tid för alla matkassar, eller avbryt för att redigera individuellt."
                            : "Klicka på tiderna för att ändra upphämtningstid för varje enskild matkasse."}
                    </Text>

                    <Paper radius="md" withBorder shadow="xs">
                        <Table striped={false} highlightOnHover verticalSpacing="sm">
                            <Table.Thead>
                                <Table.Tr bg="gray.0">
                                    <Table.Th>Datum och hämttid</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {formState.parcels.map((parcel, index) => (
                                    <Table.Tr
                                        key={parcel.id || index}
                                        style={{
                                            borderBottom:
                                                index !== formState.parcels.length - 1
                                                    ? "1px solid var(--mantine-color-gray-2)"
                                                    : "none",
                                        }}
                                    >
                                        <Table.Td p="sm">
                                            <Group align="center" justify="flex-start" gap="lg">
                                                <Paper
                                                    p="xs"
                                                    radius="md"
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        backgroundColor:
                                                            "var(--mantine-color-blue-0)",
                                                        border: "1px solid var(--mantine-color-blue-2)",
                                                        width: "220px",
                                                        height: "40px",
                                                    }}
                                                >
                                                    <IconCalendar
                                                        size="1.2rem"
                                                        style={{
                                                            marginRight: "12px",
                                                            color: "var(--mantine-color-blue-6)",
                                                        }}
                                                    />
                                                    <Text fw={500} c="gray.8">
                                                        {new Date(
                                                            parcel.pickupDate,
                                                        ).toLocaleDateString("sv-SE", {
                                                            day: "numeric",
                                                            month: "short",
                                                            year: "numeric",
                                                        })}
                                                    </Text>
                                                </Paper>

                                                <Tooltip
                                                    label={
                                                        timeErrors[`${index}-pickupEarliestTime`] ||
                                                        timeErrors[`${index}-pickupLatestTime`]
                                                    }
                                                    color="red"
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
                                                    <Paper
                                                        p="xs"
                                                        radius="md"
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            height: "40px",
                                                            backgroundColor:
                                                                "var(--mantine-color-gray-0)",
                                                            border:
                                                                timeErrors[
                                                                    `${index}-pickupEarliestTime`
                                                                ] ||
                                                                timeErrors[
                                                                    `${index}-pickupLatestTime`
                                                                ]
                                                                    ? "1px solid var(--mantine-color-red-5)"
                                                                    : "1px solid var(--mantine-color-gray-3)",
                                                            cursor: "pointer",
                                                        }}
                                                        onClick={() => {
                                                            // This could be modified to show a more user-friendly time editor if needed
                                                        }}
                                                    >
                                                        <IconClock
                                                            size="1.2rem"
                                                            style={{
                                                                marginRight: "12px",
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
                                                        <Group gap={8} align="center">
                                                            <TimeInput
                                                                value={formatTimeForInput(
                                                                    parcel.pickupEarliestTime,
                                                                )}
                                                                onChange={event => {
                                                                    if (
                                                                        !event ||
                                                                        !event.currentTarget
                                                                    )
                                                                        return;
                                                                    const timeStr =
                                                                        event.currentTarget.value;
                                                                    if (timeStr) {
                                                                        const newDate =
                                                                            parseTimeString(
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
                                                                size="md"
                                                                styles={{
                                                                    wrapper: { width: "70px" },
                                                                    input: {
                                                                        border: "none",
                                                                        background: "transparent",
                                                                        textAlign: "center",
                                                                        padding: 0,
                                                                        height: "auto",
                                                                        fontWeight: 500,
                                                                    },
                                                                    section: { display: "none" },
                                                                }}
                                                            />
                                                            <Text fw={500} size="sm">
                                                                -
                                                            </Text>
                                                            <TimeInput
                                                                value={formatTimeForInput(
                                                                    parcel.pickupLatestTime,
                                                                )}
                                                                onChange={event => {
                                                                    if (
                                                                        !event ||
                                                                        !event.currentTarget
                                                                    )
                                                                        return;
                                                                    const timeStr =
                                                                        event.currentTarget.value;
                                                                    if (timeStr) {
                                                                        const newDate =
                                                                            parseTimeString(
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
                                                                size="md"
                                                                styles={{
                                                                    wrapper: { width: "70px" },
                                                                    input: {
                                                                        border: "none",
                                                                        background: "transparent",
                                                                        textAlign: "center",
                                                                        padding: 0,
                                                                        height: "auto",
                                                                        fontWeight: 500,
                                                                    },
                                                                    section: { display: "none" },
                                                                }}
                                                            />
                                                        </Group>
                                                    </Paper>
                                                </Tooltip>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Paper>
                </>
            )}
        </Card>
    );
}
