"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/app/i18n/navigation";
import { useSearchParams } from "next/navigation";
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
    Button,
    Alert,
} from "@mantine/core";
import { IconMapPin, IconPackage, IconCalendarDue, IconCalendar } from "@tabler/icons-react";
import { getPickupLocations, getTodaysParcels, getParcelById } from "../actions";
import { createLocationSlug } from "../utils/location-slugs";
import { getUserFavoriteLocation } from "../utils/user-preferences";
import { FavoriteStar } from "./FavoriteStar";
import { NoUpcomingScheduleBadge } from "./NoUpcomingScheduleBadge";
import { WelcomeBanner } from "./WelcomeBanner";
import styles from "./ScheduleHubPage.module.css";
import type { PickupLocation, FoodParcel } from "../types";
import type { TranslationFunction } from "../../types";

interface LocationSummary {
    location: PickupLocation;
    todayParcelCount: number;
    todayCompletedCount: number;
    slug: string;
    isFavorite: boolean;
}

interface ScheduleHubPageProps {
    testMode: boolean;
    userRole?: string;
}

export function ScheduleHubPage({ testMode: isTestMode, userRole }: ScheduleHubPageProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const t = useTranslations("schedule") as TranslationFunction;
    const tSms = useTranslations("sms");

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
                } catch {
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
                const [locationsData, todaysParcels, favoriteResult] = await Promise.all([
                    getPickupLocations(),
                    getTodaysParcels(),
                    getUserFavoriteLocation(),
                ]);

                let currentFavoriteId: string | null = null;

                if (favoriteResult.success) {
                    currentFavoriteId = favoriteResult.data;
                }

                // Create summaries for each location
                const summaries: LocationSummary[] = locationsData.map(
                    (location: PickupLocation) => {
                        const locationParcels = todaysParcels.filter(
                            (parcel: FoodParcel) => parcel.pickup_location_id === location.id,
                        );

                        const completedParcels = locationParcels.filter(
                            (parcel: FoodParcel) => parcel.isPickedUp || parcel.noShowAt,
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
            } catch {
                // Error loading data - continue with empty state
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
                {/* First-login welcome banner (handout_staff only, dismissible) */}
                <WelcomeBanner userRole={userRole} />

                {/* Test Mode Warning Banner */}
                {isTestMode && (
                    <Alert variant="light" color="yellow">
                        {tSms("testModeWarning")}
                    </Alert>
                )}

                {/* Header */}
                <div>
                    <Title order={1} size="h2">
                        {t("hub.title")}
                    </Title>
                    <Text size="sm" c="dimmed" mt="xs">
                        {t("hub.subtitle")}
                    </Text>
                </div>

                {/* Location list */}
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
                    <Stack gap="sm" role="list" aria-label={t("hub.subtitle")}>
                        {[...locationSummaries]
                            .sort((a, b) => {
                                // Sort favorite locations to the top
                                if (a.isFavorite && !b.isFavorite) return -1;
                                if (!a.isFavorite && b.isFavorite) return 1;
                                return a.location.name.localeCompare(b.location.name);
                            })
                            .map(summary => (
                                <Paper
                                    key={summary.location.id}
                                    withBorder
                                    shadow={summary.isFavorite ? "sm" : undefined}
                                    className={styles.locationRow}
                                    data-favorite={summary.isFavorite || undefined}
                                    role="listitem"
                                >
                                    <div className={styles.locationSummary}>
                                        <Group gap="xs" align="center" wrap="nowrap">
                                            <IconMapPin size={22} className={styles.locationIcon} />
                                            <Text fw={600} size="lg" truncate>
                                                {summary.location.name}
                                            </Text>
                                            {summary.isFavorite && (
                                                <Text
                                                    size="xs"
                                                    c="blue.7"
                                                    fw={600}
                                                    className={styles.favoriteLabel}
                                                >
                                                    {t("hub.favorite")}
                                                </Text>
                                            )}
                                        </Group>

                                        <Group
                                            gap={6}
                                            align="center"
                                            wrap="nowrap"
                                            className={styles.todaySummary}
                                        >
                                            <IconPackage size={16} />
                                            <Text size="sm" c="dimmed" truncate>
                                                {summary.todayParcelCount === 0
                                                    ? t("hub.noHandoutsToday")
                                                    : t("hub.parcelsToday", {
                                                          count: summary.todayParcelCount,
                                                      })}
                                            </Text>
                                            {summary.todayParcelCount > 0 && (
                                                <Text
                                                    size="sm"
                                                    c="dimmed"
                                                    truncate
                                                    className={styles.completedText}
                                                >
                                                    {summary.todayCompletedCount}/
                                                    {summary.todayParcelCount} {t("hub.completed")}
                                                </Text>
                                            )}
                                        </Group>
                                    </div>

                                    <div className={styles.locationMeta}>
                                        {!summary.location.hasUpcomingSchedule && (
                                            <NoUpcomingScheduleBadge />
                                        )}
                                    </div>

                                    <div className={styles.favoriteAction}>
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
                                            size={22}
                                        />
                                    </div>

                                    <div className={styles.rowActions}>
                                        <Button
                                            variant="filled"
                                            leftSection={<IconCalendarDue size="1rem" />}
                                            onClick={() => handleLocationTodayClick(summary.slug)}
                                            size="sm"
                                            fullWidth
                                        >
                                            {t("hub.todayHandouts")}
                                        </Button>

                                        <Button
                                            variant="outline"
                                            leftSection={<IconCalendar size="1rem" />}
                                            onClick={() => handleLocationWeeklyClick(summary.slug)}
                                            size="sm"
                                            fullWidth
                                        >
                                            {t("hub.weeklySchedule")}
                                        </Button>
                                    </div>
                                </Paper>
                            ))}
                    </Stack>
                )}
            </Stack>
        </Container>
    );
}
