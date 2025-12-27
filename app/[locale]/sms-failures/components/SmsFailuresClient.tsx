"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "@mantine/core";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";
import { Link } from "@/app/i18n/navigation";
import type { TranslationFunction } from "@/app/[locale]/types";

interface SmsFailure {
    id: string;
    intent: string;
    householdId: string;
    householdFirstName: string;
    householdLastName: string;
    parcelId: string | null;
    pickupDateEarliest: string | null;
    pickupDateLatest: string | null;
    errorMessage: string | null;
    createdAt: string;
}

// Map intent to display labels
const getIntentLabel = (intent: string, t: TranslationFunction): string => {
    const labels: Record<string, string> = {
        consent_enrolment: t("smsFailures.intentEnrolment"),
        pickup_reminder: t("smsFailures.intentPickupReminder"),
        pickup_updated: t("smsFailures.intentPickupUpdated"),
        pickup_cancelled: t("smsFailures.intentPickupCancelled"),
    };
    return labels[intent] || intent;
};

export function SmsFailuresClient() {
    const t = useTranslations() as TranslationFunction;
    const locale = useLocale();

    const [failures, setFailures] = useState<SmsFailure[]>([]);
    const [initialLoading, setInitialLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(
        async (isRefresh = false) => {
            if (isRefresh) {
                setRefreshing(true);
            } else {
                setInitialLoading(true);
            }
            setError(null);

            try {
                const response = await fetch("/api/admin/sms/failures");
                if (!response.ok) {
                    throw new Error(t("smsFailures.error"));
                }

                const data = await response.json();
                // Validate response shape
                if (data && Array.isArray(data.failures)) {
                    setFailures(data.failures);
                } else {
                    setFailures([]);
                }
            } catch {
                setError(t("smsFailures.error"));
            } finally {
                setInitialLoading(false);
                setRefreshing(false);
            }
        },
        [t],
    );

    useEffect(() => {
        fetchData(false);
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
                        {t("smsFailures.noFailures")}
                    </Text>
                </Paper>
            ) : (
                <Stack gap="sm">
                    {failures.map(failure => {
                        const isParcelSms = failure.parcelId !== null;
                        const viewHref = isParcelSms
                            ? `/households/${failure.householdId}?parcel=${failure.parcelId}`
                            : `/households/${failure.householdId}`;

                        return (
                            <Paper key={failure.id} p="md" withBorder>
                                <Group justify="space-between" wrap="nowrap">
                                    <Stack gap="xs" style={{ flex: 1 }}>
                                        <Group gap="xs">
                                            <Text fw={600}>
                                                {failure.householdFirstName}{" "}
                                                {failure.householdLastName}
                                            </Text>
                                            <Badge color="blue" variant="light" size="xs">
                                                {getIntentLabel(failure.intent, t)}
                                            </Badge>
                                        </Group>
                                        <Text size="sm" c="dimmed">
                                            {isParcelSms &&
                                            failure.pickupDateEarliest &&
                                            failure.pickupDateLatest ? (
                                                <>
                                                    {t("smsFailures.pickup")}:{" "}
                                                    {formatPickupTime(
                                                        failure.pickupDateEarliest,
                                                        failure.pickupDateLatest,
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    {t("smsFailures.sent")}:{" "}
                                                    {new Date(failure.createdAt).toLocaleDateString(
                                                        locale,
                                                        {
                                                            weekday: "short",
                                                            month: "short",
                                                            day: "numeric",
                                                        },
                                                    )}
                                                </>
                                            )}
                                        </Text>
                                        {failure.errorMessage && (
                                            <Badge color="red" variant="light" size="sm">
                                                {failure.errorMessage.length > 50
                                                    ? `${failure.errorMessage.slice(0, 50)}...`
                                                    : failure.errorMessage}
                                            </Badge>
                                        )}
                                    </Stack>
                                    <Button
                                        component={Link}
                                        href={viewHref}
                                        variant="light"
                                        size="sm"
                                    >
                                        {t("smsFailures.view")}
                                    </Button>
                                </Group>
                            </Paper>
                        );
                    })}
                </Stack>
            )}
        </Stack>
    );
}
