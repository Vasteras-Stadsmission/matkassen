"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
    Container,
    Stack,
    Title,
    Group,
    Button,
    Alert,
    Loader,
    Center,
    Text,
    Paper,
    Badge,
    Chip,
    ThemeIcon,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
    IconAlertCircle,
    IconRefresh,
    IconCheck,
    IconPackage,
    IconClock,
    IconMessage,
    IconUsers,
    IconCalendar,
    IconX,
} from "@tabler/icons-react";
import { Link } from "@/app/i18n/navigation";
import RescheduleInline from "./RescheduleInline";

// Issue types from the API
interface UnresolvedHandout {
    parcelId: string;
    householdId: string;
    householdFirstName: string;
    householdLastName: string;
    pickupDateEarliest: string;
    pickupDateLatest: string;
    locationName: string;
}

interface OutsideHoursParcel {
    parcelId: string;
    householdId: string;
    householdFirstName: string;
    householdLastName: string;
    pickupDateEarliest: string;
    pickupDateLatest: string;
    locationId: string;
    locationName: string;
    locationOpensAt: string | null;
}

interface FailedSms {
    id: string;
    intent: string;
    householdId: string;
    householdFirstName: string;
    householdLastName: string;
    parcelId: string | null;
    errorMessage: string | null;
    failureType: "internal" | "provider" | "stale";
    createdAt: string;
}

interface IssuesData {
    unresolvedHandouts: UnresolvedHandout[];
    outsideHours: OutsideHoursParcel[];
    failedSms: FailedSms[];
    counts: {
        total: number;
        unresolvedHandouts: number;
        outsideHours: number;
        failedSms: number;
    };
}

type FilterType = "all" | "unresolvedHandouts" | "outsideHours" | "failedSms";

