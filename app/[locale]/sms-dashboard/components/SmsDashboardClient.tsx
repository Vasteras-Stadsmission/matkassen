"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/app/i18n/navigation";
import { useTranslations } from "next-intl";
import {
    Stack,
    Title,
    Group,
    Select,
    TextInput,
    Button,
    Alert,
    Loader,
    Center,
    Text,
    Badge,
    Divider,
    ActionIcon,
    Switch,
} from "@mantine/core";
import { IconSearch, IconFilter, IconRefresh, IconAlertCircle } from "@tabler/icons-react";
import type { SmsDashboardRecord } from "@/app/api/admin/sms/dashboard/route";
import { SmsListItem } from "./SmsListItem";
import type { TranslationFunction } from "@/app/[locale]/types";

export default function SmsDashboardClient() {
    const t = useTranslations() as TranslationFunction;
    const searchParams = useSearchParams();
    const router = useRouter();

    // State
    const [smsRecords, setSmsRecords] = useState<SmsDashboardRecord[]>([]);
    const [locations, setLocations] = useState<Array<{ value: string; label: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // AbortController to cancel in-flight requests and prevent race conditions
    const abortControllerRef = useRef<AbortController | null>(null);

    // Filters from URL
    const locationFilter = searchParams.get("location");
    const statusFilter = searchParams.get("status");
    const searchQuery = searchParams.get("search") || "";
    const showCancelled = searchParams.get("cancelled") === "true";

    // Fetch SMS data
    const fetchData = useCallback(
        async (isRefresh = false) => {
            // Cancel any in-flight request to prevent race conditions
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();

            if (isRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }
            setError(null);

            try {
                // Build query string
                const params = new URLSearchParams();
                if (locationFilter) params.set("location", locationFilter);
                if (statusFilter) params.set("status", statusFilter);
                if (searchQuery) params.set("search", searchQuery);
                if (showCancelled) params.set("cancelled", "true");

                const response = await fetch(`/api/admin/sms/dashboard?${params.toString()}`, {
                    signal: abortControllerRef.current.signal,
                });
                if (!response.ok) {
                    throw new Error("Failed to fetch SMS data");
                }

                const data = await response.json();
                setSmsRecords(data);

                // Extract unique locations
                const uniqueLocations = Array.from(
                    new Set(data.map((record: SmsDashboardRecord) => record.locationId)),
                )
                    .map(id => {
                        const record = data.find((r: SmsDashboardRecord) => r.locationId === id);
                        return {
                            value: id as string,
                            label: (record?.locationName || id) as string,
                        };
                    })
                    .sort((a, b) => a.label.localeCompare(b.label));

                setLocations(uniqueLocations);
            } catch (err) {
                // Ignore aborted requests - they're intentional cancellations
                if (err instanceof Error && err.name === "AbortError") {
                    return;
                }
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [locationFilter, statusFilter, searchQuery, showCancelled],
    );

    // Initial fetch
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Cleanup: abort any pending requests on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    // Update URL with filters
    const updateFilter = (key: string, value: string | null) => {
        const params = new URLSearchParams(searchParams.toString());
        if (value) {
            params.set(key, value);
        } else {
            params.delete(key);
        }
        router.push(`?${params.toString()}`);
    };

    // Clear all filters
    const clearFilters = () => {
        router.push(window.location.pathname);
    };

    // Group SMS by date
    const groupedSms = smsRecords.reduce(
        (groups, sms) => {
            const pickupDate = new Date(sms.pickupDateTimeEarliest);
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            let dateKey: string;
            if (pickupDate.toDateString() === today.toDateString()) {
                dateKey = t("admin.smsDashboard.dateGroups.today");
            } else if (pickupDate.toDateString() === tomorrow.toDateString()) {
                dateKey = t("admin.smsDashboard.dateGroups.tomorrow");
            } else {
                dateKey = pickupDate.toLocaleDateString("sv-SE", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                });
            }

            if (!groups[dateKey]) {
                groups[dateKey] = [];
            }
            groups[dateKey].push(sms);
            return groups;
        },
        {} as Record<string, SmsDashboardRecord[]>,
    );

    // Count stats
    const pendingCount = smsRecords.filter(sms =>
        ["queued", "sending", "retrying"].includes(sms.status),
    ).length;
    const failureCount = smsRecords.filter(sms => sms.status === "failed").length;

    if (loading) {
        return (
            <Center style={{ minHeight: "60vh" }}>
                <Stack align="center" gap="md">
                    <Loader size="lg" />
                    <Text c="dimmed">{t("admin.smsDashboard.loading")}</Text>
                </Stack>
            </Center>
        );
    }

    return (
        <Stack gap="lg">
            {/* Header */}
            <Group justify="space-between" align="flex-start">
                <Stack gap="xs">
                    <Title order={1}>{t("admin.smsDashboard.title")}</Title>
                    <Group gap="md">
                        <Text size="sm" c="dimmed">
                            {t("admin.smsDashboard.pendingCount", { count: pendingCount })}
                        </Text>
                        {failureCount > 0 && (
                            <Badge color="red" variant="filled">
                                {t("admin.smsDashboard.failureCount", { count: failureCount })}
                            </Badge>
                        )}
                    </Group>
                </Stack>
                <ActionIcon
                    variant="light"
                    size="lg"
                    onClick={() => fetchData(true)}
                    loading={refreshing}
                    title={t("admin.smsDashboard.filters.refresh")}
                >
                    <IconRefresh size={18} />
                </ActionIcon>
            </Group>

            {/* Filters */}
            <Group gap="md" wrap="wrap">
                <Select
                    placeholder={t("admin.smsDashboard.filters.location")}
                    data={[
                        { value: "", label: t("admin.smsDashboard.filters.allLocations") },
                        ...locations,
                    ]}
                    value={locationFilter || ""}
                    onChange={value => updateFilter("location", value || null)}
                    leftSection={<IconFilter size={16} />}
                    clearable
                    style={{ minWidth: 200 }}
                />
                <Select
                    placeholder={t("admin.smsDashboard.filters.status")}
                    data={[
                        { value: "", label: t("admin.smsDashboard.filters.allStatuses") },
                        { value: "queued", label: t("admin.smsDashboard.status.queued") },
                        { value: "sending", label: t("admin.smsDashboard.status.sending") },
                        { value: "sent", label: t("admin.smsDashboard.status.sent") },
                        { value: "retrying", label: t("admin.smsDashboard.status.retrying") },
                        { value: "failed", label: t("admin.smsDashboard.status.failed") },
                        { value: "cancelled", label: t("admin.smsDashboard.status.cancelled") },
                    ]}
                    value={statusFilter || ""}
                    onChange={value => updateFilter("status", value || null)}
                    leftSection={<IconFilter size={16} />}
                    clearable
                    style={{ minWidth: 150 }}
                />
                <TextInput
                    placeholder={t("admin.smsDashboard.filters.searchPlaceholder")}
                    value={searchQuery}
                    onChange={e => updateFilter("search", e.target.value || null)}
                    leftSection={<IconSearch size={16} />}
                    style={{ flexGrow: 1, minWidth: 200 }}
                />
                <Switch
                    label={t("admin.smsDashboard.filters.showCancelled")}
                    checked={showCancelled}
                    onChange={e =>
                        updateFilter("cancelled", e.currentTarget.checked ? "true" : null)
                    }
                />
                {(locationFilter || statusFilter || searchQuery) && (
                    <Button variant="subtle" onClick={clearFilters}>
                        {t("admin.smsDashboard.filters.clearFilters")}
                    </Button>
                )}
            </Group>

            {/* Error State */}
            {error && (
                <Alert
                    icon={<IconAlertCircle size={16} />}
                    color="red"
                    title={t("admin.smsDashboard.errorMessages.loadError")}
                >
                    {error}
                    <br />
                    <Button variant="subtle" size="sm" mt="sm" onClick={() => fetchData()}>
                        {t("admin.smsDashboard.errorMessages.tryAgainLater")}
                    </Button>
                </Alert>
            )}

            {/* Empty State */}
            {!error && smsRecords.length === 0 && (
                <Center style={{ minHeight: "40vh" }}>
                    <Stack align="center" gap="md">
                        <Text size="xl" c="dimmed">
                            {failureCount === 0
                                ? t("admin.smsDashboard.emptyStates.noPending")
                                : t("admin.smsDashboard.emptyStates.noResults")}
                        </Text>
                    </Stack>
                </Center>
            )}

            {/* Grouped SMS List */}
            {!error &&
                Object.entries(groupedSms).map(([dateKey, records]) => (
                    <Stack key={dateKey} gap="sm">
                        <Divider
                            label={
                                <Text size="sm" fw={700} tt="uppercase" c="dimmed">
                                    {dateKey}
                                </Text>
                            }
                            labelPosition="left"
                        />
                        {records.map(sms => (
                            <SmsListItem key={sms.id} sms={sms} onUpdate={() => fetchData(true)} />
                        ))}
                    </Stack>
                ))}
        </Stack>
    );
}
