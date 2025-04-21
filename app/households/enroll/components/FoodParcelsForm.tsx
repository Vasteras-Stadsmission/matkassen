"use client";

import { useState, useEffect } from "react";
import {
    SimpleGrid,
    Group,
    Button,
    Title,
    Text,
    Card,
    Select,
    Table,
    SegmentedControl,
    Stack,
    Popover,
} from "@mantine/core";
import { DatePickerInput, TimeInput } from "@mantine/dates";
import { nanoid } from "@/app/db/schema";
import { IconCalendarEvent, IconRefresh, IconClock, IconCalendar } from "@tabler/icons-react";
import { getPickupLocations } from "../actions";
import { FoodParcels, FoodParcel } from "../types";
import CounterInput from "@/components/CounterInput";

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

export default function FoodParcelsForm({ data, updateData, error }: FoodParcelsFormProps) {
    const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
    const [loading, setLoading] = useState(true);
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

    // Update formState when parent data changes (e.g., when navigating back to this step)
    useEffect(() => {
        // Clear location error if we have a pickupLocationId
        if (data.pickupLocationId) {
            setLocationError(null);
        }

        setFormState(prevState => ({
            ...prevState,
            pickupLocationId: data.pickupLocationId || prevState.pickupLocationId,
            totalCount: data.totalCount || prevState.totalCount,
            weekday: data.weekday || prevState.weekday,
            repeatValue: data.repeatValue || prevState.repeatValue,
            startDate: data.startDate ? new Date(data.startDate) : prevState.startDate,
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
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    // Clear location error when user selects a location
    const handleLocationChange = (value: string | null) => {
        setLocationError(null);
        handleParameterChange("pickupLocationId", value);
    };

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

    // Round time to nearest 15 minutes
    const roundToNearest15Minutes = (date: Date): Date => {
        const minutes = date.getMinutes();
        const roundedMinutes = Math.round(minutes / 15) * 15;

        const newDate = new Date(date);
        newDate.setMinutes(roundedMinutes);
        return newDate;
    };

    // Generate parcels on first load
    useEffect(() => {
        if (formState.parcels.length === 0) {
            applyChanges();
        }
    }, []);

    // Convert weekday options to format needed for SegmentedControl
    const weekdayOptions = WEEKDAYS.map(day => ({
        value: day.value,
        label: day.label,
    }));

    // Convert repeat options to format needed for SegmentedControl
    const repeatOptions = REPEAT_OPTIONS.map(option => ({
        value: option.value,
        label: option.label,
    }));

    // Create a custom time component with only 15-minute intervals
    const TimePickerInput = ({
        value,
        onChange,
        label,
    }: {
        value: string;
        onChange: (value: string) => void;
        label?: string;
    }) => {
        // Parse the current hours and minutes
        const [hours, minutes] = value.split(":").map(Number);

        // List of allowed minute values (15-minute intervals)
        const minuteOptions = ["00", "15", "30", "45"];

        // Generate hour options (00-23)
        const hourOptions = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));

        // Handle time selection
        const handleTimeChange = (newHours: string, newMinutes: string) => {
            onChange(`${newHours}:${newMinutes}`);
        };

        const [isOpen, setIsOpen] = useState(false);

        return (
            <Popover
                opened={isOpen}
                onChange={setIsOpen}
                width={220}
                position="bottom-start"
                withinPortal
                shadow="md"
            >
                <Popover.Target>
                    <div
                        onClick={() => setIsOpen(!isOpen)}
                        style={{
                            cursor: "pointer",
                            position: "relative",
                            display: "flex",
                            alignItems: "center",
                            userSelect: "none", // Prevent text selection
                        }}
                    >
                        <TimeInput
                            value={value}
                            onChange={e => {}} // Handled by our custom picker
                            leftSection={<IconClock size="1rem" />}
                            rightSectionWidth={0} // Remove right icon
                            readOnly // Make it read-only since we use our custom picker
                            styles={{
                                input: {
                                    cursor: "pointer",
                                    userSelect: "none", // Prevent text selection in input
                                    WebkitUserSelect: "none", // For Safari
                                    MozUserSelect: "none", // For Firefox
                                    msUserSelect: "none", // For IE/Edge
                                },
                                wrapper: {
                                    cursor: "pointer",
                                    width: "100%",
                                    userSelect: "none", // Prevent text selection in wrapper
                                },
                                section: {
                                    pointerEvents: "none", // Make icon non-interactive
                                },
                            }}
                            aria-label={label || "Select time"}
                            onClick={e => {
                                // Prevent default selection behavior
                                e.preventDefault();
                                setIsOpen(!isOpen);
                            }}
                            onMouseDown={e => {
                                // Prevent text selection on mouse down
                                e.preventDefault();
                            }}
                        />
                    </div>
                </Popover.Target>
                <Popover.Dropdown>
                    <div
                        style={{
                            display: "flex",
                            width: "100%",
                        }}
                    >
                        {/* Hours column */}
                        <div
                            style={{
                                flex: 1,
                                borderRight: "1px solid #eee",
                                maxHeight: "250px",
                                overflowY: "auto",
                            }}
                        >
                            {hourOptions.map(hour => (
                                <div
                                    key={hour}
                                    onClick={() => {
                                        handleTimeChange(hour, minutes.toString().padStart(2, "0"));
                                        setIsOpen(false);
                                    }}
                                    style={{
                                        padding: "8px 16px",
                                        cursor: "pointer",
                                        backgroundColor:
                                            hour === hours.toString().padStart(2, "0")
                                                ? "#e6f7ff"
                                                : "transparent",
                                        fontWeight:
                                            hour === hours.toString().padStart(2, "0")
                                                ? "bold"
                                                : "normal",
                                        textAlign: "center",
                                    }}
                                >
                                    {hour}
                                </div>
                            ))}
                        </div>

                        {/* Minutes column */}
                        <div
                            style={{
                                flex: 1,
                                maxHeight: "250px",
                                overflowY: "auto",
                            }}
                        >
                            {minuteOptions.map(minute => (
                                <div
                                    key={minute}
                                    onClick={() => {
                                        handleTimeChange(hours.toString().padStart(2, "0"), minute);
                                        setIsOpen(false);
                                    }}
                                    style={{
                                        padding: "8px 16px",
                                        cursor: "pointer",
                                        backgroundColor:
                                            minute === minutes.toString().padStart(2, "0")
                                                ? "#e6f7ff"
                                                : "transparent",
                                        fontWeight:
                                            minute === minutes.toString().padStart(2, "0")
                                                ? "bold"
                                                : "normal",
                                        textAlign: "center",
                                    }}
                                >
                                    {minute}
                                </div>
                            ))}
                        </div>
                    </div>
                </Popover.Dropdown>
            </Popover>
        );
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

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="lg">
                <Select
                    label="Hämtplats"
                    placeholder="Välj hämtplats"
                    data={pickupLocations}
                    value={formState.pickupLocationId}
                    onChange={handleLocationChange}
                    withAsterisk
                    error={locationError}
                />

                <div>
                    <Text fw={500} size="sm" mb={7}>
                        Antal matkassar{" "}
                        <span style={{ color: "var(--mantine-color-red-6)" }}>*</span>
                    </Text>
                    <CounterInput
                        value={formState.totalCount}
                        onChange={value => handleParameterChange("totalCount", value)}
                        min={1}
                        max={52}
                    />
                </div>

                <Stack gap="xs">
                    <Text fw={500} size="sm" mb={0}>
                        Standard veckodag{" "}
                        <span style={{ color: "var(--mantine-color-red-6)" }}>*</span>
                    </Text>
                    <SegmentedControl
                        fullWidth
                        value={formState.weekday}
                        onChange={value => handleParameterChange("weekday", value)}
                        data={weekdayOptions}
                    />
                </Stack>

                <Stack gap="xs">
                    <Text fw={500} size="sm" mb={0}>
                        Upprepning <span style={{ color: "var(--mantine-color-red-6)" }}>*</span>
                    </Text>
                    <SegmentedControl
                        fullWidth
                        value={formState.repeatValue}
                        onChange={value => handleParameterChange("repeatValue", value)}
                        data={repeatOptions}
                    />
                </Stack>

                <DatePickerInput
                    label="Startdatum"
                    placeholder="Välj startdatum"
                    value={formState.startDate}
                    onChange={value => value && handleParameterChange("startDate", value)}
                    minDate={new Date()}
                    withAsterisk
                    leftSection={<IconCalendarEvent size="1rem" />}
                    popoverProps={{
                        shadow: "md",
                        withinPortal: true,
                        width: 280, // Control popover width
                        styles: {
                            dropdown: {
                                padding: "0.5rem",
                            },
                        },
                    }}
                    getDayProps={date => {
                        const day = date.getDay();
                        const isWeekend = day === 0 || day === 6;
                        const isSelected =
                            date.toDateString() === formState.startDate.toDateString();

                        return {
                            style: {
                                color: isWeekend ? "red" : isSelected ? "white" : undefined,
                                backgroundColor: isSelected ? "#228be6" : undefined,
                                fontWeight: isSelected ? 500 : undefined,
                            },
                        };
                    }}
                />
            </SimpleGrid>

            <Group justify="center" mb="md">
                <Button
                    onClick={applyChanges}
                    leftSection={<IconRefresh size="1rem" />}
                    color="teal"
                    variant="outline"
                >
                    Uppdatera schema
                </Button>
            </Group>

            {formState.parcels.length > 0 && (
                <>
                    <Title order={5} mt="md" mb="sm">
                        Schemalagda matkassar
                    </Title>
                    <Text size="sm" mb="md" color="dimmed">
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
                                            leftSection={<IconCalendar size="1rem" />}
                                            popoverProps={{
                                                shadow: "md",
                                                withinPortal: true,
                                                width: 280, // Control popover width
                                                styles: {
                                                    dropdown: {
                                                        padding: "0.5rem",
                                                    },
                                                },
                                            }}
                                            styles={{
                                                input: {
                                                    cursor: "pointer",
                                                    color: "inherit",
                                                    fontWeight: "normal",
                                                    textDecoration: "none",
                                                },
                                            }}
                                            getDayProps={date => {
                                                const day = date.getDay();
                                                const isWeekend = day === 0 || day === 6;
                                                const isSelected =
                                                    date.toDateString() ===
                                                    new Date(parcel.pickupDate).toDateString();

                                                return {
                                                    style: {
                                                        color: isWeekend
                                                            ? "red"
                                                            : isSelected
                                                              ? "white"
                                                              : undefined,
                                                        backgroundColor: isSelected
                                                            ? "#228be6"
                                                            : undefined,
                                                        fontWeight: isSelected ? 500 : undefined,
                                                    },
                                                };
                                            }}
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <TimePickerInput
                                            value={formatTimeForInput(parcel.pickupEarliestTime)}
                                            onChange={timeStr => {
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
                                            label="Tidigast hämttid"
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <TimePickerInput
                                            value={formatTimeForInput(parcel.pickupLatestTime)}
                                            onChange={timeStr => {
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
                                            label="Senast hämttid"
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