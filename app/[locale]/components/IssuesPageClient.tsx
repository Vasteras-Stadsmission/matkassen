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
    Chip,
    ThemeIcon,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import {
    IconAlertCircle,
    IconCheck,
    IconPackage,
    IconClock,
    IconMessage,
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
    locationOpeningHours: string | null;
    locationIsClosed: boolean;
}

interface FailedSms {
    id: string;
    intent: string;
    householdId: string;
    householdFirstName: string;
    householdLastName: string;
    parcelId: string | null;
    parcelDeleted: boolean;
    parcelOutsideHours: boolean;
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
    const locale = useLocale();

    const [issues, setIssues] = useState<IssuesData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState<FilterType>("all");
    const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
    const [rescheduleParcelId, setRescheduleParcelId] = useState<string | null>(null);
    const [removingItems, setRemovingItems] = useState<Set<string>>(new Set());

    // Helper to get translated error message from API response
    // Uses error code if available, falls back to generic error
    const getErrorMessage = useCallback(
        (data: { code?: string; error?: string }, fallbackMessage: string): string => {
            // Map of API error codes to i18n keys
            const errorCodeMessages: Record<string, string> = {
                NOT_FOUND: t("errorCodes.NOT_FOUND"),
                ALREADY_CANCELLED: t("errorCodes.ALREADY_CANCELLED"),
                ALREADY_PICKED_UP: t("errorCodes.ALREADY_PICKED_UP"),
                ALREADY_NO_SHOW: t("errorCodes.ALREADY_NO_SHOW"),
                FUTURE_PARCEL: t("errorCodes.FUTURE_PARCEL"),
                ALREADY_DELETED: t("errorCodes.ALREADY_DELETED"),
                PAST_PARCEL: t("errorCodes.PAST_PARCEL"),
                INVALID_ACTION: t("errorCodes.INVALID_ACTION"),
                OUTSIDE_HOURS: t("errorCodes.OUTSIDE_HOURS"),
                COOLDOWN_ACTIVE: t("errorCodes.COOLDOWN_ACTIVE"),
                FETCH_ERROR: t("errorCodes.FETCH_ERROR"),
                SEND_ERROR: t("errorCodes.SEND_ERROR"),
                UNKNOWN_ERROR: t("errorCodes.UNKNOWN_ERROR"),
            };
            if (data.code && errorCodeMessages[data.code]) {
                return errorCodeMessages[data.code];
            }
            return fallbackMessage;
        },
        [t],
    );

    // Helper to optimistically remove a card with animation
    const removeCardWithAnimation = useCallback((cardKey: string) => {
        setRemovingItems(prev => new Set(prev).add(cardKey));
        // After animation completes, actually remove from data
        setTimeout(() => {
            setIssues(prev => {
                if (!prev) return prev;

                // Filter arrays and track what was actually removed
                const newUnresolvedHandouts = prev.unresolvedHandouts.filter(
                    p => `handout-${p.parcelId}` !== cardKey,
                );
                const newOutsideHours = prev.outsideHours.filter(
                    p => `outside-${p.parcelId}` !== cardKey,
                );
                const newFailedSms = prev.failedSms.filter(s => `sms-${s.id}` !== cardKey);

                // Only decrement counts if item was actually removed
                const handoutRemoved =
                    newUnresolvedHandouts.length < prev.unresolvedHandouts.length;
                const outsideRemoved = newOutsideHours.length < prev.outsideHours.length;
                const smsRemoved = newFailedSms.length < prev.failedSms.length;

                // If nothing was removed, return unchanged state
                if (!handoutRemoved && !outsideRemoved && !smsRemoved) {
                    return prev;
                }

                return {
                    ...prev,
                    unresolvedHandouts: newUnresolvedHandouts,
                    outsideHours: newOutsideHours,
                    failedSms: newFailedSms,
                    counts: {
                        ...prev.counts,
                        // Clamp counts at 0 to prevent negative values from race conditions
                        total: Math.max(
                            0,
                            prev.counts.total -
                                (handoutRemoved || outsideRemoved || smsRemoved ? 1 : 0),
                        ),
                        unresolvedHandouts: handoutRemoved
                            ? Math.max(0, prev.counts.unresolvedHandouts - 1)
                            : prev.counts.unresolvedHandouts,
                        outsideHours: outsideRemoved
                            ? Math.max(0, prev.counts.outsideHours - 1)
                            : prev.counts.outsideHours,
                        failedSms: smsRemoved
                            ? Math.max(0, prev.counts.failedSms - 1)
                            : prev.counts.failedSms,
                    },
                };
            });
            setRemovingItems(prev => {
                const next = new Set(prev);
                next.delete(cardKey);
                return next;
            });
        }, 300); // Match CSS transition duration
    }, []);

