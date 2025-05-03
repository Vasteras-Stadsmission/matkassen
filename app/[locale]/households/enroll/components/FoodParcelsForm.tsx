"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
} from "@mantine/core";
import { DatePicker, TimeInput } from "@mantine/dates";
import { nanoid } from "@/app/db/schema";
import {
    IconClock,
    IconCalendar,
    IconWand,
    IconCheck,
    IconX,
    IconExclamationMark,
} from "@tabler/icons-react";
import {
    getPickupLocations,
    checkPickupLocationCapacity,
    getPickupLocationCapacityForRange,
} from "../actions";
import { FoodParcels, FoodParcel } from "../types";
import { useTranslations } from "next-intl";

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
    const t = useTranslations("foodParcels");

    const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [timeErrors, setTimeErrors] = useState<{ [key: string]: string }>({});
    const [bulkTimeMode, setBulkTimeMode] = useState(false);
    const [bulkEarliestTime, setBulkEarliestTime] = useState("12:00");
    const [bulkLatestTime, setBulkLatestTime] = useState("13:00");
    const [bulkTimeError, setBulkTimeError] = useState<string | null>(null);

    /* eslint-disable @typescript-eslint/no-unused-vars */
    const [_capacityNotification, setCapacityNotification] = useState<{
        date: Date;
        message: string;
        isAvailable: boolean;
    } | null>(null);
    const [_checkingCapacity, setCheckingCapacity] = useState(false);
    /* eslint-enable @typescript-eslint/no-unused-vars */
    const capacityNotificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const [capacityData, setCapacityData] = useState<{
        hasLimit: boolean;
        maxPerDay: number | null;
        dateCapacities: Record<string, number>;
    } | null>(null);
    const [loadingCapacityData, setLoadingCapacityData] = useState(false);

    const [formState, setFormState] = useState<FoodParcels>({
        pickupLocationId: data.pickupLocationId || "",
        totalCount: data.totalCount || 4,
        weekday: data.weekday || "1",
        repeatValue: data.repeatValue || "weekly",
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
        parcels: data.parcels || [],
    });

    const [selectedDates, setSelectedDates] = useState<Date[]>(
        data.parcels?.map(parcel => new Date(parcel.pickupDate)) || [],
    );

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
                const locations = await getPickupLocations();

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
            } catch (error) {
                console.error("Error fetching pickup locations:", error);
                setPickupLocations([
                    { value: "loc1", label: "Västerås Stadsmission" },
                    { value: "loc2", label: "Klara Kyrka" },
                ]);
            }
        }

        fetchData();
    }, []);

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

            try {
                setLoadingCapacityData(true);

                const startDate = new Date();
                const endDate = new Date();
                endDate.setMonth(endDate.getMonth() + 3);

                const capacityInfo = await getPickupLocationCapacityForRange(
                    formState.pickupLocationId,
                    startDate,
                    endDate,
                );

                setCapacityData(capacityInfo);
            } catch (error) {
                console.error("Error fetching capacity data:", error);
                setCapacityData(null);
            } finally {
                setLoadingCapacityData(false);
            }
        }

        fetchCapacityData();
    }, [formState.pickupLocationId]);

    const isDateExcluded = useCallback(
        (date: Date): boolean => {
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
        },
        [capacityData, selectedDates],
    );

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

        if (isFullyBooked) {
            dayStyle = {
                backgroundColor: "var(--mantine-color-red-0)",
                color: "var(--mantine-color-red-8)",
                textDecoration: "line-through",
                opacity: 0.7,
                fontWeight: 400,
            };
        }

        if (isWeekend && !isFullyBooked) {
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

    /* eslint-disable @typescript-eslint/no-unused-vars */
    const _checkDateCapacity = useCallback(
        async (date: Date) => {
            if (!formState.pickupLocationId) {
                return { isAvailable: true };
            }

            try {
                setCheckingCapacity(true);

                const capacity = await checkPickupLocationCapacity(
                    formState.pickupLocationId,
                    date,
                );

                const dateString = new Date(date).toDateString();
                const existingDateCount = selectedDates.filter(
                    selectedDate => new Date(selectedDate).toDateString() === dateString,
                ).length;

                const adjustedCount = capacity.currentCount + existingDateCount;
                const stillAvailable =
                    capacity.maxCount === null || adjustedCount < capacity.maxCount;

                if (capacity.maxCount !== null) {
                    const isNearCapacity = adjustedCount >= Math.floor(capacity.maxCount * 0.8);

                    const adjustedCapacity = {
                        ...capacity,
                        isAvailable: stillAvailable,
                        currentCount: adjustedCount,
                        message: stillAvailable
                            ? `${adjustedCount} av ${capacity.maxCount} bokade`
                            : `Max antal (${capacity.maxCount}) matkassar bokade för detta datum`,
                    };

                    if (!stillAvailable || isNearCapacity) {
                        setCapacityNotification({
                            date,
                            message: adjustedCapacity.message,
                            isAvailable: adjustedCapacity.isAvailable,
                        });

                        if (capacityNotificationTimeoutRef.current) {
                            clearTimeout(capacityNotificationTimeoutRef.current);
                        }

                        capacityNotificationTimeoutRef.current = setTimeout(() => {
                            setCapacityNotification(null);
                        }, 5000);
                    }

                    return adjustedCapacity;
                }

                return capacity;
            } catch (error) {
                console.error("Error checking pickup location capacity:", error);
                return { isAvailable: true };
            } finally {
                setCheckingCapacity(false);
            }
        },
        [formState.pickupLocationId, selectedDates],
    );
    /* eslint-enable @typescript-eslint/no-unused-vars */

    const generateParcels = useCallback((): FoodParcel[] => {
        return selectedDates.map(date => {
            const existingParcel = formState.parcels.find(
                p => new Date(p.pickupDate).toDateString() === new Date(date).toDateString(),
            );

            if (existingParcel) {
                return { ...existingParcel };
            }

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

    const handleDatesChange = (dates: Date[]) => {
        // If the user is trying to add a new date (length has increased)
        if (dates.length > selectedDates.length) {
            const addedDate = dates.find(
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
        setSelectedDates(dates);
    };

    const handleParameterChange = (field: keyof FoodParcels, value: unknown) => {
        setFormState(prev => ({ ...prev, [field]: value }));
    };

    const applyChanges = useCallback(() => {
        const parcels = generateParcels();
        const updatedState = {
            ...formState,
            parcels,
            totalCount: selectedDates.length,
        };

        if (
            JSON.stringify(updatedState.parcels) !== JSON.stringify(formState.parcels) ||
            updatedState.totalCount !== formState.totalCount
        ) {
            setFormState(updatedState);
            updateData(updatedState);
        }
    }, [formState, generateParcels, updateData, selectedDates.length]);

    const updateParcelTime = (index: number, field: keyof FoodParcel, time: Date) => {
        const updatedParcels = [...formState.parcels];
        const parcel = updatedParcels[index];

        const tempParcel = {
            ...parcel,
            [field]: time,
        };

        const errorKey = `${index}-${field}`;
        const oppositeField =
            field === "pickupEarliestTime" ? "pickupLatestTime" : "pickupEarliestTime";
        const oppositeErrorKey = `${index}-${oppositeField}`;

        const newTimeErrors = { ...timeErrors };
        delete newTimeErrors[errorKey];

        if (
            field === "pickupEarliestTime" &&
            tempParcel.pickupEarliestTime >= tempParcel.pickupLatestTime
        ) {
            newTimeErrors[errorKey] = t("time.error");
        } else if (
            field === "pickupLatestTime" &&
            tempParcel.pickupLatestTime <= tempParcel.pickupEarliestTime
        ) {
            newTimeErrors[errorKey] = t("time.error");
        } else {
            delete newTimeErrors[oppositeErrorKey];
        }

        setTimeErrors(newTimeErrors);

        updatedParcels[index] = tempParcel;

        const updatedState = { ...formState, parcels: updatedParcels };
        setFormState(updatedState);
        updateData(updatedState);
    };

    const formatTimeForInput = (date: Date): string => {
        return date.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    const parseTimeString = (timeStr: string, baseDate: Date): Date => {
        let hours = 0;
        let minutes = 0;

        if (!timeStr) {
            const current = new Date(baseDate);
            return current;
        }

        const parts = timeStr.split(":");
        if (parts.length === 2) {
            hours = parseInt(parts[0], 10) || 0;
            minutes = parseInt(parts[1], 10) || 0;
        } else if (timeStr.length === 1 || timeStr.length === 2) {
            hours = parseInt(timeStr, 10) || 0;
            minutes = 0;
        } else if (timeStr.length === 3) {
            hours = parseInt(timeStr.substring(0, 1), 10) || 0;
            minutes = parseInt(timeStr.substring(1), 10) || 0;
        } else if (timeStr.length === 4) {
            hours = parseInt(timeStr.substring(0, 2), 10) || 0;
            minutes = parseInt(timeStr.substring(2), 10) || 0;
        }

        hours = Math.min(Math.max(hours, 0), 23);
        minutes = Math.min(Math.max(minutes, 0), 59);

        const newDate = new Date(baseDate);
        newDate.setHours(hours, minutes, 0, 0);
        return newDate;
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
        if (selectedDates.length > 0) {
            applyChanges();
        }
    }, [selectedDates, applyChanges]);

    const applyBulkTimeUpdate = () => {
        const earliestParts = bulkEarliestTime.split(":").map(part => parseInt(part, 10));
        const latestParts = bulkLatestTime.split(":").map(part => parseInt(part, 10));

        const earliestDate = new Date();
        earliestDate.setHours(earliestParts[0] || 0, earliestParts[1] || 0, 0, 0);

        const latestDate = new Date();
        latestDate.setHours(latestParts[0] || 0, latestParts[1] || 0, 0, 0);

        if (earliestDate >= latestDate) {
            setBulkTimeError(t("time.error"));
            return;
        }

        setBulkTimeError(null);

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
            <Text c="dimmed" size="sm" mb="lg">
                {t("description")}
            </Text>

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
                            value={selectedDates}
                            onChange={handleDatesChange}
                            minDate={new Date()}
                            numberOfColumns={2}
                            renderDay={renderDay}
                            excludeDate={isDateExcluded}
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
                                    <Text size="sm" c="dimmed">
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
                                color="blue"
                                style={{
                                    position: "absolute",
                                    top: "50%",
                                    left: "50%",
                                    transform: "translate(-50%, -50%)",
                                    pointerEvents: "none",
                                }}
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
                                        color="var(--mantine-color-blue-6)"
                                        opacity={0.5}
                                    />
                                </Box>
                            </Tooltip>
                        )}
                    </Box>
                    <Text size="xs" c="dimmed">
                        {t("selectDatesHint")}
                    </Text>
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
                                color="indigo"
                                size="xs"
                                onClick={() => setBulkTimeMode(true)}
                            >
                                {t("setBulkTimes")}
                            </Button>
                        ) : (
                            <Text size="xs" c="dimmed">
                                {t("editingAllTimes")}
                            </Text>
                        )}
                    </Group>

                    {bulkTimeMode ? (
                        <Paper p="md" withBorder radius="md" mb="md">
                            <Stack>
                                <Text fw={500} size="sm">
                                    {t("bulkTimeHint")}
                                </Text>

                                {bulkTimeError && (
                                    <Text size="xs" c="red">
                                        {bulkTimeError}
                                    </Text>
                                )}

                                <Group align="flex-end">
                                    <Box style={{ width: "150px" }}>
                                        <Text size="xs" fw={500} pb={5}>
                                            {t("time.earliest")}
                                        </Text>
                                        <TimeInput
                                            value={bulkEarliestTime}
                                            onChange={event =>
                                                setBulkEarliestTime(event.currentTarget.value)
                                            }
                                            size="xs"
                                            leftSection={<IconClock size="1rem" />}
                                            aria-label={t("time.earliest")}
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
                                            {t("time.latest")}
                                        </Text>
                                        <TimeInput
                                            value={bulkLatestTime}
                                            onChange={event =>
                                                setBulkLatestTime(event.currentTarget.value)
                                            }
                                            size="xs"
                                            leftSection={<IconClock size="1rem" />}
                                            aria-label={t("time.latest")}
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
                                            {t("time.updateAll")}
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
                        {bulkTimeMode ? t("bulkTimeHint") : t("individualTimeHint")}
                    </Text>

                    <Paper radius="md" withBorder shadow="xs">
                        <Table striped={false} highlightOnHover verticalSpacing="sm">
                            <Table.Thead>
                                <Table.Tr bg="gray.0">
                                    <Table.Th>{t("time.dateAndPickup")}</Table.Th>
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
                                                        onClick={() => {}}
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
