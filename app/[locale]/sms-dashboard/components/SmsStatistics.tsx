"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
    Paper,
    Stack,
    Group,
    Text,
    Progress,
    Collapse,
    Button,
    Badge,
    Grid,
    Loader,
    Alert,
} from "@mantine/core";
import {
    IconChevronDown,
    IconChevronUp,
    IconAlertCircle,
    IconTrendingUp,
    IconTrendingDown,
} from "@tabler/icons-react";
import type { SmsStatisticsRecord } from "@/app/api/admin/sms/statistics/route";
import type { TranslationFunction } from "@/app/[locale]/types";
import { calculateSuccessRate } from "@/app/utils/sms/statistics";

interface SmsStatisticsProps {
    locationFilter: string | null;
    showCancelled: boolean;
}

export function SmsStatistics({ locationFilter, showCancelled }: SmsStatisticsProps) {
    const t = useTranslations() as TranslationFunction;
    const [opened, setOpened] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statistics, setStatistics] = useState<SmsStatisticsRecord[]>([]);

    // Load expanded state from localStorage
    useEffect(() => {
        const saved = localStorage.getItem("sms-stats-expanded");
        if (saved === "true") {
            setOpened(true);
        }
    }, []);

    // Fetch statistics when expanded or location filter changes
    const fetchStatistics = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            if (locationFilter) {
                params.set("location", locationFilter);
            }

            const response = await fetch(`/api/admin/sms/statistics?${params.toString()}`);
            if (!response.ok) {
                throw new Error("Failed to fetch statistics");
            }

            const data = await response.json();
            setStatistics(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [locationFilter]);

    useEffect(() => {
        if (opened) {
            fetchStatistics();
        }
    }, [opened, fetchStatistics]);

    const handleToggle = () => {
        const newState = !opened;
        setOpened(newState);
        localStorage.setItem("sms-stats-expanded", String(newState));
    };

    // Calculate aggregate stats across all locations
    const aggregateStats = statistics.reduce(
        (acc, stat) => ({
            today: {
                sent: acc.today.sent + stat.today.sent,
                failed: acc.today.failed + stat.today.failed,
                pending: acc.today.pending + stat.today.pending,
            },
            last7Days: {
                sent: acc.last7Days.sent + stat.last7Days.sent,
                failed: acc.last7Days.failed + stat.last7Days.failed,
                total: acc.last7Days.total + stat.last7Days.total,
            },
            currentMonth: {
                sent: acc.currentMonth.sent + stat.currentMonth.sent,
                failed: acc.currentMonth.failed + stat.currentMonth.failed,
                total: acc.currentMonth.total + stat.currentMonth.total,
            },
            lastMonth: {
                sent: acc.lastMonth.sent + stat.lastMonth.sent,
                failed: acc.lastMonth.failed + stat.lastMonth.failed,
                total: acc.lastMonth.total + stat.lastMonth.total,
            },
        }),
        {
            today: { sent: 0, failed: 0, pending: 0 },
            last7Days: { sent: 0, failed: 0, total: 0 },
            currentMonth: { sent: 0, failed: 0, total: 0 },
            lastMonth: { sent: 0, failed: 0, total: 0 },
        },
    );

    // Calculate success rate for last 7 days using shared utility
    const successRate = calculateSuccessRate(
        aggregateStats.last7Days.sent,
        aggregateStats.last7Days.failed,
    );

    // Calculate month-over-month change
    const monthlyChange =
        aggregateStats.lastMonth.sent > 0
            ? Math.round(
                  ((aggregateStats.currentMonth.sent - aggregateStats.lastMonth.sent) /
                      aggregateStats.lastMonth.sent) *
                      100,
              )
            : 0;

    // Get health status
    const getHealthStatus = () => {
        if (aggregateStats.today.failed > 5) return "critical";
        if (aggregateStats.today.failed > 0 || aggregateStats.today.pending > 10) return "warning";
        return "healthy";
    };

    const healthStatus = getHealthStatus();

    // Don't show stats for cancelled parcels view
    if (showCancelled) {
        return null;
    }

    return (
        <Paper withBorder p="md">
            <Stack gap="md">
                {/* Toggle Header with Quick Status */}
                <Group justify="space-between" align="center" wrap="nowrap">
                    <Group gap="md" align="center">
                        <Text size="sm" fw={600}>
                            {t("admin.smsDashboard.statistics.title")}
                        </Text>
                        {healthStatus === "healthy" && (
                            <Badge color="green" size="sm" variant="light">
                                {t("admin.smsDashboard.statistics.status.healthy")}
                            </Badge>
                        )}
                        {healthStatus === "warning" && (
                            <Badge color="yellow" size="sm" variant="light">
                                {t("admin.smsDashboard.statistics.status.attention")}
                            </Badge>
                        )}
                        {healthStatus === "critical" && (
                            <Badge color="red" size="sm" variant="filled">
                                {t("admin.smsDashboard.statistics.status.critical")}
                            </Badge>
                        )}
                        {!opened && (
                            <Text size="xs" c="dimmed">
                                {t("admin.smsDashboard.statistics.today.label")}:{" "}
                                {aggregateStats.today.sent}{" "}
                                {t("admin.smsDashboard.statistics.sent")} ·{" "}
                                {aggregateStats.today.failed}{" "}
                                {t("admin.smsDashboard.statistics.failed")} · {successRate}%{" "}
                                {t("admin.smsDashboard.statistics.successRate")}
                            </Text>
                        )}
                    </Group>
                    <Button
                        variant="subtle"
                        size="xs"
                        rightSection={
                            opened ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
                        }
                        onClick={handleToggle}
                    >
                        {opened
                            ? t("admin.smsDashboard.statistics.hide")
                            : t("admin.smsDashboard.statistics.viewMonthly")}
                    </Button>
                </Group>

                {/* Collapsible Stats Content */}
                <Collapse in={opened}>
                    {loading && (
                        <Group justify="center" p="xl">
                            <Loader size="sm" />
                        </Group>
                    )}

                    {error && (
                        <Alert icon={<IconAlertCircle size={16} />} color="red">
                            {error}
                        </Alert>
                    )}

                    {!loading && !error && statistics.length > 0 && (
                        <Stack gap="lg">
                            {/* Aggregate Stats Grid */}
                            <Grid>
                                {/* Today */}
                                <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                                    <Paper withBorder p="sm">
                                        <Stack gap="xs">
                                            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                                                {t("admin.smsDashboard.statistics.today.label")}
                                            </Text>
                                            <Text size="xl" fw={700}>
                                                {aggregateStats.today.sent}
                                            </Text>
                                            <Group gap="xs">
                                                <Text size="xs" c="dimmed">
                                                    {aggregateStats.today.failed}{" "}
                                                    {t("admin.smsDashboard.statistics.failed")}
                                                </Text>
                                                {aggregateStats.today.pending > 0 && (
                                                    <>
                                                        <Text size="xs" c="dimmed">
                                                            ·
                                                        </Text>
                                                        <Text size="xs" c="dimmed">
                                                            {aggregateStats.today.pending}{" "}
                                                            {t(
                                                                "admin.smsDashboard.statistics.pending",
                                                            )}
                                                        </Text>
                                                    </>
                                                )}
                                            </Group>
                                        </Stack>
                                    </Paper>
                                </Grid.Col>

                                {/* Last 7 Days */}
                                <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                                    <Paper withBorder p="sm">
                                        <Stack gap="xs">
                                            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                                                {t("admin.smsDashboard.statistics.last7Days")}
                                            </Text>
                                            <Group gap="xs" align="baseline">
                                                <Text size="xl" fw={700}>
                                                    {successRate}%
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    {t("admin.smsDashboard.statistics.successRate")}
                                                </Text>
                                            </Group>
                                            <Text size="xs" c="dimmed">
                                                {aggregateStats.last7Days.sent}{" "}
                                                {t("admin.smsDashboard.statistics.sent")} /{" "}
                                                {aggregateStats.last7Days.total}{" "}
                                                {t("admin.smsDashboard.statistics.total")}
                                            </Text>
                                        </Stack>
                                    </Paper>
                                </Grid.Col>

                                {/* Current Month */}
                                <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                                    <Paper withBorder p="sm">
                                        <Stack gap="xs">
                                            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                                                {t("admin.smsDashboard.statistics.currentMonth")}
                                            </Text>
                                            <Text size="xl" fw={700}>
                                                {aggregateStats.currentMonth.sent}
                                            </Text>
                                            {aggregateStats.lastMonth.sent > 0 && (
                                                <Group gap="xs">
                                                    {monthlyChange > 0 ? (
                                                        <IconTrendingUp size={14} color="green" />
                                                    ) : monthlyChange < 0 ? (
                                                        <IconTrendingDown size={14} color="red" />
                                                    ) : null}
                                                    <Text
                                                        size="xs"
                                                        c={
                                                            monthlyChange > 0
                                                                ? "green"
                                                                : monthlyChange < 0
                                                                  ? "red"
                                                                  : "dimmed"
                                                        }
                                                    >
                                                        {monthlyChange > 0 ? "+" : ""}
                                                        {monthlyChange}%{" "}
                                                        {t(
                                                            "admin.smsDashboard.statistics.vsLastMonth",
                                                        )}
                                                    </Text>
                                                </Group>
                                            )}
                                        </Stack>
                                    </Paper>
                                </Grid.Col>

                                {/* Progress to Average */}
                                <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
                                    <Paper withBorder p="sm">
                                        <Stack gap="xs">
                                            <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                                                {t("admin.smsDashboard.statistics.monthlyProgress")}
                                            </Text>
                                            <Text size="xl" fw={700}>
                                                {aggregateStats.lastMonth.sent > 0
                                                    ? Math.round(
                                                          (aggregateStats.currentMonth.sent /
                                                              aggregateStats.lastMonth.sent) *
                                                              100,
                                                      )
                                                    : 100}
                                                %
                                            </Text>
                                            {aggregateStats.lastMonth.sent > 0 && (
                                                <>
                                                    <Progress
                                                        value={
                                                            (aggregateStats.currentMonth.sent /
                                                                aggregateStats.lastMonth.sent) *
                                                            100
                                                        }
                                                        size="sm"
                                                        color={
                                                            aggregateStats.currentMonth.sent >=
                                                            aggregateStats.lastMonth.sent
                                                                ? "green"
                                                                : "blue"
                                                        }
                                                    />
                                                    <Text size="xs" c="dimmed">
                                                        {t(
                                                            "admin.smsDashboard.statistics.ofLastMonth",
                                                            {
                                                                count: aggregateStats.lastMonth
                                                                    .sent,
                                                            },
                                                        )}
                                                    </Text>
                                                </>
                                            )}
                                        </Stack>
                                    </Paper>
                                </Grid.Col>
                            </Grid>

                            {/* Per-Location Breakdown (only if multiple locations and not filtered) */}
                            {!locationFilter && statistics.length > 1 && (
                                <Stack gap="sm">
                                    <Text size="sm" fw={600}>
                                        {t("admin.smsDashboard.statistics.byLocation")}
                                    </Text>
                                    {statistics.map(stat => (
                                        <Paper key={stat.locationId} withBorder p="sm">
                                            <Group justify="space-between" wrap="wrap">
                                                <Text size="sm" fw={500}>
                                                    {stat.locationName}
                                                </Text>
                                                <Group gap="lg">
                                                    <Text size="xs" c="dimmed">
                                                        {t(
                                                            "admin.smsDashboard.statistics.today.label",
                                                        )}
                                                        :{" "}
                                                        <Text span fw={600}>
                                                            {stat.today.sent}
                                                        </Text>
                                                    </Text>
                                                    <Text size="xs" c="dimmed">
                                                        {t(
                                                            "admin.smsDashboard.statistics.currentMonth",
                                                        )}
                                                        :{" "}
                                                        <Text span fw={600}>
                                                            {stat.currentMonth.sent}
                                                        </Text>
                                                    </Text>
                                                    <Text size="xs" c="dimmed">
                                                        {t(
                                                            "admin.smsDashboard.statistics.successRate",
                                                        )}
                                                        :{" "}
                                                        <Text span fw={600}>
                                                            {stat.last7Days.successRate}%
                                                        </Text>
                                                    </Text>
                                                </Group>
                                            </Group>
                                        </Paper>
                                    ))}
                                </Stack>
                            )}
                        </Stack>
                    )}
                </Collapse>
            </Stack>
        </Paper>
    );
}
