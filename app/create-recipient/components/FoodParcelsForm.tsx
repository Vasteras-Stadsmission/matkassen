"use client";

import { useState, useEffect } from "react";
import {
    SimpleGrid,
    Group,
    Button,
    Title,
    Text,
    Card,
    NumberInput,
    Select,
    Table,
} from "@mantine/core";
import { DateInput, TimeInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { nanoid } from "@/app/db/schema";
import { IconCalendarEvent, IconCheck, IconClock } from "@tabler/icons-react";
import { getPickupLocations } from "../actions";

interface FoodParcel {
    id?: string;
    pickupDate: Date;
    pickupEarliestTime: Date;
    pickupLatestTime: Date;
}

interface FoodParcels {
    pickupLocationId: string;
    totalCount: number;
    weekday: string;
    repeatValue: string;
    startDate: Date;
    parcels: FoodParcel[];
}

interface PickupLocation {
    value: string;
    label: string;
}

interface FoodParcelsFormProps {
    data: FoodParcels;
    updateData: (data: FoodParcels) => void;
}

// Week days
const WEEKDAYS = [
    { value: "1", label: "Måndag" },
    { value: "2", label: "Tisdag" },
    { value: "3", label: "Onsdag" },
    { value: "4", label: "Torsdag" },
    { value: "5", label: "Fredag" },
    { value: "6", label: "Lördag" },
    { value: "0", label: "Söndag" },
];

// Repeat options
const REPEAT_OPTIONS = [
    { value: "weekly", label: "Varje vecka" },
    { value: "biweekly", label: "Varannan vecka" },
    { value: "monthly", label: "Varje månad" },
];

export default function FoodParcelsForm({ data, updateData }: FoodParcelsFormProps) {
    const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
    const [loading, setLoading] = useState(true);

    // Use the data from parent component or initialize with defaults
    const [formState, setFormState] = useState<FoodParcels>({
        pickupLocationId: data.pickupLocationId || "",
        totalCount: data.totalCount || 4,
        weekday: data.weekday || "1",
        repeatValue: data.repeatValue || "weekly",
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
        parcels: data.parcels || [],
    });

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
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    // Generate food parcels based on schedule parameters
    const generateParcels = (): FoodParcel[] => {
        const { totalCount, weekday, repeatValue, startDate } = formState;
        const parcels: FoodParcel[] = [];

        let currentDate = new Date(startDate);
        // Set to the specified weekday if it's not already
        const currentWeekday = currentDate.getDay();
        const targetWeekday = parseInt(weekday);
        const daysToAdd = (targetWeekday + 7 - currentWeekday) % 7;

        if (daysToAdd > 0) {
            currentDate.setDate(currentDate.getDate() + daysToAdd);
        }

        for (let i = 0; i < totalCount; i++) {
            // Default pickup times (12:00-13:00)
            const earliestTime = new Date(currentDate);
            earliestTime.setHours(12, 0, 0);

            const latestTime = new Date(currentDate);
            latestTime.setHours(13, 0, 0);

            parcels.push({
                id: nanoid(8),
                pickupDate: new Date(currentDate),
                pickupEarliestTime: earliestTime,
                pickupLatestTime: latestTime,
            });

            // Calculate next date based on repeat option
            switch (repeatValue) {
                case "weekly":
                    currentDate.setDate(currentDate.getDate() + 7);
                    break;
                case "biweekly":
                    currentDate.setDate(currentDate.getDate() + 14);
                    break;
                case "monthly":
                    currentDate.setMonth(currentDate.getMonth() + 1);
                    break;
            }
        }

        return parcels;
    };

    // Update state when parameters change
    const handleParameterChange = (field: keyof FoodParcels, value: any) => {
        setFormState(prev => ({ ...prev, [field]: value }));
    };

    // Apply changes and generate parcels
    const applyChanges = () => {
        const parcels = generateParcels();
        const updatedState = { ...formState, parcels };
        setFormState(updatedState);
        updateData(updatedState);
    };

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

    // Format date for display
    const formatDate = (date: Date | string | null | undefined) => {
        if (!date) return "";
        return new Date(date).toLocaleDateString("sv-SE", {
            year: "numeric",
            month: "long",
            day: "numeric",
            weekday: "long",
        });
    };

    // Format time for display
    const formatTime = (date: Date | string | null | undefined) => {
        if (!date) return "";
        return new Date(date).toLocaleTimeString("sv-SE", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
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

    // Generate parcels on first load
    useEffect(() => {
        if (formState.parcels.length === 0) {
            applyChanges();
        }
    }, []);

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                Matkassar
            </Title>
            <Text color="dimmed" size="sm" mb="lg">
                Schemalägg matkassar för hushållet med hämtplats och tider.
            </Text>

            <Title order={5} mb="sm">
                Inställningar för schemaläggning
            </Title>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="lg">
                <Select
                    label="Hämtplats"
                    placeholder="Välj hämtplats"
                    data={pickupLocations}
                    value={formState.pickupLocationId}
                    onChange={value => handleParameterChange("pickupLocationId", value)}
                    withAsterisk
                />

                <NumberInput
                    label="Antal matkassar"
                    placeholder="Ange antal matkassar"
                    value={formState.totalCount}
                    onChange={value => handleParameterChange("totalCount", value)}
                    min={1}
                    max={52}
                    withAsterisk
                />

                <Select
                    label="Veckodag för hämtning"
                    placeholder="Välj veckodag"
                    data={WEEKDAYS}
                    value={formState.weekday}
                    onChange={value => handleParameterChange("weekday", value)}
                    withAsterisk
                />

                <Select
                    label="Upprepning"
                    placeholder="Välj hur ofta"
                    data={REPEAT_OPTIONS}
                    value={formState.repeatValue}
                    onChange={value => handleParameterChange("repeatValue", value)}
                    withAsterisk
                />

                <DateInput
                    label="Startdatum"
                    placeholder="Välj startdatum"
                    value={formState.startDate}
                    onChange={value => handleParameterChange("startDate", value)}
                    minDate={new Date()}
                    withAsterisk
                    leftSection={<IconCalendarEvent size="1rem" />}
                />
            </SimpleGrid>

            <Group justify="center" mb="xl">
                <Button onClick={applyChanges} leftSection={<IconCheck size="1rem" />} color="blue">
                    Uppdatera schema
                </Button>
            </Group>

            {formState.parcels.length > 0 && (
                <>
                    <Title order={5} mt="xl" mb="sm">
                        Schemalagda matkassar
                    </Title>
                    <Text size="sm" mb="md" color="dimmed">
                        Anpassa hämttider för varje matkasse nedan. Standardhämttid är 12:00-13:00.
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
                                    <Table.Td>{formatDate(parcel.pickupDate)}</Table.Td>
                                    <Table.Td>
                                        <TimeInput
                                            leftSection={<IconClock size="1rem" />}
                                            value={formatTimeForInput(parcel.pickupEarliestTime)}
                                            onChange={e => {
                                                const timeStr = e.currentTarget.value;
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
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <TimeInput
                                            leftSection={<IconClock size="1rem" />}
                                            value={formatTimeForInput(parcel.pickupLatestTime)}
                                            onChange={e => {
                                                const timeStr = e.currentTarget.value;
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
