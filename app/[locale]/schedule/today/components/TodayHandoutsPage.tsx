"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter, usePathname } from "@/app/i18n/navigation";
import { useTranslations } from "next-intl";
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
import { sv } from "date-fns/locale";
import { getTodaysParcels, getPickupLocations, getParcelById } from "../../actions";
import { ParcelAdminDialog } from "@/components/ParcelAdminDialog";
import type { FoodParcel, PickupLocation } from "../../types";
import type { TranslationFunction } from "../../../types";

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
    const t = useTranslations("schedule") as TranslationFunction;

    // State
    const [parcels, setParcels] = useState<TodayParcel[]>([]);
    const [locations, setLocations] = useState<PickupLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLocation, setSelectedLocation] = useState<string>("");

    // Modal state
    const [dialogOpened, { open: openDialog, close: closeDialog }] = useDisclosure(false);
    const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);

    const today = new Date();

    // Handle deep link to specific parcel (like QR code scans)
    useEffect(() => {
        const parcelId = searchParams.get("parcel");
        if (parcelId) {
            if (selectedParcelId !== parcelId || !dialogOpened) {
                // Find the parcel and auto-select its location only if parcels are loaded
                if (parcels.length > 0) {
                    const parcel = parcels.find(p => p.id === parcelId);
                    if (parcel && parcel.pickup_location_id) {
                        setSelectedLocation(parcel.pickup_location_id);
                    }
                }
                setSelectedParcelId(parcelId);
                openDialog();
            }
        } else if (dialogOpened || selectedParcelId) {
            closeDialog();
            setSelectedParcelId(null);
        }
    }, [searchParams, parcels, selectedParcelId, dialogOpened, openDialog, closeDialog]);

    // Handle location selection when parcels finish loading and we have a parcel parameter
    useEffect(() => {
        const parcelId = searchParams.get("parcel");
        if (parcelId && parcels.length > 0 && !selectedLocation) {
            const parcel = parcels.find(p => p.id === parcelId);
            if (parcel && parcel.pickup_location_id) {
                setSelectedLocation(parcel.pickup_location_id);
            }
        }
    }, [parcels, searchParams, selectedLocation, locations]);

    // Load data
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [parcelsData, locationsData] = await Promise.all([
                getTodaysParcels(),
                getPickupLocations(),
            ]);

            // Check if we need to fetch a specific parcel to get its location (but don't add it to the list)
            const parcelId = searchParams.get("parcel");
            let locationIdFromParcel: string | null = null;

            if (parcelId && !parcelsData.find(p => p.id === parcelId)) {
                const specificParcel = await getParcelById(parcelId);
                if (specificParcel?.pickup_location_id) {
                    locationIdFromParcel = specificParcel.pickup_location_id;
                }
            }

            // Only use today's parcels for display
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

            setParcels(enhancedParcels);
            setLocations(locationsData);

            // Auto-select location if we found one from the specific parcel
            if (locationIdFromParcel && !selectedLocation) {
                setSelectedLocation(locationIdFromParcel);
            }
        } catch {
            // Error boundary will handle display
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedLocation]); // searchParams intentionally excluded - only used for deep link, not a refetch trigger

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
            // Update URL with parcel parameter to trigger the modal
            const params = new URLSearchParams(searchParams.toString());
            params.set("parcel", parcel.id);
            const newUrl = `${pathname}?${params.toString()}`;
            router.replace(newUrl);
            // The useEffect watching searchParams will handle opening the modal
        },
        [searchParams, pathname, router],
    );

    // Close modal callback
    const handleDialogClose = useCallback(() => {
        // Remove parcel param from URL
        const params = new URLSearchParams(searchParams.toString());
        params.delete("parcel");
        const newUrl = `${pathname}?${params.toString()}`;
        router.replace(newUrl);
        // State will be synced by the effect on searchParams
        // Note: No need to reload data just because we closed a dialog
    }, [searchParams, pathname, router]);

    // Handle parcel updates from ParcelAdminDialog
    const handleParcelUpdated = useCallback(async () => {
        // For today's handouts, we show pickup status, so refetch on all actions
        await loadData();
    }, [loadData]);

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
                            {t("todayHandouts.title")}
                        </Title>
                        <Text c="dimmed" size="sm">
                            {format(today, "EEEE, MMMM d, yyyy", { locale: sv })}
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
                                {completedParcels}/{totalParcels} {t("todayHandouts.completed")}
                            </Badge>
                        )}
                    </Group>
                </Group>

                {/* Location Selection */}
                <Paper p="md" withBorder>
                    <Group>
                        <IconMapPin size={20} />
                        <Select
                            placeholder={t("todayHandouts.selectLocation")}
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
                                {t("todayHandouts.clearSelection")}
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
                                        ? t("todayHandouts.noParcels")
                                        : t("todayHandouts.noLocation")}
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
                                                    {group.parcels.length}{" "}
                                                    {t("todayHandouts.parcels")}
                                                </Text>
                                            </div>
                                            <IconMapPin size={20} color="blue" />
                                        </Group>
                                    </Card.Section>

                                    <Card.Section p="md">
                                        <Stack gap="xs">
                                            {group.parcels.map(parcel => {
                                                return (
                                                    <Paper
                                                        key={parcel.id}
                                                        p="sm"
                                                        withBorder
                                                        style={{
                                                            cursor: "pointer",
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
                                                                            t(
                                                                                "todayHandouts.noTimeSpecified",
                                                                            )}
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
                                                                    ? t(
                                                                          "todayHandouts.parcel.completed",
                                                                      )
                                                                    : t(
                                                                          "todayHandouts.parcel.scheduled",
                                                                      )}
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
                    onParcelUpdated={handleParcelUpdated}
                />
            )}
        </Container>
    );
}