    const abortControllerRef = useRef<AbortController | null>(null);

    const fetchData = useCallback(async () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setLoading(true);
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
            setLoading(false);
        }
    }, [t]);

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
            timeZone: "Europe/Stockholm",
        };
        const timeOptions: Intl.DateTimeFormatOptions = {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Stockholm",
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
                throw new Error(getErrorMessage(data, t("toast.handedOutError")));
            }

            notifications.show({
                title: t("toast.success"),
                message: t("toast.handedOut"),
                color: "green",
                icon: <IconCheck size="1rem" />,
            });

            removeCardWithAnimation(`handout-${parcelId}`);
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

    // Action handler: Mark parcel as no-show (with confirmation)
    const handleNoShow = (parcelId: string, householdName: string) => {
        modals.openConfirmModal({
            title: t("confirm.noShowTitle"),
            children: <Text size="sm">{t("confirm.noShowMessage", { name: householdName })}</Text>,
            labels: {
                confirm: t("confirm.noShowConfirm"),
                cancel: t("confirm.cancel"),
            },
            confirmProps: { color: "orange" },
            onConfirm: () => executeNoShow(parcelId),
        });
    };

    const executeNoShow = async (parcelId: string) => {
        const key = `noshow-${parcelId}`;
        setActionLoading(prev => ({ ...prev, [key]: true }));

        try {
            const response = await fetch(`/api/admin/parcel/${parcelId}/no-show`, {
                method: "PATCH",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(getErrorMessage(data, t("toast.noShowError")));
            }

            notifications.show({
                title: t("toast.success"),
                message: t("toast.noShow"),
                color: "green",
                icon: <IconCheck size="1rem" />,
            });

            removeCardWithAnimation(`handout-${parcelId}`);
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

    // Action handler: Cancel parcel (soft delete) (with confirmation)
    const handleCancelParcel = (parcelId: string, householdName: string) => {
        modals.openConfirmModal({
            title: t("confirm.cancelParcelTitle"),
            children: (
                <Text size="sm">{t("confirm.cancelParcelMessage", { name: householdName })}</Text>
            ),
            labels: {
                confirm: t("confirm.cancelParcelConfirm"),
                cancel: t("confirm.cancel"),
            },
            confirmProps: { color: "red" },
            onConfirm: () => executeCancelParcel(parcelId),
        });
    };

    const executeCancelParcel = async (parcelId: string) => {
        const key = `cancel-${parcelId}`;
        setActionLoading(prev => ({ ...prev, [key]: true }));

        try {
            const response = await fetch(`/api/admin/parcel/${parcelId}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(getErrorMessage(data, t("toast.cancelError")));
            }

            notifications.show({
                title: t("toast.success"),
                message: t("toast.cancelParcel"),
                color: "green",
                icon: <IconCheck size="1rem" />,
            });

            removeCardWithAnimation(`outside-${parcelId}`);
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
                throw new Error(getErrorMessage(data, t("toast.retryError")));
            }

            // Auto-dismiss the original failure after successful retry
            // This prevents the same failure from reappearing on refresh
            await fetch(`/api/admin/sms/${sms.id}/dismiss`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dismissed: true }),
            });

            notifications.show({
                title: t("toast.success"),
                message: t("toast.retry"),
                color: "green",
                icon: <IconCheck size="1rem" />,
            });

            removeCardWithAnimation(`sms-${sms.id}`);
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
                throw new Error(getErrorMessage(data, t("toast.dismissError")));
            }

            notifications.show({
                title: t("toast.success"),
                message: t("toast.dismiss"),
                color: "green",
                icon: <IconCheck size="1rem" />,
            });

            removeCardWithAnimation(`sms-${smsId}`);
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

    if (loading) {
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
                <Title order={2}>{t("title")}</Title>

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
                            {(issues?.counts.unresolvedHandouts ?? 0) > 0 && (
                                <Chip value="unresolvedHandouts" variant="filled">
                                    {t("filters.unresolvedHandouts")} (
                                    {issues?.counts.unresolvedHandouts})
                                </Chip>
                            )}
                            {(issues?.counts.outsideHours ?? 0) > 0 && (
                                <Chip value="outsideHours" variant="filled">
                                    {t("filters.outsideOpeningHours")} (
                                    {issues?.counts.outsideHours})
                                </Chip>
                            )}
                            {(issues?.counts.failedSms ?? 0) > 0 && (
                                <Chip value="failedSms" variant="filled">
                                    {t("filters.failedSms")} ({issues?.counts.failedSms})
                                </Chip>
                            )}
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

                {/* Unified issue list */}
                {issues && !hasNoIssues && (
                    <Stack gap="sm">
                        {/* Unresolved Handouts */}
                        {showUnresolvedHandouts &&
                            issues.unresolvedHandouts.map(parcel => (
                                <Paper
                                    key={`handout-${parcel.parcelId}`}
                                    p="xs"
                                    withBorder
                                    style={{
                                        borderLeft: "3px solid var(--mantine-color-violet-5)",
                                        opacity: removingItems.has(`handout-${parcel.parcelId}`)
                                            ? 0
                                            : 1,
                                        transform: removingItems.has(`handout-${parcel.parcelId}`)
                                            ? "translateX(-20px)"
                                            : "translateX(0)",
                                        transition:
                                            "opacity 300ms ease-out, transform 300ms ease-out",
                                    }}
                                >
                                    <Stack gap={2}>
                                        <Group gap={6}>
                                            <IconPackage
                                                size={16}
                                                color="var(--mantine-color-violet-5)"
                                            />
                                            <Text size="sm" c="dark.5" fw={500}>
                                                {t("cardType.unresolvedHandout")}
                                            </Text>
                                        </Group>
                                        <Group gap="xs" wrap="wrap">
                                            <Text
                                                fw={600}
                                                component={Link}
                                                href={`/households/${parcel.householdId}`}
                                                style={{ textDecoration: "none" }}
                                                c="inherit"
                                            >
                                                {parcel.householdFirstName}{" "}
                                                {parcel.householdLastName}
                                            </Text>
                                            <Button
                                                variant="light"
                                                color="green"
                                                size="compact-sm"
                                                loading={actionLoading[`pickup-${parcel.parcelId}`]}
                                                onClick={() => handleHandedOut(parcel.parcelId)}
                                            >
                                                {t("actions.handedOut")}
                                            </Button>
                                            <Button
                                                variant="light"
                                                color="orange"
                                                size="compact-sm"
                                                loading={actionLoading[`noshow-${parcel.parcelId}`]}
                                                onClick={() =>
                                                    handleNoShow(
                                                        parcel.parcelId,
                                                        `${parcel.householdFirstName} ${parcel.householdLastName}`,
                                                    )
                                                }
                                            >
                                                {t("actions.noShow")}
                                            </Button>
                                        </Group>
                                        <Text size="sm" c="dark.4">
                                            {formatPickupTime(
                                                parcel.pickupDateEarliest,
                                                parcel.pickupDateLatest,
                                            )}{" "}
                                            · {parcel.locationName}
                                        </Text>
                                    </Stack>
                                </Paper>
                            ))}

                        {/* Outside Opening Hours */}
                        {showOutsideHours &&
                            issues.outsideHours.map(parcel => (
                                <Paper
                                    key={`outside-${parcel.parcelId}`}
                                    p="xs"
                                    withBorder
                                    style={{
                                        borderLeft: "3px solid var(--mantine-color-indigo-5)",
                                        opacity: removingItems.has(`outside-${parcel.parcelId}`)
                                            ? 0
                                            : 1,
                                        transform: removingItems.has(`outside-${parcel.parcelId}`)
                                            ? "translateX(-20px)"
                                            : "translateX(0)",
                                        transition:
                                            "opacity 300ms ease-out, transform 300ms ease-out",
                                    }}
                                >
                                    <Stack gap={2}>
                                        <Group gap={6}>
                                            <IconClock
                                                size={16}
                                                color="var(--mantine-color-indigo-5)"
                                            />
                                            <Text size="sm" c="dark.5" fw={500}>
                                                {t("cardType.outsideHours")}
                                            </Text>
                                        </Group>
                                        <Group gap="xs" wrap="wrap">
                                            <Text
                                                fw={600}
                                                component={Link}
                                                href={`/households/${parcel.householdId}`}
                                                style={{ textDecoration: "none" }}
                                                c="inherit"
                                            >
                                                {parcel.householdFirstName}{" "}
                                                {parcel.householdLastName}
                                            </Text>
                                            {rescheduleParcelId !== parcel.parcelId && (
                                                <>
                                                    <Button
                                                        variant="light"
                                                        color="red"
                                                        size="compact-sm"
                                                        loading={
                                                            actionLoading[
                                                                `cancel-${parcel.parcelId}`
                                                            ]
                                                        }
                                                        onClick={() =>
                                                            handleCancelParcel(
                                                                parcel.parcelId,
                                                                `${parcel.householdFirstName} ${parcel.householdLastName}`,
                                                            )
                                                        }
                                                    >
                                                        {t("actions.cancelParcel")}
                                                    </Button>
                                                    <Button
                                                        variant="light"
                                                        color="blue"
                                                        size="compact-sm"
                                                        onClick={() =>
                                                            setRescheduleParcelId(parcel.parcelId)
                                                        }
                                                    >
                                                        {t("actions.reschedule")}
                                                    </Button>
                                                </>
                                            )}
                                        </Group>
                                        <Text size="sm" c="dark.4">
                                            {formatPickupTime(
                                                parcel.pickupDateEarliest,
                                                parcel.pickupDateLatest,
                                            )}{" "}
                                            · {parcel.locationName}
                                            {parcel.locationIsClosed ? (
                                                <Text span fw={500} inherit>
                                                    {" "}
                                                    · {t("closedThisDay")}
                                                </Text>
                                            ) : parcel.locationOpeningHours ? (
                                                <Text span fw={500} inherit>
                                                    {" "}
                                                    ·{" "}
                                                    {t("openingHours", {
                                                        hours: parcel.locationOpeningHours,
                                                    })}
                                                </Text>
                                            ) : null}
                                        </Text>
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
                                                removeCardWithAnimation(
                                                    `outside-${parcel.parcelId}`,
                                                );
                                            }}
                                        />
                                    </Stack>
                                </Paper>
                            ))}

                        {/* Failed SMS */}
                        {showFailedSms &&
                            issues.failedSms.map(sms => (
                                <Paper
                                    key={`sms-${sms.id}`}
                                    p="xs"
                                    withBorder
                                    style={{
                                        borderLeft: "3px solid var(--mantine-color-grape-5)",
                                        opacity: removingItems.has(`sms-${sms.id}`) ? 0 : 1,
                                        transform: removingItems.has(`sms-${sms.id}`)
                                            ? "translateX(-20px)"
                                            : "translateX(0)",
                                        transition:
                                            "opacity 300ms ease-out, transform 300ms ease-out",
                                    }}
                                >
                                    <Stack gap={2}>
                                        <Group gap={6}>
                                            <IconMessage
                                                size={16}
                                                color="var(--mantine-color-grape-5)"
                                            />
                                            <Text size="sm" c="dark.5" fw={500}>
                                                {t("cardType.failedSms")}
                                            </Text>
                                        </Group>
                                        <Group gap="xs" wrap="wrap">
                                            <Text
                                                fw={600}
                                                component={Link}
                                                href={`/households/${sms.householdId}`}
                                                style={{ textDecoration: "none" }}
                                                c="inherit"
                                            >
                                                {sms.householdFirstName} {sms.householdLastName}
                                            </Text>
                                            {/* Retry only available for pickup_reminder with valid parcel (not deleted, not outside hours) */}
                                            {sms.parcelId &&
                                                !sms.parcelDeleted &&
                                                !sms.parcelOutsideHours &&
                                                sms.intent === "pickup_reminder" && (
                                                    <Button
                                                        variant="light"
                                                        color="blue"
                                                        size="compact-sm"
                                                        loading={actionLoading[`retry-${sms.id}`]}
                                                        onClick={() => handleRetry(sms)}
                                                    >
                                                        {t("actions.retry")}
                                                    </Button>
                                                )}
                                            <Button
                                                variant="light"
                                                color="gray"
                                                size="compact-sm"
                                                loading={actionLoading[`dismiss-${sms.id}`]}
                                                onClick={() => handleDismiss(sms.id)}
                                            >
                                                {t("actions.dismiss")}
                                            </Button>
                                            <Button
                                                component={Link}
                                                href={`/households/${sms.householdId}/edit`}
                                                variant="light"
                                                size="compact-sm"
                                            >
                                                {t("actions.editHousehold")} →
                                            </Button>
                                        </Group>
                                        <Text size="sm" c="dark.4">
                                            {
                                                {
                                                    pickup_reminder: t("smsIntent.pickup_reminder"),
                                                    pickup_updated: t("smsIntent.pickup_updated"),
                                                    pickup_cancelled: t(
                                                        "smsIntent.pickup_cancelled",
                                                    ),
                                                    enrolment: t("smsIntent.enrolment"),
                                                    consent_enrolment: t(
                                                        "smsIntent.consent_enrolment",
                                                    ),
                                                    food_parcels_ended: t(
                                                        "smsIntent.food_parcels_ended",
                                                    ),
                                                }[sms.intent]
                                            }
                                        </Text>
                                        <Text size="sm" c="dark.4">
                                            {
                                                {
                                                    internal: t("failureDescription.internal"),
                                                    provider: t("failureDescription.provider"),
                                                    stale: t("failureDescription.stale"),
                                                }[sms.failureType]
                                            }
                                            {sms.errorMessage && `: ${sms.errorMessage}`}
                                        </Text>
                                    </Stack>
                                </Paper>
                            ))}
                    </Stack>
                )}
            </Stack>
        </Container>
    );
}
