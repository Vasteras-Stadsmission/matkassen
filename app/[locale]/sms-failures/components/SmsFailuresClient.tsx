"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
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
    Tabs,
    Collapse,
    ActionIcon,
    Tooltip,
} from "@mantine/core";
import {
    IconAlertCircle,
    IconRefresh,
    IconSend,
    IconCheck,
    IconX,
    IconChevronDown,
    IconChevronUp,
    IconPhone,
    IconRestore,
} from "@tabler/icons-react";
import { Link } from "@/app/i18n/navigation";
import { notifications } from "@mantine/notifications";
import type { TranslationFunction } from "@/app/[locale]/types";
import { formatPhoneForDisplay } from "@/app/utils/validation/phone-validation";

interface SmsFailure {
    id: string;
    intent: string;
    householdId: string;
    householdFirstName: string;
    householdLastName: string;
    parcelId: string;
    phoneNumber: string;
    pickupDateEarliest: string;
    pickupDateLatest: string;
    status: "failed" | "sent";
    providerStatus: "failed" | "not delivered" | null;
    providerStatusUpdatedAt: string | null;
    errorMessage: string | null;
    sentAt: string | null;
    createdAt: string;
    dismissedAt: string | null;
    dismissedByUserId: string | null;
    failureType: "internal" | "provider" | "stale";
}

type TabValue = "active" | "dismissed";

