"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter, usePathname } from "@/app/i18n/navigation";
import { useTranslations } from "next-intl";
import {
    Container,
    Title,
    Stack,
    Text,
    Paper,
    Loader,
    Center,
    Group,
    Badge,
    Button,
    Alert,
    Tabs,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
    IconClock,
    IconPackage,
    IconExclamationCircle,
    IconCalendarDue,
    IconCalendar,
    IconMapPin,
    IconArrowLeft,
} from "@tabler/icons-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { getTodaysParcels, getPickupLocations, getParcelById } from "../../../actions";
import { ParcelAdminDialog } from "@/components/ParcelAdminDialog";
import { findLocationBySlug } from "../../../utils/location-slugs";
import { FavoriteStar } from "../../../components/FavoriteStar";
import { getUserFavoriteLocation } from "../../../utils/user-preferences";
import type { FoodParcel, PickupLocation } from "../../../types";
import type { TranslationFunction } from "../../../../types";

// Enhanced type for today's view with additional computed fields
interface TodayParcel extends FoodParcel {
    locationName?: string;
    timeSlot?: string;
    status?: "scheduled" | "completed";
}

interface TodayHandoutsPageProps {
    locationSlug: string;
}

export function TodayHandoutsPage({ locationSlug }: TodayHandoutsPageProps) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const t = useTranslations("schedule") as TranslationFunction;

    // State
    const [parcels, setParcels] = useState<TodayParcel[]>([]);
    const [currentLocation, setCurrentLocation] = useState<PickupLocation | null>(null);
    const [loading, setLoading] = useState(true);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [isFavorite, setIsFavorite] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Pull to refresh state
    const [pullDistance, setPullDistance] = useState(0);
    const [isPulling, setIsPulling] = useState(false);
    const [startY, setStartY] = useState(0);
    const [canPull, setCanPull] = useState(false);

    // Modal state
    const [dialogOpened, { open: openDialog, close: closeDialog }] = useDisclosure(false);
    const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);

    const today = new Date();

    // Handle deep link to specific parcel (like QR code scans)
    useEffect(() => {
        const parcelId = searchParams.get("parcel");
        if (parcelId) {
            if (selectedParcelId !== parcelId || !dialogOpened) {
                setSelectedParcelId(parcelId);
                openDialog();
            }
        } else if (dialogOpened || selectedParcelId) {
            closeDialog();
            setSelectedParcelId(null);
        }
    }, [searchParams, selectedParcelId, dialogOpened, openDialog, closeDialog]);

    // Load data
    const loadData = useCallback(
        async (isRefresh = false) => {
            if (isRefresh) {
                setIsRefreshing(true);
            } else {
                setLoading(true);
            }
            setLocationError(null);

            try {
                // Load locations first to validate the slug
                const locationsData = await getPickupLocations();

                // Find the current location by slug
                const location = findLocationBySlug(locationsData, locationSlug);

                if (!location) {
                    setLocationError(`Location not found: ${locationSlug}`);
                    if (isRefresh) {
                        setIsRefreshing(false);
                    } else {
                        setLoading(false);
                    }
                    return;
                }

                setCurrentLocation(location);

                // Check if current location is favorite
                const favoriteId = await getUserFavoriteLocation();
                setIsFavorite(favoriteId === location.id);

                // Load today's parcels
                const parcelsData = await getTodaysParcels();

                // Check if we need to fetch a specific parcel to get its location (but don't add it to the list)
                const parcelId = searchParams.get("parcel");
                if (parcelId && !parcelsData.find(p => p.id === parcelId)) {
                    await getParcelById(parcelId);
                }

                // Filter parcels for the current location and enhance them
                const locationParcels = parcelsData.filter(
                    p => p.pickup_location_id === location.id,
                );
                const enhancedParcels = locationParcels.map((parcel): TodayParcel => {
                    return {
                        ...parcel,
                        locationName: location.name,
                        timeSlot:
                            format(parcel.pickupEarliestTime, "HH:mm") +
                            "-" +
                            format(parcel.pickupLatestTime, "HH:mm"),
                        status: parcel.isPickedUp ? "completed" : "scheduled",
                    };
                });

                setParcels(enhancedParcels);
            } catch (error) {
                console.error("Error loading today's parcels:", error);
                setLocationError("Failed to load data");
            } finally {
                if (isRefresh) {
                    setIsRefreshing(false);
                } else {
                    setLoading(false);
                }
            }
        },
        [locationSlug, searchParams],
    );

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Navigation handlers
    const handleBackToHub = useCallback(() => {
        router.push("/schedule");
    }, [router]);

    const handleFavoriteChange = useCallback((newIsFavorite: boolean) => {
        setIsFavorite(newIsFavorite);
    }, []);

    const handleRefresh = useCallback(async () => {
        if (!isRefreshing && !loading) {
            await loadData(true);
        }
    }, [isRefreshing, loading, loadData]);

    // Pull to refresh handlers
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        // Only enable pull to refresh if we're at the top of the page
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        setCanPull(scrollTop === 0);
        setStartY(e.touches[0].clientY);
    }, []);

    const handleTouchMove = useCallback(
        (e: React.TouchEvent) => {
            if (!canPull || isRefreshing || loading) return;

            const currentY = e.touches[0].clientY;
            const diff = currentY - startY;

            if (diff > 0) {
                // Pulling down
                setIsPulling(true);
                setPullDistance(Math.min(diff * 0.5, 80)); // Max 80px with resistance
            }
        },
        [canPull, isRefreshing, loading, startY],
    );

    const handleTouchEnd = useCallback(() => {
        if (isPulling && pullDistance > 50) {
            // Trigger refresh if pulled far enough
            handleRefresh();
        }
        setIsPulling(false);
        setPullDistance(0);
        setCanPull(false);
    }, [isPulling, pullDistance, handleRefresh]);

    // Handle parcel click
    const handleParcelClick = useCallback(
        (parcel: TodayParcel) => {
            // Update URL with parcel parameter to trigger the modal
            const params = new URLSearchParams(searchParams.toString());
            params.set("parcel", parcel.id);
            const newUrl = `${pathname}?${params.toString()}`;
            router.replace(newUrl);
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
    }, [searchParams, pathname, router]);

    if (loading) {
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

    // Calculate progress for current location
    const totalParcels = parcels.length;
    const completedParcels = parcels.filter(p => p.status === "completed").length;

    return (
        <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
                transform: `translateY(${pullDistance}px)`,
                transition: isPulling ? "none" : "transform 0.3s ease",
            }}
        >
            {/* Pull to refresh indicator */}
            {(isPulling || isRefreshing) && (
                <div
                    style={{
                        position: "fixed",
                        top: "10px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        zIndex: 101,
                        opacity: pullDistance > 30 ? 1 : pullDistance / 30,
                    }}
                >
                    <Loader size="sm" />
                </div>
            )}

            <Container size="xl" py={{ base: 2, md: "md" }} px={{ base: "xs", sm: "md" }}>
                <Stack gap={2}>
                    {/* Condensed Sticky Header */}
                    <Paper
                        withBorder
                        p={{ base: "xs", sm: "sm" }}
                        style={{
                            position: "sticky",
                            top: 0,
                            zIndex: 100,
                            backgroundColor: "var(--mantine-color-body)",
                            borderRadius: "var(--mantine-radius-md)",
                        }}
                    >
                        <Stack gap={8}>
                            {/* Top Row: Navigation + Location + Progress */}
                            <Group justify="space-between" align="center" wrap="nowrap">
                                {/* Left: Back Button */}
                                <Button
                                    variant="subtle"
                                    size="xs"
                                    leftSection={<IconArrowLeft size={14} />}
                                    onClick={handleBackToHub}
                                    style={{ flexShrink: 0 }}
                                >
                                    <Text size="sm" visibleFrom="sm">
                                        {t("location.header.locations")}
                                    </Text>
                                </Button>
                                {/* Center: Location Name with Star */}
                                <Group
                                    justify="space-between"
                                    align="center"
                                    wrap="nowrap"
                                    style={{ flex: 1, minWidth: 0, mx: 12 }}
                                >
                                    <Group
                                        gap={6}
                                        align="center"
                                        wrap="nowrap"
                                        style={{ minWidth: 0, flex: 1 }}
                                    >
                                        <IconMapPin size={14} style={{ flexShrink: 0 }} />
                                        <Text fw={500} size="sm" truncate style={{ flex: 1 }}>
                                            {currentLocation?.name}
                                        </Text>
                                    </Group>
                                    {currentLocation && (
                                        <div style={{ flexShrink: 0 }}>
                                            <FavoriteStar
                                                locationId={currentLocation.id}
                                                locationName={currentLocation.name}
                                                isFavorite={isFavorite}
                                                onFavoriteChange={handleFavoriteChange}
                                                size={12}
                                            />
                                        </div>
                                    )}
                                </Group>{" "}
                                {/* Right: Progress Badge */}
                                {totalParcels > 0 && (
                                    <Badge
                                        variant="light"
                                        color={completedParcels === totalParcels ? "green" : "blue"}
                                        size="sm"
                                        style={{ flexShrink: 0 }}
                                    >
                                        {completedParcels}/{totalParcels}
                                    </Badge>
                                )}
                            </Group>

                            {/* Middle Row: Title + Date (Mobile: Stack, Desktop: Group) */}
                            <div>
                                <Title order={1} size="h4" hiddenFrom="md">
                                    {t("todayHandouts.title")}
                                </Title>
                                <Title order={1} size="h2" visibleFrom="md">
                                    {t("todayHandouts.title")}
                                </Title>
                                <Text size="xs" c="dimmed" hiddenFrom="md">
                                    {format(today, "EEEE, MMMM d", { locale: sv })}
                                </Text>
                                <Text size="sm" c="dimmed" visibleFrom="md">
                                    {format(today, "EEEE, MMMM d, yyyy", { locale: sv })}
                                </Text>
                            </div>

                            {/* Bottom Row: Controls */}
                            <Group justify="space-between" align="center">
                                <Tabs value="today" variant="pills">
                                    <Tabs.List>
                                        <Tabs.Tab
                                            value="today"
                                            leftSection={<IconCalendarDue size={12} />}
                                        >
                                            <Text size="xs" hiddenFrom="sm">
                                                {t("todayTab")}
                                            </Text>
                                            <Text size="sm" visibleFrom="sm">
                                                {t("todayTab")}
                                            </Text>
                                        </Tabs.Tab>
                                        <Tabs.Tab
                                            value="weekly"
                                            leftSection={<IconCalendar size={12} />}
                                            onClick={() =>
                                                router.push(`/schedule/${locationSlug}/weekly`)
                                            }
                                        >
                                            <Text size="xs" hiddenFrom="sm">
                                                {t("weeklyTab")}
                                            </Text>
                                            <Text size="sm" visibleFrom="sm">
                                                {t("weeklyTab")}
                                            </Text>
                                        </Tabs.Tab>
                                    </Tabs.List>
                                </Tabs>

                                <Button
                                    variant="subtle"
                                    size="xs"
                                    onClick={handleRefresh}
                                    loading={isRefreshing}
                                    visibleFrom="sm" // Hide on mobile for pull-to-refresh
                                >
                                    {t("refresh")}
                                </Button>
                            </Group>
                        </Stack>
                    </Paper>

                    {/* Food Parcels List */}
                    {totalParcels === 0 ? (
                        <Paper p={{ base: "md", sm: "lg" }} withBorder>
                            <Center>
                                <Stack align="center" gap="sm">
                                    <IconPackage size={32} color="gray" />
                                    <Text size="md" c="dimmed" ta="center">
                                        {t("todayHandouts.noParcels")}
                                    </Text>
                                </Stack>
                            </Center>
                        </Paper>
                    ) : (
                        <Stack gap={4}>
                            {parcels.map(parcel => {
                                return (
                                    <Paper
                                        key={parcel.id}
                                        p={{ base: "sm", sm: "md" }}
                                        withBorder
                                        radius="md"
                                        style={{
                                            cursor: "pointer",
                                            transition: "all 0.2s ease",
                                            minHeight: "48px", // Slightly reduced for mobile
                                        }}
                                        onClick={() => handleParcelClick(parcel)}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.backgroundColor =
                                                parcel.status === "completed"
                                                    ? "var(--mantine-color-green-0)"
                                                    : "var(--mantine-color-blue-0)";
                                            e.currentTarget.style.transform = "translateY(-1px)";
                                            e.currentTarget.style.boxShadow =
                                                "var(--mantine-shadow-sm)";
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.backgroundColor = "transparent";
                                            e.currentTarget.style.transform = "translateY(0)";
                                            e.currentTarget.style.boxShadow = "none";
                                        }}
                                    >
                                        <Group justify="space-between" wrap="nowrap" align="center">
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <Text fw={600} size="md" truncate>
                                                    {parcel.householdName}
                                                </Text>
                                                <Group gap={4} align="center" mt={4}>
                                                    <IconClock size={14} />
                                                    <Text size="xs" c="dimmed">
                                                        {parcel.timeSlot ||
                                                            t("todayHandouts.noTimeSpecified")}
                                                    </Text>
                                                </Group>
                                            </div>
                                            <div style={{ flexShrink: 0 }}>
                                                <Badge
                                                    color={
                                                        parcel.status === "completed"
                                                            ? "green"
                                                            : "blue"
                                                    }
                                                    variant="filled"
                                                    size="md"
                                                    radius="md"
                                                >
                                                    {parcel.status === "completed"
                                                        ? t("todayHandouts.parcel.completed")
                                                        : t("todayHandouts.parcel.scheduled")}
                                                </Badge>
                                            </div>
                                        </Group>
                                    </Paper>
                                );
                            })}
                        </Stack>
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
        </div>
    );
}
