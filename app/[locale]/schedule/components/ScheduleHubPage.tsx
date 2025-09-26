"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/app/i18n/navigation";
import { useSearchParams } from "next/navigation";
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
    Group,
    Card,
    Button,
} from "@mantine/core";
import { IconMapPin, IconPackage, IconCalendarDue, IconCalendar } from "@tabler/icons-react";
import { getPickupLocations, getTodaysParcels, getParcelById } from "../actions";
import { createLocationSlug } from "../utils/location-slugs";
import { getUserFavoriteLocation } from "../utils/user-preferences";
import { FavoriteStar } from "./FavoriteStar";
import type { PickupLocation, FoodParcel } from "../types";
import type { TranslationFunction } from "../../types";

interface LocationSummary {
    location: PickupLocation;
    todayParcelCount: number;
    todayCompletedCount: number;
    slug: string;
    isFavorite: boolean;
}

export function ScheduleHubPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations("schedule") as TranslationFunction;

    const [locationSummaries, setLocationSummaries] = useState<LocationSummary[]>([]);
    const [loading, setLoading] = useState(true);

    // Handle QR code deep linking
    useEffect(() => {
        const parcelId = searchParams.get("parcel");
        if (parcelId) {
            // If there's a parcel parameter, we need to find its location and redirect
            async function handleParcelDeepLink() {
                try {
                    const parcel = await getParcelById(parcelId!);
                    if (parcel && parcel.pickup_location_id) {
                        const locations = await getPickupLocations();
                        const location = locations.find(
                            loc => loc.id === parcel.pickup_location_id,
                        );
                        if (location) {
                            const slug = createLocationSlug(location.name);
                            router.replace(`/schedule/${slug}/today?parcel=${parcelId}`);
                            return;
                        }
                    }
                    // If we can't find the parcel or location, remove the parcel param and continue
                    router.replace("/schedule");
                } catch (error) {
                    console.error("Error handling parcel deep link:", error);
                    // Remove the parcel param and continue with normal hub view
                    router.replace("/schedule");
                }
            }

            handleParcelDeepLink();
            return;
        }
    }, [searchParams, router]);

    useEffect(() => {
        async function loadData() {
            setLoading(true);

            try {
                // Load locations, today's parcels, and favorite location in parallel
                const [locationsData, todaysParcels, currentFavoriteId] = await Promise.all([
                    getPickupLocations(),
                    getTodaysParcels(),
                    getUserFavoriteLocation(),
                ]);

                // Create summaries for each location
                const summaries: LocationSummary[] = locationsData.map(
                    (location: PickupLocation) => {
                        const locationParcels = todaysParcels.filter(
                            (parcel: FoodParcel) => parcel.pickup_location_id === location.id,
                        );

                        const completedParcels = locationParcels.filter(
                            (parcel: FoodParcel) => parcel.isPickedUp,
                        );

                        return {
                            location,
                            todayParcelCount: locationParcels.length,
                            todayCompletedCount: completedParcels.length,
                            slug: createLocationSlug(location.name),
                            isFavorite: location.id === currentFavoriteId,
                        };
                    },
                );

                setLocationSummaries(summaries);
            } catch (error) {
                console.error("Error loading schedule hub data:", error);
            } finally {
                setLoading(false);
            }
        }

        // Only load data if we're not handling a parcel deep link
        const parcelId = searchParams.get("parcel");
        if (!parcelId) {
            loadData();
        }
    }, [searchParams]);

    const handleLocationTodayClick = (slug: string) => {
        router.push(`/schedule/${slug}/today`);
    };

    const handleLocationWeeklyClick = (slug: string) => {
        router.push(`/schedule/${slug}/weekly`);
    };

    const handleFavoriteChange = (locationId: string, isFavorite: boolean) => {
        setLocationSummaries(prev =>
            prev.map(summary => ({
                ...summary,
                isFavorite: summary.location.id === locationId && isFavorite,
            })),
        );
    };

    if (loading) {
        return (
            <Container size="xl" py="md">
                <Center>
                    <Loader size="lg" />
                </Center>
            </Container>
        );
    }

    return (
        <Container size="xl" py="md">
            <Stack gap="md">
                {/* Header */}
                <div>
                    <Title order={1} size="h2">
                        {t("hub.title")}
                    </Title>
                    <Text size="sm" c="dimmed" mt="xs">
                        {t("hub.subtitle")}
                    </Text>
                </div>

                {/* Location Cards */}
                {locationSummaries.length === 0 ? (
                    <Paper p="xl" withBorder>
                        <Center>
                            <Stack align="center" gap="md">
                                <IconMapPin size={48} color="gray" />
                                <Text size="lg" c="dimmed">
                                    {t("hub.noLocations")}
                                </Text>
                            </Stack>
                        </Center>
                    </Paper>
                ) : (
                    <Grid>
                        {locationSummaries
                            .sort((a, b) => {
                                // Sort favorite locations to the top
                                if (a.isFavorite && !b.isFavorite) return -1;
                                if (!a.isFavorite && b.isFavorite) return 1;
                                return a.location.name.localeCompare(b.location.name);
                            })
                            .map(summary => (
                                <Grid.Col
                                    key={summary.location.id}
                                    span={{ base: 12, sm: 6, lg: 4 }}
                                >
                                    <Card
                                        withBorder
                                        shadow={summary.isFavorite ? "md" : "sm"}
                                        h="100%"
                                        style={{
                                            borderColor: summary.isFavorite
                                                ? "var(--mantine-color-blue-4)"
                                                : undefined,
                                            borderWidth: summary.isFavorite ? "2px" : undefined,
                                        }}
                                    >
                                        <Card.Section
                                            p="md"
                                            bg={summary.isFavorite ? "blue.2" : "blue.1"}
                                        >
                                            <Group justify="space-between" align="flex-start">
                                                <div style={{ flex: 1 }}>
                                                    <Group gap="xs" align="center" mb="xs">
                                                        <IconMapPin size={20} />
                                                        <Text fw={600} size="lg">
                                                            {summary.location.name}
                                                        </Text>
                                                        {summary.isFavorite && (
                                                            <Text size="xs" c="blue.7" fw={500}>
                                                                {t("hub.favorite")}
                                                            </Text>
                                                        )}
                                                    </Group>

                                                    {/* Today's summary */}
                                                    <Group gap="xs" align="center">
                                                        <IconPackage size={14} />
                                                        <Text size="sm" c="dimmed">
                                                            {summary.todayParcelCount === 0
                                                                ? t("hub.noHandoutsToday")
                                                                : t("hub.parcelsToday", {
                                                                      count: summary.todayParcelCount,
                                                                  })}
                                                        </Text>
                                                    </Group>

                                                    {summary.todayParcelCount > 0 && (
                                                        <Group gap="xs" align="center" mt="xs">
                                                            <Text size="sm" c="dimmed">
                                                                {summary.todayCompletedCount}/
                                                                {summary.todayParcelCount}{" "}
                                                                {t("hub.completed")}
                                                            </Text>
                                                        </Group>
                                                    )}
                                                </div>
                                                <Group gap="xs" align="flex-start">
                                                    <FavoriteStar
                                                        locationId={summary.location.id}
                                                        locationName={summary.location.name}
                                                        isFavorite={summary.isFavorite}
                                                        onFavoriteChange={isFavorite =>
                                                            handleFavoriteChange(
                                                                summary.location.id,
                                                                isFavorite,
                                                            )
                                                        }
                                                    />
                                                </Group>
                                            </Group>
                                        </Card.Section>{" "}
                                        <Card.Section p="md">
                                            <Stack gap="xs">
                                                {/* Primary action - Today's view */}
                                                <Button
                                                    variant="filled"
                                                    leftSection={<IconCalendarDue size="1rem" />}
                                                    onClick={() =>
                                                        handleLocationTodayClick(summary.slug)
                                                    }
                                                    size="md"
                                                    fullWidth
                                                >
                                                    {t("hub.todayHandouts")}
                                                </Button>

                                                {/* Secondary action - Weekly view */}
                                                <Button
                                                    variant="outline"
                                                    leftSection={<IconCalendar size="1rem" />}
                                                    onClick={() =>
                                                        handleLocationWeeklyClick(summary.slug)
                                                    }
                                                    size="sm"
                                                    fullWidth
                                                >
                                                    {t("hub.weeklySchedule")}
                                                </Button>
                                            </Stack>
                                        </Card.Section>
                                    </Card>
                                </Grid.Col>
                            ))}
                    </Grid>
                )}
            </Stack>
        </Container>
    );
}
