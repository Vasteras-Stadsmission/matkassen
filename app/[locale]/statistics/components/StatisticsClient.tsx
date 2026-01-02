"use client";

import { useState, useEffect } from "react";
import {
    Container,
    Title,
    Text,
    Stack,
    SegmentedControl,
    LoadingOverlay,
    Alert,
    Paper,
    Group,
    SimpleGrid,
    Card,
    ThemeIcon,
    Divider,
} from "@mantine/core";
import {
    IconAlertCircle,
    IconHome,
    IconPackage,
    IconMessage,
    IconUserPlus,
    IconUserMinus,
    IconCheck,
    IconPercentage,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { BarChart, PieChart, LineChart } from "@mantine/charts";
import { getAllStatistics, type PeriodOption, type AllStatistics } from "../actions";

function StatCard({
    title,
    value,
    icon,
    color = "blue",
}: {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    color?: string;
}) {
    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group>
                <ThemeIcon size="lg" radius="md" variant="light" color={color}>
                    {icon}
                </ThemeIcon>
                <div>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                        {title}
                    </Text>
                    <Text size="xl" fw={700}>
                        {value}
                    </Text>
                </div>
            </Group>
        </Card>
    );
}

function PercentageCard({
    title,
    value,
    icon,
}: {
    title: string;
    value: number | null;
    icon: React.ReactNode;
}) {
    const displayValue = value !== null ? `${value.toFixed(1)}%` : "—";
    const color =
        value !== null ? (value >= 80 ? "green" : value >= 50 ? "yellow" : "red") : "gray";

    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group>
                <ThemeIcon size="lg" radius="md" variant="light" color={color}>
                    {icon}
                </ThemeIcon>
                <div>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                        {title}
                    </Text>
                    <Text size="xl" fw={700} c={color}>
                        {displayValue}
                    </Text>
                </div>
            </Group>
        </Card>
    );
}

// Type-safe locale name lookup
function getLocaleName(
    locale: string,
    t: ReturnType<typeof useTranslations<"statistics">>,
): string {
    switch (locale) {
        case "sv":
            return t("households.locales.sv");
        case "en":
            return t("households.locales.en");
        default:
            return locale;
    }
}

// Type-safe SMS intent name lookup
function getIntentName(
    intent: string,
    t: ReturnType<typeof useTranslations<"statistics">>,
): string {
    switch (intent) {
        case "pickup_reminder":
            return t("sms.intents.pickup_reminder");
        case "pickup_updated":
            return t("sms.intents.pickup_updated");
        case "pickup_cancelled":
            return t("sms.intents.pickup_cancelled");
        case "consent_enrolment":
            return t("sms.intents.consent_enrolment");
        case "food_parcels_ended":
            return t("sms.intents.food_parcels_ended");
        default:
            return intent;
    }
}

// Type-safe weekday name lookup (dayNum: 0=Sunday, 1=Monday, etc.)
function getWeekdayName(
    dayNum: number,
    t: ReturnType<typeof useTranslations<"statistics">>,
): string {
    switch (dayNum) {
        case 0:
            return t("parcels.weekdays.Sunday");
        case 1:
            return t("parcels.weekdays.Monday");
        case 2:
            return t("parcels.weekdays.Tuesday");
        case 3:
            return t("parcels.weekdays.Wednesday");
        case 4:
            return t("parcels.weekdays.Thursday");
        case 5:
            return t("parcels.weekdays.Friday");
        case 6:
            return t("parcels.weekdays.Saturday");
        default:
            return String(dayNum);
    }
}

