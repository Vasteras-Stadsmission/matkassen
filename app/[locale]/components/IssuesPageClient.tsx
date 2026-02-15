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
    Tooltip,
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
    IconUserExclamation,
} from "@tabler/icons-react";
import { Link } from "@/app/i18n/navigation";
import { adminFetch } from "@/app/utils/auth/redirect-on-auth-error";
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
    pickupEarliest: string | null;
    errorMessage: string | null;
    failureType: "internal" | "provider" | "stale";
    createdAt: string;
}

interface NoShowFollowup {
    householdId: string;
    householdFirstName: string;
    householdLastName: string;
    consecutiveNoShows: number;
    totalNoShows: number;
    lastNoShowAt: string;
    triggerType: "consecutive" | "total" | "both";
}

interface IssuesData {
    unresolvedHandouts: UnresolvedHandout[];
    outsideHours: OutsideHoursParcel[];
    failedSms: FailedSms[];
    noShowFollowups: NoShowFollowup[];
    counts: {
        total: number;
        unresolvedHandouts: number;
        outsideHours: number;
        failedSms: number;
        noShowFollowups: number;
    };
}

type FilterType = "all" | "unresolvedHandouts" | "outsideHours" | "failedSms" | "noShowFollowups";

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
                PARCEL_NOT_FOUND: t("errorCodes.PARCEL_NOT_FOUND"),
                TOO_LATE: t("errorCodes.TOO_LATE"),
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
                const newNoShowFollowups = prev.noShowFollowups.filter(
                    f => `noshow-followup-${f.householdId}` !== cardKey,
                );

                // Only decrement counts if item was actually removed
                const handoutRemoved =
                    newUnresolvedHandouts.length < prev.unresolvedHandouts.length;
                const outsideRemoved = newOutsideHours.length < prev.outsideHours.length;
                const smsRemoved = newFailedSms.length < prev.failedSms.length;
                const noShowFollowupRemoved =
                    newNoShowFollowups.length < prev.noShowFollowups.length;

                // If nothing was removed, return unchanged state
                if (!handoutRemoved && !outsideRemoved && !smsRemoved && !noShowFollowupRemoved) {
                    return prev;
                }

                return {
                    ...prev,
                    unresolvedHandouts: newUnresolvedHandouts,
                    outsideHours: newOutsideHours,
                    failedSms: newFailedSms,
                    noShowFollowups: newNoShowFollowups,
                    counts: {
                        ...prev.counts,
                        // Clamp counts at 0 to prevent negative values from race conditions
                        total: Math.max(
                            0,
                            prev.counts.total -
                                (handoutRemoved ||
                                outsideRemoved ||
                                smsRemoved ||
                                noShowFollowupRemoved
                                    ? 1
                                    : 0),
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
                        noShowFollowups: noShowFollowupRemoved
                            ? Math.max(0, prev.counts.noShowFollowups - 1)
                            : prev.counts.noShowFollowups,
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
            const response = await adminFetch("/api/admin/issues", {
                signal: abortControllerRef.current.signal,
            });

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
            const response = await adminFetch(`/api/admin/parcel/${parcelId}/pickup`, {
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
            const response = await adminFetch(`/api/admin/parcel/${parcelId}/no-show`, {
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
            const response = await adminFetch(`/api/admin/parcel/${parcelId}`, {
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

    // Action handler: Retry failed SMS (for parcel-related SMS)
    const handleRetry = async (sms: FailedSms) => {
        if (!sms.parcelId) return;
        const key = `retry-${sms.id}`;
        setActionLoading(prev => ({ ...prev, [key]: true }));

        try {
            const response = await adminFetch(`/api/admin/sms/${sms.id}/retry`, {
                method: "POST",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(getErrorMessage(data, t("toast.retryError")));
            }

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

    // Reusable confirmation dialog for dismiss actions
    type DismissType = "failedSms" | "noShowFollowup";

    const confirmDismiss = (options: {
        type: DismissType;
        name: string;
        onConfirm: () => void;
    }) => {
        const { type, name, onConfirm } = options;

        // Use explicit translation keys to satisfy TypeScript's strict type checking
        const getTranslations = () => {
            if (type === "failedSms") {
                return {
                    title: t("confirm.dismissFailedSmsTitle"),
                    message: t("confirm.dismissFailedSmsMessage", { name }),
                    confirm: t("confirm.dismissFailedSmsConfirm"),
                };
            }
            return {
                title: t("confirm.dismissNoShowFollowupTitle"),
                message: t("confirm.dismissNoShowFollowupMessage", { name }),
                confirm: t("confirm.dismissNoShowFollowupConfirm"),
            };
        };

        const translations = getTranslations();
        modals.openConfirmModal({
            title: translations.title,
            children: <Text size="sm">{translations.message}</Text>,
            labels: {
                confirm: translations.confirm,
                cancel: t("confirm.cancel"),
            },
            confirmProps: { color: "orange" },
            onConfirm,
        });
    };

    // Action handler: Dismiss failed SMS (with confirmation)
    const handleDismissFailedSms = (smsId: string, householdName: string) => {
        confirmDismiss({
            type: "failedSms",
            name: householdName,
            onConfirm: () => executeDismissFailedSms(smsId),
        });
    };

    const executeDismissFailedSms = async (smsId: string) => {
        const key = `dismiss-${smsId}`;
        setActionLoading(prev => ({ ...prev, [key]: true }));

        try {
            const response = await adminFetch(`/api/admin/sms/${smsId}/dismiss`, {
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

    // Action handler: Dismiss no-show follow-up (with confirmation)
    const handleDismissNoShowFollowup = (householdId: string, householdName: string) => {
        confirmDismiss({
            type: "noShowFollowup",
            name: householdName,
            onConfirm: () => executeDismissNoShowFollowup(householdId),
        });
    };

    const executeDismissNoShowFollowup = async (householdId: string) => {
        const key = `dismiss-noshow-${householdId}`;
        setActionLoading(prev => ({ ...prev, [key]: true }));

        try {
            const response = await adminFetch(`/api/admin/noshow-followup/${householdId}/dismiss`, {
                method: "PATCH",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(getErrorMessage(data, t("toast.dismissError")));
            }

            notifications.show({
                title: t("toast.success"),
                message: t("toast.noShowFollowupDismissed"),
                color: "green",
                icon: <IconCheck size="1rem" />,
            });

            removeCardWithAnimation(`noshow-followup-${householdId}`);
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
    const showNoShowFollowups = activeFilter === "all" || activeFilter === "noShowFollowups";

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
                            {(issues?.counts.noShowFollowups ?? 0) > 0 && (
                                <Chip value="noShowFollowups" variant="filled">
                                    {t("filters.noShowFollowups")} ({issues?.counts.noShowFollowups}
                                    )
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
                            issues.failedSms.map(sms => {
                                const failureColors: Record<string, string> = {
                                    stale: "grape",
                                    provider: "red",
                                    internal: "orange",
                                };
                                const failureLabels: Record<string, string> = {
                                    stale: t("cardType.failedSmsStale"),
                                    provider: t("cardType.failedSmsProvider"),
                                    internal: t("cardType.failedSmsInternal"),
                                };
                                const failureColor = failureColors[sms.failureType] ?? "grape";
                                const failureLabel =
                                    failureLabels[sms.failureType] ?? t("cardType.failedSms");
                                const retryableIntents = [
                                    "pickup_reminder",
                                    "pickup_updated",
                                    "pickup_cancelled",
                                ];
                                const canRetry =
                                    sms.parcelId && retryableIntents.includes(sms.intent);
                                const pickupPassed =
                                    !sms.pickupEarliest ||
                                    new Date(sms.pickupEarliest).getTime() < Date.now();

                                return (
                                    <Paper
                                        key={`sms-${sms.id}`}
                                        p="xs"
                                        withBorder
                                        style={{
                                            borderLeft: `3px solid var(--mantine-color-${failureColor}-5)`,
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
                                                    color={`var(--mantine-color-${failureColor}-5)`}
                                                />
                                                <Text size="sm" c="dark.5" fw={500}>
                                                    {failureLabel}
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
                                                {canRetry &&
                                                    (pickupPassed ? (
                                                        <Tooltip
                                                            label={t("actions.retryPickupPassed")}
                                                            withArrow
                                                        >
                                                            <span tabIndex={0}>
                                                                <Button
                                                                    variant="light"
                                                                    color="blue"
                                                                    size="compact-sm"
                                                                    disabled
                                                                >
                                                                    {t("actions.retry")}
                                                                </Button>
                                                            </span>
                                                        </Tooltip>
                                                    ) : (
                                                        <Button
                                                            variant="light"
                                                            color="blue"
                                                            size="compact-sm"
                                                            loading={
                                                                actionLoading[`retry-${sms.id}`]
                                                            }
                                                            onClick={() => handleRetry(sms)}
                                                        >
                                                            {t("actions.retry")}
                                                        </Button>
                                                    ))}
                                                <Button
                                                    variant="light"
                                                    color="gray"
                                                    size="compact-sm"
                                                    loading={actionLoading[`dismiss-${sms.id}`]}
                                                    onClick={() =>
                                                        handleDismissFailedSms(
                                                            sms.id,
                                                            `${sms.householdFirstName} ${sms.householdLastName}`,
                                                        )
                                                    }
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
                                                        pickup_reminder: t(
                                                            "smsIntent.pickup_reminder",
                                                        ),
                                                        pickup_updated: t(
                                                            "smsIntent.pickup_updated",
                                                        ),
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
                                );
                            })}

                        {/* No-Show Follow-ups */}
                        {showNoShowFollowups &&
                            issues.noShowFollowups.map(followup => (
                                <Paper
                                    key={`noshow-followup-${followup.householdId}`}
                                    p="xs"
                                    withBorder
                                    style={{
                                        borderLeft: "3px solid var(--mantine-color-orange-5)",
                                        opacity: removingItems.has(
                                            `noshow-followup-${followup.householdId}`,
                                        )
                                            ? 0
                                            : 1,
                                        transform: removingItems.has(
                                            `noshow-followup-${followup.householdId}`,
                                        )
                                            ? "translateX(-20px)"
                                            : "translateX(0)",
                                        transition:
                                            "opacity 300ms ease-out, transform 300ms ease-out",
                                    }}
                                >
                                    <Stack gap={2}>
                                        <Group gap={6}>
                                            <IconUserExclamation
                                                size={16}
                                                color="var(--mantine-color-orange-5)"
                                            />
                                            <Text size="sm" c="dark.5" fw={500}>
                                                {t("cardType.noShowFollowup")}
                                            </Text>
                                        </Group>
                                        <Group gap="xs" wrap="wrap">
                                            <Text
                                                fw={600}
                                                component={Link}
                                                href={`/households/${followup.householdId}`}
                                                style={{ textDecoration: "none" }}
                                                c="inherit"
                                            >
                                                {followup.householdFirstName}{" "}
                                                {followup.householdLastName}
                                            </Text>
                                            <Button
                                                variant="light"
                                                color="gray"
                                                size="compact-sm"
                                                loading={
                                                    actionLoading[
                                                        `dismiss-noshow-${followup.householdId}`
                                                    ]
                                                }
                                                onClick={() =>
                                                    handleDismissNoShowFollowup(
                                                        followup.householdId,
                                                        `${followup.householdFirstName} ${followup.householdLastName}`,
                                                    )
                                                }
                                            >
                                                {t("actions.dismiss")}
                                            </Button>
                                            <Button
                                                component={Link}
                                                href={`/households/${followup.householdId}`}
                                                variant="light"
                                                size="compact-sm"
                                            >
                                                {t("actions.viewHousehold")} →
                                            </Button>
                                        </Group>
                                        <Text size="sm" c="dark.4">
                                            {followup.triggerType === "both"
                                                ? t("noShowFollowup.triggerBoth", {
                                                      consecutive: String(
                                                          followup.consecutiveNoShows,
                                                      ),
                                                      total: String(followup.totalNoShows),
                                                  })
                                                : followup.triggerType === "consecutive"
                                                  ? t("noShowFollowup.triggerConsecutive", {
                                                        count: String(followup.consecutiveNoShows),
                                                    })
                                                  : t("noShowFollowup.triggerTotal", {
                                                        count: String(followup.totalNoShows),
                                                    })}
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