export default function IssuesPageClient() {
    const t = useTranslations("issues");
    const tNav = useTranslations("navigation");
    const locale = useLocale();

    const [issues, setIssues] = useState<IssuesData | null>(null);
    const [initialLoading, setInitialLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState<FilterType>("all");
    const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
    const [rescheduleParcelId, setRescheduleParcelId] = useState<string | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);

    const fetchData = useCallback(
        async (isRefresh = false) => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();

            if (isRefresh) {
                setRefreshing(true);
            } else {
                setInitialLoading(true);
            }
            setError(null);

            try {
                const response = await fetch("/api/admin/issues", {
                    signal: abortControllerRef.current.signal,
                });

                if (response.status === 401) {
                    const callbackUrl = encodeURIComponent(window.location.pathname);
                    window.location.href = `/api/auth/signin?callbackUrl=${callbackUrl}`;
                    return;
                }
                if (response.status === 403) {
                    setError(t("accessDenied"));
                    return;
                }

                if (!response.ok) {
                    throw new Error(t("error"));
                }

                const data = await response.json();
                setIssues(data);
            } catch (err) {
                if (err instanceof Error && err.name === "AbortError") {
                    return;
                }
                setError(t("error"));
            } finally {
                setInitialLoading(false);
                setRefreshing(false);
            }
        },
        [t],
    );

    useEffect(() => {
        fetchData();
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [fetchData]);

    const formatPickupTime = (earliest: string, latest: string) => {
        const earliestDate = new Date(earliest);
        const latestDate = new Date(latest);

        const dateOptions: Intl.DateTimeFormatOptions = {
            weekday: "short",
            month: "short",
            day: "numeric",
        };
        const timeOptions: Intl.DateTimeFormatOptions = {
            hour: "2-digit",
            minute: "2-digit",
        };

        const dateStr = earliestDate.toLocaleDateString(locale, dateOptions);
        const startTime = earliestDate.toLocaleTimeString(locale, timeOptions);
        const endTime = latestDate.toLocaleTimeString(locale, timeOptions);

        return `${dateStr}, ${startTime} - ${endTime}`;
    };

    // Action handler: Mark parcel as handed out (picked up)
    const handleHandedOut = async (parcelId: string) => {
        const key = `pickup-${parcelId}`;
        setActionLoading(prev => ({ ...prev, [key]: true }));

        try {
            const response = await fetch(`/api/admin/parcel/${parcelId}/pickup`, {
                method: "PATCH",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || t("toast.handedOutError"));
            }

            notifications.show({
                title: t("toast.success"),
                message: t("toast.handedOut"),
                color: "green",
                icon: <IconCheck size="1rem" />,
            });

            fetchData(true);
        } catch (err) {
            notifications.show({
                title: t("toast.actionError"),
                message: err instanceof Error ? err.message : t("error"),
                color: "red",
                icon: <IconX size="1rem" />,
            });
        } finally {
            setActionLoading(prev => ({ ...prev, [key]: false }));
        }
    };

    // Action handler: Mark parcel as no-show
    const handleNoShow = async (parcelId: string) => {
        const key = `noshow-${parcelId}`;
        setActionLoading(prev => ({ ...prev, [key]: true }));

        try {
            const response = await fetch(`/api/admin/parcel/${parcelId}/no-show`, {
                method: "PATCH",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || t("toast.noShowError"));
            }

            notifications.show({
                title: t("toast.success"),
                message: t("toast.noShow"),
                color: "green",
                icon: <IconCheck size="1rem" />,
            });

            fetchData(true);
        } catch (err) {
            notifications.show({
                title: t("toast.actionError"),
                message: err instanceof Error ? err.message : t("error"),
                color: "red",
                icon: <IconX size="1rem" />,
            });
        } finally {
            setActionLoading(prev => ({ ...prev, [key]: false }));
        }
    };

    // Action handler: Cancel parcel (soft delete)
    const handleCancelParcel = async (parcelId: string) => {
        const key = `cancel-${parcelId}`;
        setActionLoading(prev => ({ ...prev, [key]: true }));

        try {
            const response = await fetch(`/api/admin/parcel/${parcelId}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || t("toast.cancelError"));
            }

            notifications.show({
                title: t("toast.success"),
                message: t("toast.cancelParcel"),
                color: "green",
                icon: <IconCheck size="1rem" />,
            });

            fetchData(true);
        } catch (err) {
            notifications.show({
                title: t("toast.actionError"),
                message: err instanceof Error ? err.message : t("error"),
                color: "red",
                icon: <IconX size="1rem" />,
            });
        } finally {
            setActionLoading(prev => ({ ...prev, [key]: false }));
        }
    };

    // Action handler: Retry failed SMS (only for parcel-related SMS)
    const handleRetry = async (sms: FailedSms) => {
        if (!sms.parcelId) {
            return; // Button is hidden when no parcelId
        }

        const key = `retry-${sms.id}`;
        setActionLoading(prev => ({ ...prev, [key]: true }));

        try {
            const response = await fetch(`/api/admin/sms/parcel/${sms.parcelId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "resend" }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || t("toast.retryError"));
            }

            notifications.show({
                title: t("toast.success"),
                message: t("toast.retry"),
                color: "green",
                icon: <IconCheck size="1rem" />,
            });

            fetchData(true);
        } catch (err) {
            notifications.show({
                title: t("toast.actionError"),
                message: err instanceof Error ? err.message : t("error"),
                color: "red",
                icon: <IconX size="1rem" />,
            });
        } finally {
            setActionLoading(prev => ({ ...prev, [key]: false }));
        }
    };

    // Action handler: Dismiss failed SMS
    const handleDismiss = async (smsId: string) => {
        const key = `dismiss-${smsId}`;
        setActionLoading(prev => ({ ...prev, [key]: true }));

        try {
            const response = await fetch(`/api/admin/sms/${smsId}/dismiss`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dismissed: true }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || t("toast.dismissError"));
            }

            notifications.show({
                title: t("toast.success"),
                message: t("toast.dismiss"),
                color: "green",
                icon: <IconCheck size="1rem" />,
            });

            fetchData(true);
        } catch (err) {
            notifications.show({
                title: t("toast.actionError"),
                message: err instanceof Error ? err.message : t("error"),
                color: "red",
                icon: <IconX size="1rem" />,
            });
        } finally {
            setActionLoading(prev => ({ ...prev, [key]: false }));
        }
    };

    if (initialLoading) {
        return (
            <Center style={{ minHeight: "40vh" }}>
                <Loader size="lg" />
            </Center>
        );
    }

    const showUnresolvedHandouts = activeFilter === "all" || activeFilter === "unresolvedHandouts";
    const showOutsideHours = activeFilter === "all" || activeFilter === "outsideHours";
    const showFailedSms = activeFilter === "all" || activeFilter === "failedSms";

    const hasNoIssues = issues && issues.counts.total === 0;

    return (
        <Container size="lg" py="xl">
            <Stack gap="lg">
                <Group justify="space-between" align="center">
                    <Title order={2}>{t("title")}</Title>
                    <Button
                        variant="light"
                        leftSection={<IconRefresh size={16} />}
                        onClick={() => fetchData(true)}
                        loading={refreshing}
                    >
                        {t("refresh")}
                    </Button>
                </Group>

                {/* Filter chips */}
                {!hasNoIssues && (
                    <Chip.Group
                        value={activeFilter}
                        onChange={v => setActiveFilter(v as FilterType)}
                    >
                        <Group gap="xs">
                            <Chip value="all" variant="filled">
                                {t("filters.all")} ({issues?.counts.total ?? 0})
                            </Chip>
                            <Chip value="unresolvedHandouts" variant="filled">
                                {t("filters.unresolvedHandouts")} (
                                {issues?.counts.unresolvedHandouts ?? 0})
                            </Chip>
                            <Chip value="outsideHours" variant="filled">
                                {t("filters.outsideOpeningHours")} (
                                {issues?.counts.outsideHours ?? 0})
                            </Chip>
                            <Chip value="failedSms" variant="filled">
                                {t("filters.failedSms")} ({issues?.counts.failedSms ?? 0})
                            </Chip>
                        </Group>
                    </Chip.Group>
                )}

                {error && (
                    <Alert icon={<IconAlertCircle size={16} />} title={t("error")} color="red">
                        {error}
                    </Alert>
                )}

                {/* Empty state */}
                {hasNoIssues && (
                    <Paper p="xl" withBorder>
                        <Stack align="center" gap="md">
                            <ThemeIcon size="xl" color="green" variant="light" radius="xl">
                                <IconCheck size={24} />
                            </ThemeIcon>
                            <Text size="lg" c="dimmed">
                                {t("allClear")}
                            </Text>
                        </Stack>
                    </Paper>
                )}

                {/* Unresolved Handouts Section */}
                {showUnresolvedHandouts && issues && issues.unresolvedHandouts.length > 0 && (
                    <Stack gap="sm">
                        <Group gap="xs">
                            <ThemeIcon size="sm" variant="light" color="orange">
                                <IconPackage size={14} />
                            </ThemeIcon>
                            <Title order={4}>{t("sections.unresolvedHandouts")}</Title>
                        </Group>
                        {issues.unresolvedHandouts.map(parcel => (
                            <Paper key={parcel.parcelId} p="md" withBorder>
                                <Stack gap="sm">
                                    <Group justify="space-between" wrap="nowrap">
                                        <Text
                                            fw={600}
                                            component={Link}
                                            href={`/households/${parcel.householdId}`}
                                            style={{ textDecoration: "none" }}
                                            c="inherit"
                                        >
                                            {parcel.householdFirstName} {parcel.householdLastName}
                                        </Text>
                                    </Group>
                                    <Text size="sm" c="dimmed">
                                        {formatPickupTime(
                                            parcel.pickupDateEarliest,
                                            parcel.pickupDateLatest,
                                        )}{" "}
                                        · {parcel.locationName}
                                    </Text>
                                    <Group gap="sm" justify="flex-end">
                                        <Button
                                            variant="light"
                                            color="green"
                                            size="xs"
                                            loading={actionLoading[`pickup-${parcel.parcelId}`]}
                                            onClick={() => handleHandedOut(parcel.parcelId)}
                                        >
                                            {t("actions.handedOut")}
                                        </Button>
                                        <Button
                                            variant="light"
                                            color="orange"
                                            size="xs"
                                            loading={actionLoading[`noshow-${parcel.parcelId}`]}
                                            onClick={() => handleNoShow(parcel.parcelId)}
                                        >
                                            {t("actions.noShow")}
                                        </Button>
                                    </Group>
                                </Stack>
                            </Paper>
                        ))}
                    </Stack>
                )}

                {/* Outside Opening Hours Section */}
                {showOutsideHours && issues && issues.outsideHours.length > 0 && (
                    <Stack gap="sm">
                        <Group gap="xs">
                            <ThemeIcon size="sm" variant="light" color="yellow">
                                <IconClock size={14} />
                            </ThemeIcon>
                            <Title order={4}>{t("sections.outsideOpeningHours")}</Title>
                        </Group>
                        {issues.outsideHours.map(parcel => (
                            <Paper key={parcel.parcelId} p="md" withBorder>
                                <Stack gap="sm">
                                    <Group justify="space-between" wrap="nowrap">
                                        <Text
                                            fw={600}
                                            component={Link}
                                            href={`/households/${parcel.householdId}`}
                                            style={{ textDecoration: "none" }}
                                            c="inherit"
                                        >
                                            {parcel.householdFirstName} {parcel.householdLastName}
                                        </Text>
                                    </Group>
                                    <Text size="sm" c="dimmed">
                                        {formatPickupTime(
                                            parcel.pickupDateEarliest,
                                            parcel.pickupDateLatest,
                                        )}{" "}
                                        · {parcel.locationName}
                                    </Text>
                                    {parcel.locationOpensAt && (
                                        <Text size="sm" c="orange">
                                            {t("locationOpens", { time: parcel.locationOpensAt })}
                                        </Text>
                                    )}
                                    {rescheduleParcelId !== parcel.parcelId && (
                                        <Group gap="sm" justify="flex-end">
                                            <Button
                                                variant="light"
                                                color="red"
                                                size="xs"
                                                loading={actionLoading[`cancel-${parcel.parcelId}`]}
                                                onClick={() =>
                                                    handleCancelParcel(parcel.parcelId)
                                                }
                                            >
                                                {t("actions.cancelParcel")}
                                            </Button>
                                            <Button
                                                variant="light"
                                                color="blue"
                                                size="xs"
                                                onClick={() =>
                                                    setRescheduleParcelId(parcel.parcelId)
                                                }
                                            >
                                                {t("actions.reschedule")}
                                            </Button>
                                        </Group>
                                    )}
                                    <RescheduleInline
                                        parcelId={parcel.parcelId}
                                        locationId={parcel.locationId}
                                        isExpanded={rescheduleParcelId === parcel.parcelId}
                                        onCancel={() => setRescheduleParcelId(null)}
                                        onSuccess={() => {
                                            setRescheduleParcelId(null);
                                            notifications.show({
                                                title: t("toast.success"),
                                                message: t("toast.rescheduled"),
                                                color: "green",
                                                icon: <IconCheck size="1rem" />,
                                            });
                                            fetchData(true);
                                        }}
                                    />
                                </Stack>
                            </Paper>
                        ))}
                    </Stack>
                )}

                {/* Failed SMS Section */}
                {showFailedSms && issues && issues.failedSms.length > 0 && (
                    <Stack gap="sm">
                        <Group gap="xs">
                            <ThemeIcon size="sm" variant="light" color="red">
                                <IconMessage size={14} />
                            </ThemeIcon>
                            <Title order={4}>{t("sections.failedSms")}</Title>
                        </Group>
                        {issues.failedSms.map(sms => (
                            <Paper key={sms.id} p="md" withBorder>
                                <Stack gap="sm">
                                    <Group justify="space-between" wrap="nowrap">
                                        <Group gap="sm">
                                            <Text
                                                fw={600}
                                                component={Link}
                                                href={`/households/${sms.householdId}`}
                                                style={{ textDecoration: "none" }}
                                                c="inherit"
                                            >
                                                {sms.householdFirstName} {sms.householdLastName}
                                            </Text>
                                            <Badge
                                                color={
                                                    sms.failureType === "internal"
                                                        ? "red"
                                                        : sms.failureType === "provider"
                                                          ? "orange"
                                                          : "yellow"
                                                }
                                                size="sm"
                                            >
                                                {sms.failureType}
                                            </Badge>
                                        </Group>
                                    </Group>
                                    {sms.errorMessage && (
                                        <Text size="sm" c="red">
                                            {sms.errorMessage}
                                        </Text>
                                    )}
                                    <Group gap="sm" justify="flex-end">
                                        {/* Retry only available for pickup_reminder (API limitation) */}
                                        {sms.parcelId && sms.intent === "pickup_reminder" && (
                                            <Button
                                                variant="light"
                                                color="blue"
                                                size="xs"
                                                loading={actionLoading[`retry-${sms.id}`]}
                                                onClick={() => handleRetry(sms)}
                                            >
                                                {t("actions.retry")}
                                            </Button>
                                        )}
                                        <Button
                                            variant="light"
                                            color="gray"
                                            size="xs"
                                            loading={actionLoading[`dismiss-${sms.id}`]}
                                            onClick={() => handleDismiss(sms.id)}
                                        >
                                            {t("actions.dismiss")}
                                        </Button>
                                        <Button
                                            component={Link}
                                            href={`/households/${sms.householdId}/edit`}
                                            variant="light"
                                            size="xs"
                                        >
                                            {t("actions.editHousehold")} →
                                        </Button>
                                    </Group>
                                </Stack>
                            </Paper>
                        ))}
                    </Stack>
                )}

                {/* Quick Links */}
                <Paper p="md" withBorder mt="md">
                    <Text size="sm" fw={500} mb="sm">
                        {t("quickLinks")}
                    </Text>
                    <Group gap="sm">
                        <Button
                            component={Link}
                            href="/schedule"
                            variant="default"
                            size="xs"
                            leftSection={<IconCalendar size={14} />}
                        >
                            {tNav("schedule")}
                        </Button>
                        <Button
                            component={Link}
                            href="/households"
                            variant="default"
                            size="xs"
                            leftSection={<IconUsers size={14} />}
                        >
                            {tNav("households")}
                        </Button>
                    </Group>
                </Paper>
            </Stack>
        </Container>
    );
}