export function StatisticsClient() {
    const t = useTranslations("statistics");
    const [period, setPeriod] = useState<PeriodOption>("30d");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState<AllStatistics | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadStats() {
            setLoading(true);
            setError(null);

            try {
                const result = await getAllStatistics(period);
                if (cancelled) return;

                if (result.success) {
                    setStats(result.data);
                } else {
                    setError(t("error")); // Translate error on client
                }
            } catch {
                if (!cancelled) {
                    setError(t("error"));
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }
        loadStats();

        return () => {
            cancelled = true;
        };
    }, [period, t]);

    const periodOptions = [
        { value: "7d", label: t("periods.7d") },
        { value: "30d", label: t("periods.30d") },
        { value: "90d", label: t("periods.90d") },
        { value: "year", label: t("periods.year") },
        { value: "all", label: t("periods.all") },
    ];

    return (
        <Container size="xl" py="xl">
            <Stack gap="xl">
                <div>
                    <Title order={1}>{t("title")}</Title>
                    <Text c="dimmed" mt="xs">
                        {t("description")}
                    </Text>
                </div>

                <SegmentedControl
                    value={period}
                    onChange={value => setPeriod(value as PeriodOption)}
                    data={periodOptions}
                    aria-label={t("title")}
                />

                {error && (
                    <Alert icon={<IconAlertCircle />} color="red" variant="light">
                        {error}
                    </Alert>
                )}

                <Paper pos="relative" p="md" withBorder>
                    <LoadingOverlay visible={loading} />

                    {stats && (
                        <Stack gap="xl">
                            {/* Overview Section */}
                            <div>
                                <Title order={2} mb="md">
                                    {t("overview.title")}
                                </Title>
                                <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
                                    <StatCard
                                        title={t("overview.totalHouseholds")}
                                        value={stats.overview.totalHouseholds}
                                        icon={<IconHome size={20} />}
                                        color="blue"
                                    />
                                    <StatCard
                                        title={t("overview.newHouseholds")}
                                        value={stats.overview.newHouseholds}
                                        icon={<IconUserPlus size={20} />}
                                        color="green"
                                    />
                                    <StatCard
                                        title={t("overview.removedHouseholds")}
                                        value={stats.overview.removedHouseholds}
                                        icon={<IconUserMinus size={20} />}
                                        color="orange"
                                    />
                                    <StatCard
                                        title={t("overview.totalParcels")}
                                        value={stats.overview.totalParcels}
                                        icon={<IconPackage size={20} />}
                                        color="violet"
                                    />
                                    <StatCard
                                        title={t("overview.pickedUpParcels")}
                                        value={stats.overview.pickedUpParcels}
                                        icon={<IconCheck size={20} />}
                                        color="teal"
                                    />
                                    <PercentageCard
                                        title={t("overview.pickupRate")}
                                        value={stats.overview.pickupRate}
                                        icon={<IconPercentage size={20} />}
                                    />
                                    <PercentageCard
                                        title={t("overview.smsDeliveryRate")}
                                        value={stats.overview.smsDeliveryRate}
                                        icon={<IconMessage size={20} />}
                                    />
                                </SimpleGrid>
                            </div>

                            <Divider />

                            {/* Households Section */}
                            <div>
                                <Title order={2} mb="md">
                                    {t("households.title")}
                                </Title>
                                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                                    {stats.households.byLocale.length > 0 && (
                                        <Card shadow="sm" padding="lg" withBorder>
                                            <Title order={4} mb="md">
                                                {t("households.byLanguage")}
                                            </Title>
                                            <PieChart
                                                data={stats.households.byLocale.map(l => ({
                                                    name: getLocaleName(l.locale, t),
                                                    value: l.count,
                                                    color: l.locale === "sv" ? "blue.6" : "green.6",
                                                }))}
                                                withLabelsLine
                                                labelsPosition="outside"
                                                labelsType="value"
                                                withTooltip
                                                size={200}
                                            />
                                        </Card>
                                    )}

                                    {stats.households.ageDistribution.length > 0 && (
                                        <Card shadow="sm" padding="lg" withBorder>
                                            <Title order={4} mb="md">
                                                {t("households.ageDistribution")}
                                            </Title>
                                            <BarChart
                                                h={200}
                                                data={stats.households.ageDistribution}
                                                dataKey="bucket"
                                                series={[{ name: "count", color: "violet.6" }]}
                                            />
                                        </Card>
                                    )}

                                    {stats.households.memberCountDistribution.length > 0 && (
                                        <Card shadow="sm" padding="lg" withBorder>
                                            <Title order={4} mb="md">
                                                {t("households.memberCountDistribution")}
                                            </Title>
                                            <BarChart
                                                h={200}
                                                data={stats.households.memberCountDistribution.map(
                                                    d => ({
                                                        memberCount: String(d.memberCount),
                                                        households: d.households,
                                                    }),
                                                )}
                                                dataKey="memberCount"
                                                series={[{ name: "households", color: "cyan.6" }]}
                                            />
                                        </Card>
                                    )}

                                    {stats.households.byPostalCode.length > 0 && (
                                        <Card shadow="sm" padding="lg" withBorder>
                                            <Title order={4} mb="md">
                                                {t("households.byPostalCode")}
                                            </Title>
                                            <BarChart
                                                h={200}
                                                data={stats.households.byPostalCode}
                                                dataKey="postalCode"
                                                series={[{ name: "count", color: "orange.6" }]}
                                            />
                                        </Card>
                                    )}

                                    {stats.households.dietaryRestrictions.length > 0 && (
                                        <Card shadow="sm" padding="lg" withBorder>
                                            <Title order={4} mb="md">
                                                {t("households.dietaryRestrictions")}
                                            </Title>
                                            <BarChart
                                                h={200}
                                                data={stats.households.dietaryRestrictions}
                                                dataKey="name"
                                                series={[{ name: "count", color: "red.6" }]}
                                            />
                                        </Card>
                                    )}

                                    {stats.households.additionalNeeds.length > 0 && (
                                        <Card shadow="sm" padding="lg" withBorder>
                                            <Title order={4} mb="md">
                                                {t("households.additionalNeeds")}
                                            </Title>
                                            <BarChart
                                                h={200}
                                                data={stats.households.additionalNeeds}
                                                dataKey="name"
                                                series={[{ name: "count", color: "violet.6" }]}
                                            />
                                        </Card>
                                    )}

                                    {stats.households.pets.length > 0 && (
                                        <Card shadow="sm" padding="lg" withBorder>
                                            <Title order={4} mb="md">
                                                {t("households.pets")}
                                            </Title>
                                            <BarChart
                                                h={200}
                                                data={stats.households.pets}
                                                dataKey="species"
                                                series={[{ name: "count", color: "lime.6" }]}
                                            />
                                        </Card>
                                    )}
                                </SimpleGrid>
                            </div>

                            <Divider />

                            {/* Parcels Section */}
                            <div>
                                <Title order={2} mb="md">
                                    {t("parcels.title")}
                                </Title>
                                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mb="md">
                                    <StatCard
                                        title={t("parcels.total")}
                                        value={stats.parcels.total}
                                        icon={<IconPackage size={20} />}
                                    />
                                    <StatCard
                                        title={t("parcels.pickedUp")}
                                        value={stats.parcels.pickedUp}
                                        icon={<IconCheck size={20} />}
                                        color="green"
                                    />
                                    <StatCard
                                        title={t("parcels.notPickedUp")}
                                        value={stats.parcels.notPickedUp}
                                        icon={<IconAlertCircle size={20} />}
                                        color="red"
                                    />
                                    <StatCard
                                        title={t("parcels.cancelled")}
                                        value={stats.parcels.cancelled}
                                        icon={<IconUserMinus size={20} />}
                                        color="gray"
                                    />
                                    {stats.parcels.avgPerHousehold !== null && (
                                        <StatCard
                                            title={t("parcels.avgPerHousehold")}
                                            value={stats.parcels.avgPerHousehold.toFixed(1)}
                                            icon={<IconPackage size={20} />}
                                            color="grape"
                                        />
                                    )}
                                </SimpleGrid>

                                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                                    {stats.parcels.byLocation.length > 0 && (
                                        <Card shadow="sm" padding="lg" withBorder>
                                            <Title order={4} mb="md">
                                                {t("parcels.byLocation")}
                                            </Title>
                                            <BarChart
                                                h={200}
                                                data={stats.parcels.byLocation}
                                                dataKey="locationName"
                                                series={[{ name: "count", color: "blue.6" }]}
                                            />
                                        </Card>
                                    )}

                                    {stats.parcels.byWeekday.length > 0 && (
                                        <Card shadow="sm" padding="lg" withBorder>
                                            <Title order={4} mb="md">
                                                {t("parcels.byWeekday")}
                                            </Title>
                                            <BarChart
                                                h={200}
                                                data={stats.parcels.byWeekday.map(d => ({
                                                    weekday: getWeekdayName(d.dayNum, t),
                                                    count: d.count,
                                                }))}
                                                dataKey="weekday"
                                                series={[{ name: "count", color: "grape.6" }]}
                                            />
                                        </Card>
                                    )}

                                    {stats.parcels.dailyTrend.length > 0 && (
                                        <Card
                                            shadow="sm"
                                            padding="lg"
                                            withBorder
                                            style={{ gridColumn: "span 2" }}
                                        >
                                            <Title order={4} mb="md">
                                                {t("parcels.dailyTrend")}
                                            </Title>
                                            <LineChart
                                                h={200}
                                                data={stats.parcels.dailyTrend}
                                                dataKey="date"
                                                series={[{ name: "count", color: "indigo.6" }]}
                                                curveType="linear"
                                            />
                                        </Card>
                                    )}
                                </SimpleGrid>
                            </div>

                            <Divider />

                            {/* Locations Section */}
                            <div>
                                <Title order={2} mb="md">
                                    {t("locations.title")}
                                </Title>
                                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                                    {stats.locations.pickupRateByLocation.length > 0 && (
                                        <Card shadow="sm" padding="lg" withBorder>
                                            <Title order={4} mb="md">
                                                {t("locations.pickupRate")}
                                            </Title>
                                            <BarChart
                                                h={200}
                                                data={stats.locations.pickupRateByLocation.map(
                                                    l => ({
                                                        location: l.locationName,
                                                        rate: Math.round(l.rate),
                                                    }),
                                                )}
                                                dataKey="location"
                                                series={[{ name: "rate", color: "teal.6" }]}
                                            />
                                        </Card>
                                    )}

                                    {stats.locations.nearCapacityAlerts.length > 0 && (
                                        <Card shadow="sm" padding="lg" withBorder>
                                            <Title order={4} mb="md">
                                                {t("locations.nearCapacityAlerts")}
                                            </Title>
                                            <Stack gap="xs">
                                                {stats.locations.nearCapacityAlerts
                                                    .slice(0, 5)
                                                    .map(alert => (
                                                        <Group
                                                            key={`${alert.locationId}-${alert.date}`}
                                                            justify="space-between"
                                                        >
                                                            <Text size="sm">
                                                                {alert.locationName} ({alert.date})
                                                            </Text>
                                                            <Text
                                                                size="sm"
                                                                fw={700}
                                                                c={
                                                                    alert.usagePercent >= 100
                                                                        ? "red"
                                                                        : "orange"
                                                                }
                                                            >
                                                                {Math.round(alert.usagePercent)}%
                                                            </Text>
                                                        </Group>
                                                    ))}
                                            </Stack>
                                        </Card>
                                    )}

                                    {stats.locations.capacityUsage.length > 0 && (
                                        <Card
                                            shadow="sm"
                                            padding="lg"
                                            withBorder
                                            style={{ gridColumn: "span 2" }}
                                        >
                                            <Title order={4} mb="md">
                                                {t("locations.capacityUsage")}
                                            </Title>
                                            <Stack gap="xs">
                                                {stats.locations.capacityUsage.map(c => (
                                                    <Group
                                                        key={`${c.locationId}-${c.date}`}
                                                        justify="space-between"
                                                    >
                                                        <Text size="sm" style={{ flex: 2 }}>
                                                            {c.locationName}
                                                        </Text>
                                                        <Text
                                                            size="sm"
                                                            c="dimmed"
                                                            style={{ flex: 1 }}
                                                        >
                                                            {c.date}
                                                        </Text>
                                                        <Text size="sm" style={{ flex: 1 }}>
                                                            {c.scheduled}/{c.max ?? "∞"}
                                                        </Text>
                                                        <Text
                                                            size="sm"
                                                            fw={700}
                                                            c={
                                                                c.usagePercent === null
                                                                    ? "dimmed"
                                                                    : c.usagePercent >= 100
                                                                      ? "red"
                                                                      : c.usagePercent >= 80
                                                                        ? "orange"
                                                                        : "green"
                                                            }
                                                            style={{ flex: 1, textAlign: "right" }}
                                                        >
                                                            {c.usagePercent !== null
                                                                ? `${Math.round(c.usagePercent)}%`
                                                                : "—"}
                                                        </Text>
                                                    </Group>
                                                ))}
                                            </Stack>
                                        </Card>
                                    )}
                                </SimpleGrid>
                            </div>

                            <Divider />

                            {/* SMS Section */}
                            <div>
                                <Title order={2} mb="md">
                                    {t("sms.title")}
                                </Title>
                                <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md" mb="md">
                                    <StatCard
                                        title={t("sms.totalSent")}
                                        value={stats.sms.totalSent}
                                        icon={<IconMessage size={20} />}
                                    />
                                    <StatCard
                                        title={t("sms.delivered")}
                                        value={stats.sms.delivered}
                                        icon={<IconCheck size={20} />}
                                        color="green"
                                    />
                                    <PercentageCard
                                        title={t("sms.deliveryRate")}
                                        value={stats.sms.deliveryRate}
                                        icon={<IconPercentage size={20} />}
                                    />
                                    <StatCard
                                        title={t("sms.pending")}
                                        value={stats.sms.pending}
                                        icon={<IconAlertCircle size={20} />}
                                        color="yellow"
                                    />
                                    <StatCard
                                        title={t("sms.failedInternal")}
                                        value={stats.sms.failedInternal}
                                        icon={<IconAlertCircle size={20} />}
                                        color="red"
                                    />
                                    <StatCard
                                        title={t("sms.failedProvider")}
                                        value={stats.sms.failedProvider}
                                        icon={<IconAlertCircle size={20} />}
                                        color="orange"
                                    />
                                </SimpleGrid>

                                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                                    {stats.sms.byIntent.length > 0 && (
                                        <Card shadow="sm" padding="lg" withBorder>
                                            <Title order={4} mb="md">
                                                {t("sms.byIntent")}
                                            </Title>
                                            <BarChart
                                                h={200}
                                                data={stats.sms.byIntent.map(i => ({
                                                    intent: getIntentName(i.intent, t),
                                                    count: i.count,
                                                }))}
                                                dataKey="intent"
                                                series={[{ name: "count", color: "pink.6" }]}
                                            />
                                        </Card>
                                    )}

                                    {stats.sms.dailyVolume.length > 0 && (
                                        <Card shadow="sm" padding="lg" withBorder>
                                            <Title order={4} mb="md">
                                                {t("sms.dailyVolume")}
                                            </Title>
                                            <LineChart
                                                h={200}
                                                data={stats.sms.dailyVolume}
                                                dataKey="date"
                                                series={[{ name: "count", color: "lime.6" }]}
                                                curveType="linear"
                                            />
                                        </Card>
                                    )}
                                </SimpleGrid>
                            </div>
                        </Stack>
                    )}
                </Paper>
            </Stack>
        </Container>
    );
}
