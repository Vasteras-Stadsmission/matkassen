"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/app/i18n/navigation";
import {
    Container,
    Title,
    Grid,
    Stack,
    Text,
    Paper,
    Loader,
    Center,
    Card,
    Button,
    Group,
} from "@mantine/core";
import { IconMapPin, IconPackage, IconCalendarDue } from "@tabler/icons-react";
import { getPickupLocations, getTodaysParcels } from "../../actions";
import { createLocationSlug, getLocationSlugById } from "../../utils/location-slugs";
import { getUserFavoriteLocation } from "../../utils/user-preferences";
import type { PickupLocation, FoodParcel } from "../../types";

interface LocationSummary {
    location: PickupLocation;
    todayParcelCount: number;
    todayCompletedCount: number;
    slug: string;
}

export function TodayRedirectPage() {
    const router = useRouter();

    const [locationSummaries, setLocationSummaries] = useState<LocationSummary[]>([]);
    const [loading, setLoading] = useState(true);

    // Handle auto-redirect to preferred location
    useEffect(() => {
        async function handleAutoRedirect() {
            try {
                const [favoriteResult, locations] = await Promise.all([
                    getUserFavoriteLocation(),
                    getPickupLocations(),
                ]);

                if (!favoriteResult.success) {
                    // Failed to get favorite - skip auto-redirect
                    return;
                }

                const favoriteLocationId = favoriteResult.data;

                if (favoriteLocationId && locations.length > 0) {
                    const slug = getLocationSlugById(locations, favoriteLocationId);
                    if (slug) {
                        // Auto-redirect to preferred location's today page
                        router.replace(`/schedule/${slug}/today`);
                        return;
                    }
                }
            } catch {
                // Error boundary will handle display
            }
        }

        handleAutoRedirect();
    }, [router]);

    useEffect(() => {
        async function loadData() {
            setLoading(true);

            try {
                // Load locations and today's parcels in parallel
                const [locationsData, todaysParcels] = await Promise.all([
                    getPickupLocations(),
                    getTodaysParcels(),
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
                        };
                    },
                );

                setLocationSummaries(summaries);
            } catch {
                // Error boundary will handle display
            } finally {
                setLoading(false);
            }
        }

        loadData();
    }, []);

    const handleLocationClick = (slug: string) => {
        router.push(`/schedule/${slug}/today`);
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
                        Today's Handouts
                    </Title>
                    <Text size="sm" c="dimmed" mt="xs">
                        Select a handout location to view today's schedule
                    </Text>
                </div>

                {/* Location Cards */}
                {locationSummaries.length === 0 ? (
                    <Paper p="xl" withBorder>
                        <Center>
                            <Stack align="center" gap="md">
                                <IconMapPin size={48} color="gray" />
                                <Text size="lg" c="dimmed">
                                    No handout locations found
                                </Text>
                            </Stack>
                        </Center>
                    </Paper>
                ) : (
                    <Grid>
                        {locationSummaries.map(summary => (
                            <Grid.Col key={summary.location.id} span={{ base: 12, sm: 6, lg: 4 }}>
                                <Card
                                    withBorder
                                    shadow="sm"
                                    h="100%"
                                    style={{ cursor: "pointer" }}
                                    onClick={() => handleLocationClick(summary.slug)}
                                >
                                    <Card.Section p="md" bg="blue.1">
                                        <Group justify="space-between" align="flex-start">
                                            <div style={{ flex: 1 }}>
                                                <Text fw={600} size="lg" mb="xs">
                                                    {summary.location.name}
                                                </Text>

                                                {/* Today's summary */}
                                                <Group gap="xs" align="center">
                                                    <IconPackage size={14} />
                                                    <Text size="sm" c="dimmed">
                                                        {summary.todayParcelCount === 0
                                                            ? "No handouts today"
                                                            : `${summary.todayParcelCount} parcels today`}
                                                    </Text>
                                                </Group>

                                                {summary.todayParcelCount > 0 && (
                                                    <Group gap="xs" align="center" mt="xs">
                                                        <Text size="sm" c="dimmed">
                                                            {summary.todayCompletedCount}/
                                                            {summary.todayParcelCount} completed
                                                        </Text>
                                                    </Group>
                                                )}
                                            </div>
                                            <IconMapPin size={20} color="blue" />
                                        </Group>
                                    </Card.Section>

                                    <Card.Section p="md">
                                        <Button
                                            variant="filled"
                                            leftSection={<IconCalendarDue size="1rem" />}
                                            fullWidth
                                            onClick={() => handleLocationClick(summary.slug)}
                                        >
                                            View Today's Handouts
                                        </Button>
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