export function SmsFailuresClient() {
    const t = useTranslations() as TranslationFunction;
    const locale = useLocale();

    const [failures, setFailures] = useState<SmsFailure[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabValue>("active");
    const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
    const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

    // Abort controller to cancel in-flight requests when a new one starts
    const abortControllerRef = useRef<AbortController | null>(null);

    const fetchData = useCallback(
        async (isRefresh = false, tab: TabValue = activeTab) => {
            // Cancel any in-flight request to prevent race conditions
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
                const response = await fetch(`/api/admin/sms/failures?status=${tab}`, {
                    signal: abortControllerRef.current.signal,
                });

                // Handle auth errors specifically
                if (response.status === 401) {
                    // Not authenticated - redirect to sign-in with callback URL
                    const callbackUrl = encodeURIComponent(window.location.pathname);
                    window.location.href = `/api/auth/signin?callbackUrl=${callbackUrl}`;
                    return;
                }
                if (response.status === 403) {
                    // Authenticated but not authorized - show access denied
                    setError(t("smsFailures.accessDenied"));
                    return;
                }

                if (!response.ok) {
                    throw new Error(t("smsFailures.error"));
                }

                const data = await response.json();
                if (data && Array.isArray(data.failures)) {
                    setFailures(data.failures);
                } else {
                    setFailures([]);
                }
            } catch (err) {
                // Ignore abort errors (expected when cancelling requests)
                if (err instanceof Error && err.name === "AbortError") {
                    return;
                }
                setError(t("smsFailures.error"));
            } finally {
                setInitialLoading(false);
                setRefreshing(false);
            }
        },
        [t, activeTab],
    );

    useEffect(() => {
        fetchData(false, activeTab);

        // Cleanup: cancel any in-flight request on unmount
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [fetchData, activeTab]);

    const handleTabChange = (value: string | null) => {
        if (value === "active" || value === "dismissed") {
            setActiveTab(value);
            setExpandedErrors(new Set());
        }
    };

    const toggleErrorExpanded = (id: string) => {
        setExpandedErrors(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleResend = async (failure: SmsFailure) => {
        setActionLoading(prev => ({ ...prev, [failure.id]: true }));

        try {
            const response = await fetch(`/api/admin/sms/parcel/${failure.parcelId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "resend" }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to resend");
            }

            notifications.show({
                title: t("smsFailures.resendSuccess"),
                message: t("smsFailures.resendSuccessMessage"),
                color: "green",
                icon: <IconCheck size="1rem" />,
            });

            // Refresh the list
            fetchData(true);
        } catch (err) {
            notifications.show({
                title: t("smsFailures.resendError"),
                message: err instanceof Error ? err.message : t("smsFailures.error"),
                color: "red",
                icon: <IconX size="1rem" />,
            });
        } finally {
            setActionLoading(prev => ({ ...prev, [failure.id]: false }));
        }
    };

    const handleDismiss = async (failure: SmsFailure, dismiss: boolean) => {
        setActionLoading(prev => ({ ...prev, [failure.id]: true }));

        try {
            const response = await fetch(`/api/admin/sms/${failure.id}/dismiss`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dismissed: dismiss }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to update");
            }

            notifications.show({
                title: dismiss ? t("smsFailures.dismissSuccess") : t("smsFailures.restoreSuccess"),
                message: dismiss
                    ? t("smsFailures.dismissSuccessMessage")
                    : t("smsFailures.restoreSuccessMessage"),
                color: "green",
                icon: <IconCheck size="1rem" />,
            });

            // Refresh the list
            fetchData(true);
        } catch (err) {
            notifications.show({
                title: t("smsFailures.error"),
                message: err instanceof Error ? err.message : t("smsFailures.error"),
                color: "red",
                icon: <IconX size="1rem" />,
            });
        } finally {
            setActionLoading(prev => ({ ...prev, [failure.id]: false }));
        }
    };

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

    const formatDateTime = (dateString: string) => {
        const date = new Date(dateString);
        const localeString = locale === "sv" ? "sv-SE" : "en-GB";
        return date.toLocaleString(localeString, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    const getFailureType = (failure: SmsFailure) => {
        // Use server-provided failureType for consistent classification
        switch (failure.failureType) {
            case "internal":
                return {
                    type: "internal",
                    color: "red" as const,
                    label: t("smsFailures.internalError"),
                };
            case "stale":
                return {
                    type: "stale",
                    color: "yellow" as const,
                    label: t("smsFailures.staleUnconfirmed"),
                };
            case "provider":
            default:
                // Distinguish between "failed" and "not delivered" for provider failures
                if (failure.providerStatus === "failed") {
                    return {
                        type: "provider",
                        color: "red" as const,
                        label: t("smsFailures.providerFailed"),
                    };
                }
                return {
                    type: "provider",
                    color: "orange" as const,
                    label: t("smsFailures.notDelivered"),
                };
        }
    };

    const getIntentLabel = (intent: string) => {
        const knownIntents: Record<string, string> = {
            pickup_reminder: t("admin.smsDashboard.intent.pickup_reminder"),
            pickup_updated: t("admin.smsDashboard.intent.pickup_updated"),
            pickup_cancelled: t("admin.smsDashboard.intent.pickup_cancelled"),
        };
        return knownIntents[intent] || intent;
    };

    if (initialLoading) {
        return (
            <Center style={{ minHeight: "40vh" }}>
                <Loader size="lg" />
            </Center>
        );
    }

    return (
        <Stack gap="lg">
            <Group justify="space-between" align="center">
                <Title order={2}>{t("smsFailures.title")}</Title>
                <Button
                    variant="light"
                    leftSection={<IconRefresh size={16} />}
                    onClick={() => fetchData(true)}
                    loading={refreshing}
                >
                    {t("smsFailures.refresh")}
                </Button>
            </Group>

            <Tabs value={activeTab} onChange={handleTabChange}>
                <Tabs.List>
                    <Tabs.Tab value="active">{t("smsFailures.activeTab")}</Tabs.Tab>
                    <Tabs.Tab value="dismissed">{t("smsFailures.dismissedTab")}</Tabs.Tab>
                </Tabs.List>
            </Tabs>

            {error && (
                <Alert
                    icon={<IconAlertCircle size={16} />}
                    title={t("smsFailures.error")}
                    color="red"
                >
                    {error}
                </Alert>
            )}

            {failures.length === 0 ? (
                <Paper p="xl" withBorder>
                    <Text c="dimmed" ta="center">
                        {activeTab === "active"
                            ? t("smsFailures.noFailures")
                            : t("smsFailures.noDismissed")}
                    </Text>
                </Paper>
            ) : (
                <Stack gap="sm">
                    {failures.map(failure => {
                        const failureType = getFailureType(failure);
                        const isLoading = actionLoading[failure.id];
                        const isExpanded = expandedErrors.has(failure.id);

                        return (
                            <Paper key={failure.id} p="md" withBorder>
                                <Stack gap="sm">
                                    {/* Header row with name and badges */}
                                    <Group justify="space-between" wrap="nowrap">
                                        <Group gap="sm" wrap="nowrap" style={{ flex: 1 }}>
                                            <Text fw={600}>
                                                {failure.householdFirstName}{" "}
                                                {failure.householdLastName}
                                            </Text>
                                            <Badge
                                                color={failureType.color}
                                                variant="filled"
                                                size="sm"
                                            >
                                                {failureType.label}
                                            </Badge>
                                            <Badge color="gray" variant="outline" size="sm">
                                                {getIntentLabel(failure.intent)}
                                            </Badge>
                                        </Group>
                                    </Group>

                                    {/* Details row */}
                                    <Group gap="lg" wrap="wrap">
                                        <Group gap="xs">
                                            <IconPhone size={14} color="gray" />
                                            <Text size="sm" c="dimmed">
                                                {formatPhoneForDisplay(failure.phoneNumber)}
                                            </Text>
                                        </Group>
                                        <Text size="sm" c="dimmed">
                                            {t("smsFailures.pickup")}:{" "}
                                            {formatPickupTime(
                                                failure.pickupDateEarliest,
                                                failure.pickupDateLatest,
                                            )}
                                        </Text>
                                        {failure.sentAt && (
                                            <Text size="sm" c="dimmed">
                                                {t("smsFailures.sentAt")}:{" "}
                                                {formatDateTime(failure.sentAt)}
                                            </Text>
                                        )}
                                    </Group>

                                    {/* Error message (expandable) */}
                                    {failure.errorMessage && (
                                        <Stack gap={4}>
                                            <Group gap="xs">
                                                <ActionIcon
                                                    variant="subtle"
                                                    size="sm"
                                                    onClick={() => toggleErrorExpanded(failure.id)}
                                                >
                                                    {isExpanded ? (
                                                        <IconChevronUp size={14} />
                                                    ) : (
                                                        <IconChevronDown size={14} />
                                                    )}
                                                </ActionIcon>
                                                <Text size="sm" c="red">
                                                    {isExpanded
                                                        ? t("smsFailures.hideError")
                                                        : t("smsFailures.showError")}
                                                </Text>
                                            </Group>
                                            <Collapse in={isExpanded}>
                                                <Paper p="xs" bg="red.0" radius="sm">
                                                    <Text
                                                        size="sm"
                                                        style={{ whiteSpace: "pre-wrap" }}
                                                    >
                                                        {failure.errorMessage}
                                                    </Text>
                                                </Paper>
                                            </Collapse>
                                        </Stack>
                                    )}

                                    {/* Dismissed info */}
                                    {failure.dismissedAt && (
                                        <Text size="xs" c="dimmed">
                                            {t("smsFailures.dismissedAt")}{" "}
                                            {formatDateTime(failure.dismissedAt)}
                                            {failure.dismissedByUserId &&
                                                ` ${t("smsFailures.by")} ${failure.dismissedByUserId}`}
                                        </Text>
                                    )}

                                    {/* Action buttons */}
                                    <Group gap="sm" justify="flex-end">
                                        <Button
                                            component={Link}
                                            href={`/households/${failure.householdId}?parcel=${failure.parcelId}`}
                                            variant="light"
                                            size="xs"
                                        >
                                            {t("smsFailures.view")}
                                        </Button>

                                        {activeTab === "active" ? (
                                            <>
                                                <Tooltip label={t("smsFailures.resendTooltip")}>
                                                    <Button
                                                        variant="light"
                                                        color="blue"
                                                        size="xs"
                                                        leftSection={<IconSend size={14} />}
                                                        onClick={() => handleResend(failure)}
                                                        loading={isLoading}
                                                    >
                                                        {t("smsFailures.resend")}
                                                    </Button>
                                                </Tooltip>
                                                <Button
                                                    variant="light"
                                                    color="gray"
                                                    size="xs"
                                                    leftSection={<IconCheck size={14} />}
                                                    onClick={() => handleDismiss(failure, true)}
                                                    loading={isLoading}
                                                >
                                                    {t("smsFailures.dismiss")}
                                                </Button>
                                            </>
                                        ) : (
                                            <Button
                                                variant="light"
                                                color="blue"
                                                size="xs"
                                                leftSection={<IconRestore size={14} />}
                                                onClick={() => handleDismiss(failure, false)}
                                                loading={isLoading}
                                            >
                                                {t("smsFailures.restore")}
                                            </Button>
                                        )}
                                    </Group>
                                </Stack>
                            </Paper>
                        );
                    })}
                </Stack>
            )}
        </Stack>
    );
}
