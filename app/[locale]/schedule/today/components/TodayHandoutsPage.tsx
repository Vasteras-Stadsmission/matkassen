"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter, usePathname } from "@/app/i18n/navigation";
import {
    Container,
    Title,
    Grid,
    Stack,
    Text,
    Paper,
    Loader,
    Center,
    Select,
    Group,
    Card,
    Badge,
    Button,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconClock, IconMapPin, IconPackage } from "@tabler/icons-react";
import { format } from "date-fns";
import { getTodaysParcels, getPickupLocations } from "../../actions";
import { ParcelAdminDialog } from "@/components/ParcelAdminDialog";
import type { FoodParcel, PickupLocation } from "../../types";

// Enhanced type for today's view with additional computed fields
interface TodayParcel extends FoodParcel {
    locationName?: string;
    timeSlot?: string;
    status?: "scheduled" | "completed";
}

interface GroupedParcels {
    [locationId: string]: {
        location: PickupLocation;
        parcels: TodayParcel[];
    };
}

export function TodayHandoutsPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    // State
    const [parcels, setParcels] = useState<TodayParcel[]>([]);
    const [locations, setLocations] = useState<PickupLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLocation, setSelectedLocation] = useState<string>("");
    const [highlightedParcelId, setHighlightedParcelId] = useState<string | null>(null);

    // Modal state
    const [dialogOpened, { open: openDialog, close: closeDialog }] = useDisclosure(false);
    const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);

    const today = new Date();

    // Handle deep link to specific parcel (like QR code scans)
    useEffect(() => {
        const parcelId = searchParams.get("parcel");
        if (parcelId) {
            if (selectedParcelId !== parcelId || !dialogOpened) {
                setHighlightedParcelId(parcelId);
                // Find the parcel and auto-select its location
                const parcel = parcels.find(p => p.id === parcelId);
                if (parcel && parcel.pickup_location_id) {
                    setSelectedLocation(parcel.pickup_location_id);
                }
                setSelectedParcelId(parcelId);
                openDialog();
            }
        } else if (dialogOpened || selectedParcelId) {
            closeDialog();
            setSelectedParcelId(null);
            setHighlightedParcelId(null);
        }
    }, [searchParams, parcels, selectedParcelId, dialogOpened, openDialog, closeDialog]);

    // Load data
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [parcelsData, locationsData] = await Promise.all([
                getTodaysParcels(),
                getPickupLocations(),
            ]);

            // Enhance parcels with location info and computed fields
            const enhancedParcels = parcelsData.map((parcel): TodayParcel => {
                const location = locationsData.find(l => l.id === parcel.pickup_location_id);
                return {
                    ...parcel,
                    locationName: location?.name,
                    timeSlot:
                        format(parcel.pickupEarliestTime, "HH:mm") +
                        "-" +
                        format(parcel.pickupLatestTime, "HH:mm"),
                    status: parcel.isPickedUp ? "completed" : "scheduled",
                };
            });

            console.log(
                "QR Code Debug - All parcel IDs:",
                enhancedParcels.map(p => p.id),
            );
            console.log("QR Code Debug - Looking for highlighted parcel:", highlightedParcelId);

            setParcels(enhancedParcels);
            setLocations(locationsData);
        } catch (error) {
            console.error("Error loading today's parcels:", error);
        } finally {
            setLoading(false);
        }
    }, [highlightedParcelId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Group parcels by location - only show parcels when a location is selected
    const groupedParcels = useMemo(() => {
        // Don't show any parcels until a location is selected
        if (!selectedLocation) {
            return {};
        }

        const filtered = parcels.filter(p => p.pickup_location_id === selectedLocation);
        const grouped: GroupedParcels = {};

        filtered.forEach(parcel => {
            const locationId = parcel.pickup_location_id;
            if (!locationId) return; // Skip if no location ID

            if (!grouped[locationId]) {
                const location = locations.find(l => l.id === locationId);
                if (location) {
                    grouped[locationId] = {
                        location,
                        parcels: [],
                    };
                }
            }
            if (grouped[locationId]) {
                grouped[locationId].parcels.push(parcel);
            }
        });

        // Sort parcels within each location by pickup time
        Object.values(grouped).forEach(group => {
            group.parcels.sort((a, b) => {
                const timeA = a.timeSlot || "";
                const timeB = b.timeSlot || "";
                return timeA.localeCompare(timeB);
            });
        });

        return grouped;
    }, [parcels, locations, selectedLocation]);

    // Handle parcel click
    const handleParcelClick = useCallback(
        (parcel: TodayParcel) => {
            setSelectedParcelId(parcel.id);
            openDialog();
        },
        [openDialog],
    );

    // Close modal callback
    const handleDialogClose = useCallback(() => {
        // Remove parcel param from URL
        const params = new URLSearchParams(searchParams.toString());
        params.delete("parcel");
        const newUrl = `${pathname}?${params.toString()}`;
        router.replace(newUrl);
        // State will be synced by the effect on searchParams

        // Reload data to get updated status
        loadData();
    }, [searchParams, pathname, router, loadData]);

    if (loading) {
        return (
            <Container size="xl" py="md">
                <Center>
                    <Loader size="lg" />
                </Center>
            </Container>
        );
    }

    // Calculate progress based on selected location only
    const locationParcels = selectedLocation
        ? parcels.filter(p => p.pickup_location_id === selectedLocation)
        : [];
    const totalParcels = locationParcels.length;
    const completedParcels = locationParcels.filter(p => p.status === "completed").length;

    return (
        <Container size="xl" py="md">
            <Stack gap="md">
                {/* Header */}
                <Group justify="space-between" align="center">
                    <div>
                        <Title order={1} size="h2">
                            Today's Handouts
                        </Title>
                        <Text c="dimmed" size="sm">
                            {format(today, "EEEE, MMMM d, yyyy")}
                        </Text>
                    </div>
                    <Group>
                        {selectedLocation && (
                            <Badge
                                variant="light"
                                color={
                                    completedParcels === totalParcels && totalParcels > 0
                                        ? "green"
                                        : "blue"
                                }
                                size="lg"
                            >
                                {completedParcels}/{totalParcels} completed
                            </Badge>
                        )}
                    </Group>
                </Group>

                {/* Location Selection */}
                <Paper p="md" withBorder>
                    <Group>
                        <IconMapPin size={20} />
                        <Select
                            placeholder="Select a location to view parcels"
                            value={selectedLocation}
                            onChange={value => setSelectedLocation(value || "")}
                            data={locations.map(location => ({
                                value: location.id,
                                label: location.name,
                            }))}
                            style={{ flex: 1, maxWidth: 300 }}
                        />
                        {selectedLocation && (
                            <Button
                                variant="subtle"
                                size="sm"
                                onClick={() => setSelectedLocation("")}
                            >
                                Clear selection
                            </Button>
                        )}
                    </Group>
                </Paper>

                {/* Parcels Grid */}
                {Object.keys(groupedParcels).length === 0 ? (
                    <Paper p="xl" withBorder>
                        <Center>
                            <Stack align="center" gap="md">
                                <IconPackage size={48} color="gray" />
                                <Text size="lg" c="dimmed">
                                    {selectedLocation
                                        ? "No parcels scheduled for today at this location"
                                        : "Select a location to view today's parcels"}
                                </Text>
                            </Stack>
                        </Center>
                    </Paper>
                ) : (
                    <Grid>
                        {Object.entries(groupedParcels).map(([locationId, group]) => (
                            <Grid.Col key={locationId} span={{ base: 12, sm: 6, lg: 4 }}>
                                <Card withBorder h="100%">
                                    <Card.Section p="md" bg="blue.1">
                                        <Group justify="space-between" align="center">
                                            <div>
                                                <Text fw={600} size="lg">
                                                    {group.location.name}
                                                </Text>
                                                <Text size="sm" c="dimmed">
                                                    {group.parcels.length} parcels
                                                </Text>
                                            </div>
                                            <IconMapPin size={20} color="blue" />
                                        </Group>
                                    </Card.Section>

                                    <Card.Section p="md">
                                        <Stack gap="xs">
                                            {group.parcels.map(parcel => {
                                                const isHighlighted =
                                                    highlightedParcelId === parcel.id;
                                                if (highlightedParcelId) {
                                                    console.log(
                                                        "QR Code Debug - Checking parcel:",
                                                        parcel.id,
                                                        "against highlighted:",
                                                        highlightedParcelId,
                                                        "match:",
                                                        isHighlighted,
                                                    );
                                                }

                                                return (
                                                    <Paper
                                                        key={parcel.id}
                                                        p="sm"
                                                        withBorder
                                                        style={{
                                                            cursor: "pointer",
                                                            backgroundColor: isHighlighted
                                                                ? "var(--mantine-color-yellow-1)"
                                                                : undefined,
                                                            borderColor: isHighlighted
                                                                ? "var(--mantine-color-yellow-4)"
                                                                : undefined,
                                                        }}
                                                        onClick={() => handleParcelClick(parcel)}
                                                    >
                                                        <Group
                                                            justify="space-between"
                                                            wrap="nowrap"
                                                        >
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <Text fw={600} size="sm" truncate>
                                                                    {parcel.householdName}
                                                                </Text>
                                                                <Group gap="xs" align="center">
                                                                    <IconClock size={14} />
                                                                    <Text size="xs" c="dimmed">
                                                                        {parcel.timeSlot ||
                                                                            "No time specified"}
                                                                    </Text>
                                                                </Group>
                                                            </div>
                                                            <Badge
                                                                color={
                                                                    parcel.status === "completed"
                                                                        ? "green"
                                                                        : "blue"
                                                                }
                                                                variant="light"
                                                                size="sm"
                                                            >
                                                                {parcel.status === "completed"
                                                                    ? "Completed"
                                                                    : "Scheduled"}
                                                            </Badge>
                                                        </Group>
                                                    </Paper>
                                                );
                                            })}
                                        </Stack>
                                    </Card.Section>
                                </Card>
                            </Grid.Col>
                        ))}
                    </Grid>
                )}
            </Stack>

            {/* Parcel Admin Dialog */}
            {selectedParcelId && (
                <ParcelAdminDialog
                    parcelId={selectedParcelId}
                    opened={dialogOpened}
                    onClose={handleDialogClose}
                />
            )}
        </Container>
    );
}
