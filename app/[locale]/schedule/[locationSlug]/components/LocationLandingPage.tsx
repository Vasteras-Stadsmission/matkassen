"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/app/i18n/navigation";
import { useTranslations } from "next-intl";
import {
    Container,
    Title,
    Group,
    Stack,
    Text,
    Paper,
    Loader,
    Center,
    Alert,
    Button,
    Card,
} from "@mantine/core";
import {
    IconMapPin,
    IconExclamationCircle,
    IconCalendarDue,
    IconCalendar,
} from "@tabler/icons-react";
import { getPickupLocations } from "../../actions";
import { findLocationBySlug } from "../../utils/location-slugs";
import type { PickupLocation } from "../../types";
import type { TranslationFunction } from "../../../types";

interface LocationLandingPageProps {
    locationSlug: string;
}

export function LocationLandingPage({ locationSlug }: LocationLandingPageProps) {
    const router = useRouter();
    const t = useTranslations("schedule") as TranslationFunction;

    const [currentLocation, setCurrentLocation] = useState<PickupLocation | null>(null);
    const [loading, setLoading] = useState(true);
    const [locationError, setLocationError] = useState<string | null>(null);

    useEffect(() => {
        async function loadLocation() {
            setLoading(true);
            setLocationError(null);

            try {
                const locationsData = await getPickupLocations();

                const location = findLocationBySlug(locationsData, locationSlug);

                if (!location) {
                    setLocationError(`${t("location.landing.locationNotFound")}: ${locationSlug}`);
                    return;
                }

                setCurrentLocation(location);
            } catch {
                // Error boundary will handle display
                setLocationError(t("location.landing.locationError"));
            } finally {
                setLoading(false);
            }
        }

        loadLocation();
    }, [locationSlug, t]);

    const handleTodayClick = () => {
        if (currentLocation) {
            router.push(`/schedule/${locationSlug}/today`);
        }
    };

    const handleWeeklyClick = () => {
        if (currentLocation) {
            router.push(`/schedule/${locationSlug}/weekly`);
        }
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

    if (locationError || !currentLocation) {
        return (
            <Container size="xl" py="md">
                <Alert
                    icon={<IconExclamationCircle size={16} />}
                    title={t("location.landing.locationError")}
                    color="red"
                >
                    {locationError || t("location.landing.locationNotFound")}
                </Alert>
            </Container>
        );
    }

    return (
        <Container size="xl" py="md">
            <Stack gap="md">
                {/* Header */}
                <div>
                    <Title order={1} size="h2">
                        {t("location.landing.title")}
                    </Title>
                    <Group gap="xs" mt="xs">
                        <IconMapPin size={16} />
                        <Text size="sm" c="dimmed">
                            {currentLocation.name}
                        </Text>
                    </Group>
                </div>

                {/* View Options */}
                <Paper p="md" withBorder>
                    <Stack gap="md">
                        <Text size="lg" fw={500}>
                            {t("location.landing.selectView")}
                        </Text>

                        <Group gap="md" grow>
                            <Card
                                withBorder
                                shadow="sm"
                                padding="lg"
                                style={{ cursor: "pointer" }}
                                onClick={handleTodayClick}
                            >
                                <Group justify="center" gap="sm">
                                    <IconCalendarDue size={24} color="blue" />
                                    <div>
                                        <Text fw={500} size="md">
                                            {t("location.landing.todayHandouts")}
                                        </Text>
                                        <Text size="sm" c="dimmed">
                                            {t("location.landing.todayDescription")}
                                        </Text>
                                    </div>
                                </Group>
                            </Card>

                            <Card
                                withBorder
                                shadow="sm"
                                padding="lg"
                                style={{ cursor: "pointer" }}
                                onClick={handleWeeklyClick}
                            >
                                <Group justify="center" gap="sm">
                                    <IconCalendar size={24} color="green" />
                                    <div>
                                        <Text fw={500} size="md">
                                            {t("location.landing.weeklySchedule")}
                                        </Text>
                                        <Text size="sm" c="dimmed">
                                            {t("location.landing.weeklyDescription")}
                                        </Text>
                                    </div>
                                </Group>
                            </Card>
                        </Group>

                        {/* Direct action buttons */}
                        <Group gap="md" mt="md">
                            <Button
                                variant="filled"
                                leftSection={<IconCalendarDue size="1rem" />}
                                onClick={handleTodayClick}
                                size="md"
                            >
                                {t("location.landing.goToToday")}
                            </Button>

                            <Button
                                variant="outline"
                                leftSection={<IconCalendar size="1rem" />}
                                onClick={handleWeeklyClick}
                                size="md"
                            >
                                {t("location.landing.weeklyView")}
                            </Button>
                        </Group>
                    </Stack>
                </Paper>
            </Stack>
        </Container>
    );
}
