"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Modal,
    Stack,
    Text,
    Group,
    Button,
    Badge,
    Card,
    Loader,
    Alert,
    Box,
    SimpleGrid,
} from "@mantine/core";
import {
    IconInfoCircle,
    IconMapPin,
    IconPhone,
    IconCalendar,
    IconCheck,
    IconX,
    IconExternalLink,
    IconTrash,
    IconSend,
} from "@tabler/icons-react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/app/i18n/navigation";
import { ParcelDetails } from "@/app/api/admin/parcel/[parcelId]/details/route";
import CommentSection from "./CommentSection";
import { convertParcelCommentsToComments } from "./commentHelpers";
import { SmsActionButton } from "./SmsActionButton";
import type { TranslationFunction } from "@/app/[locale]/types";
import { getLanguageName } from "@/app/constants/languages";
import { Time } from "@/app/utils/time-provider";
import { modals } from "@mantine/modals";
import { formatPhoneForDisplay } from "@/app/utils/validation/phone-validation";
import { notifications } from "@mantine/notifications";

interface ParcelAdminDialogProps {
    parcelId: string | null;
    opened: boolean;
    onClose: () => void;
    onParcelUpdated?: (action: "pickup" | "undo" | "delete") => void;
}

interface SmsRecord {
    id: string;
    status: "queued" | "sending" | "sent" | "retrying" | "failed" | "cancelled";
    intent: string;
    nextAttemptAt?: string; // ISO date string for retry scheduling
    providerStatus?: "delivered" | "failed" | "not delivered" | null;
    providerStatusUpdatedAt?: string;
    sentAt?: string;
    createdAt: string;
}

interface ParcelDialogState {
    loading: boolean;
    error: string | null;
    data: ParcelDetails | null;
    submitting: boolean;
    smsRecords: SmsRecord[];
}

export function ParcelAdminDialog({
    parcelId,
    opened,
    onClose,
    onParcelUpdated,
}: ParcelAdminDialogProps) {
    const t = useTranslations() as TranslationFunction;
    const locale = useLocale();
    const [state, setState] = useState<ParcelDialogState>({
        loading: false,
        error: null,
        data: null,
        submitting: false,
        smsRecords: [],
    });

    const fetchParcelDetails = useCallback(async () => {
        if (!parcelId) return;

        setState(prev => ({ ...prev, loading: true, error: null }));

        try {
            // Fetch parcel details and SMS records in parallel
            const [parcelResponse, smsResponse] = await Promise.all([
                fetch(`/api/admin/parcel/${parcelId}/details`),
                fetch(`/api/admin/sms/parcel/${parcelId}`),
            ]);

            if (!parcelResponse.ok) {
                throw new Error(t("admin.parcelDialog.errors.loadFailed"));
            }

            const parcelData = await parcelResponse.json();
            const smsData = smsResponse.ok ? await smsResponse.json() : { smsRecords: [] };

            setState(prev => ({
                ...prev,
                loading: false,
                data: parcelData,
                smsRecords: smsData.smsRecords || [],
            }));
        } catch (error) {
            setState(prev => ({
                ...prev,
                loading: false,
                error:
                    error instanceof Error
                        ? error.message
                        : t("admin.parcelDialog.errors.loadFailed"),
            }));
        }
    }, [parcelId, t]);

    // Fetch parcel details when dialog opens.
    // Important: avoid setting state on every render when closed, which can cause an update loop.
    useEffect(() => {
        if (!opened || !parcelId) {
            // Only clear when there is something to clear to prevent unnecessary state updates
            setState(prev => {
                if (prev.data === null && prev.error === null) {
                    return prev; // no-op, prevents re-render loop when closed
                }
                return { ...prev, data: null, error: null };
            });
            return;
        }

        fetchParcelDetails();
    }, [opened, parcelId, fetchParcelDetails]);

    const handleMarkPickedUp = async () => {
        if (!parcelId) return;

        setState(prev => ({ ...prev, submitting: true }));

        try {
            const response = await fetch(`/api/admin/parcel/${parcelId}/pickup`, {
                method: "PATCH",
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            // Refresh data and notify parent
            await fetchParcelDetails();
            onParcelUpdated?.("pickup");
        } catch {
            setState(prev => ({
                ...prev,
                error: t("admin.parcelDialog.errors.markPickupFailed"),
            }));
        } finally {
            setState(prev => ({ ...prev, submitting: false }));
        }
    };
    const handleUndoPickup = async () => {
        if (!parcelId) return;

        setState(prev => ({ ...prev, submitting: true }));

        try {
            const response = await fetch(`/api/admin/parcel/${parcelId}/pickup`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            // Refresh data and notify parent
            await fetchParcelDetails();
            onParcelUpdated?.("undo");
        } catch {
            setState(prev => ({
                ...prev,
                error: t("admin.parcelDialog.errors.undoPickupFailed"),
            }));
        } finally {
            setState(prev => ({ ...prev, submitting: false }));
        }
    };

    const handleAddComment = async (commentText: string) => {
        if (!parcelId || !commentText.trim()) return null;

        setState(prev => ({ ...prev, submitting: true }));

        try {
            const response = await fetch(
                `/api/admin/household/${state.data?.household.id}/comments`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        comment: commentText.trim(),
                    }),
                },
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            // Refresh data to get the new comment
            await fetchParcelDetails();
            return null; // CommentSection expects a return value
        } catch {
            setState(prev => ({
                ...prev,
                error: t("admin.parcelDialog.errors.addCommentFailed"),
            }));
            return null;
        } finally {
            setState(prev => ({ ...prev, submitting: false }));
        }
    };

    const handleDeleteComment = async (commentId: string): Promise<void> => {
        try {
            // Import the delete function dynamically to avoid circular imports
            const { deleteHouseholdComment } = await import("@/app/[locale]/households/actions");
            const success = await deleteHouseholdComment(commentId);

            if (success) {
                // Refresh data to get updated comments
                await fetchParcelDetails();
            } else {
                setState(prev => ({
                    ...prev,
                    error: t("admin.parcelDialog.errors.deleteCommentFailed"),
                }));
            }
        } catch (error) {
            console.error(t("admin.parcelDialog.errors.deleteCommentError") + ":", error);
            setState(prev => ({
                ...prev,
                error: t("admin.parcelDialog.errors.deleteCommentError"),
            }));
        }
    };

    const handleDeleteParcel = () => {
        if (!parcelId || !data) return;

        // Check if SMS was actually sent to household based on SMS records
        // Default to true if no SMS data available (safer to warn than not)
        const hasSentSms =
            state.smsRecords.length === 0 || state.smsRecords.some(sms => sms.status === "sent");
        const smsWarning = hasSentSms
            ? t("admin.parcelDialog.smsWarning")
            : t("admin.parcelDialog.smsNoWarning");

        modals.openConfirmModal({
            title: t("admin.parcelDialog.deleteConfirmTitle"),
            children: (
                <Text size="sm">
                    {t("admin.parcelDialog.deleteConfirmMessage", { smsWarning })}
                </Text>
            ),
            labels: {
                confirm: t("admin.parcelDialog.confirmDelete"),
                cancel: t("admin.parcelDialog.cancelDelete"),
            },
            confirmProps: { color: "red" },
            onConfirm: async () => {
                setState(prev => ({ ...prev, submitting: true }));

                try {
                    const response = await fetch(`/api/admin/parcel/${parcelId}`, {
                        method: "DELETE",
                    });

                    if (!response.ok) {
                        const errorData = await response.json();

                        // Map error codes to user-friendly messages
                        let errorMessage = t("admin.parcelDialog.errors.deleteParcelFailed");
                        if (errorData.code === "ALREADY_PICKED_UP") {
                            errorMessage = t("admin.parcelDialog.errors.parcelAlreadyPickedUp");
                        } else if (errorData.code === "PAST_PARCEL") {
                            errorMessage = t("admin.parcelDialog.errors.parcelInPast");
                        }

                        throw new Error(errorMessage);
                    }

                    // Success! Show notification and close dialog
                    notifications.show({
                        title: t("admin.parcelDialog.success.parcelDeleted"),
                        message: t("admin.parcelDialog.success.parcelDeletedMessage"),
                        color: "green",
                        icon: <IconCheck size="1rem" />,
                    });

                    onParcelUpdated?.("delete");
                    handleClose();
                } catch (error) {
                    setState(prev => ({
                        ...prev,
                        error:
                            error instanceof Error
                                ? error.message
                                : t("admin.parcelDialog.errors.deleteParcelFailed"),
                    }));
                } finally {
                    setState(prev => ({ ...prev, submitting: false }));
                }
            },
        });
    };

    const formatDateTime = (dateTimeString: string) => {
        const date = new Date(dateTimeString);
        // Use appropriate locale for date/time formatting
        const localeString = locale === "sv" ? "sv-SE" : "en-GB";
        return date.toLocaleString(localeString, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    const formatDate = (dateTimeString: string) => {
        const date = new Date(dateTimeString);
        // Use appropriate locale for date formatting
        const localeString = locale === "sv" ? "sv-SE" : "en-GB";
        return date.toLocaleDateString(localeString, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
    };

    const formatTime = (dateTimeString: string) => {
        const date = new Date(dateTimeString);
        // Use appropriate locale for time formatting with 24-hour format
        const localeString = locale === "sv" ? "sv-SE" : "en-GB";
        return date.toLocaleTimeString(localeString, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    const getPickupStatus = (parcel: ParcelDetails["parcel"]) => {
        // Check if cancelled first
        if (parcel.deletedAt) {
            return { color: "gray", key: "cancelled" };
        }

        const now = Time.now();
        const pickupStart = Time.fromString(parcel.pickupDateTimeEarliest);
        const pickupEnd = Time.fromString(parcel.pickupDateTimeLatest);
        const isToday = now.toDateString() === pickupStart.toDateString();

        if (parcel.isPickedUp) {
            return { color: "green", key: "pickedUp" };
        } else if (!isToday) {
            return { color: "red", key: "wrongDay" };
        } else if (now.isAfter(pickupStart) && now.isBefore(pickupEnd)) {
            return { color: "green", key: "okToHandOut" };
        } else {
            // Today but outside pickup window (early or late)
            return { color: "orange", key: "checkTime" };
        }
    };

    const getPickupTimeColor = (parcel: ParcelDetails["parcel"]) => {
        return getPickupStatus(parcel).color;
    };

    const handleClose = () => {
        setState(prev => ({ ...prev, error: null, smsRecords: [] }));
        onClose();
    };

    const { loading, error, data, submitting } = state;

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title={
                <Group gap="sm">
                    <IconInfoCircle size="1.2rem" />
                    <Text fw={700} size="lg">
                        {t("admin.parcelDialog.title")}
                    </Text>
                </Group>
            }
            size="lg"
            centered
            overlayProps={{
                opacity: 0.55,
                blur: 3,
            }}
        >
            <Stack gap="md">
                {/* Error Alert */}
                {error && (
                    <Alert
                        color="red"
                        icon={<IconX size="1rem" />}
                        onClose={() => setState(prev => ({ ...prev, error: null }))}
                    >
                        {error}
                    </Alert>
                )}

                {/* Loading State */}
                {loading && (
                    <Group justify="center" p="xl">
                        <Loader size="md" />
                        <Text c="dimmed">{t("admin.parcelDialog.loading")}</Text>
                    </Group>
                )}

                {/* Content */}
                {data && !loading && (
                    <>
                        {/* Pickup Status */}
                        <Card withBorder p="lg">
                            <Group justify="space-between" align="flex-start">
                                <Stack gap="sm">
                                    <Group gap="sm">
                                        <IconCalendar size="1.2rem" />
                                        <Text
                                            size="lg"
                                            fw={700}
                                            c={getPickupTimeColor(data.parcel)}
                                        >
                                            {formatDate(data.parcel.pickupDateTimeEarliest)}
                                        </Text>
                                        <Text
                                            size="md"
                                            fw={600}
                                            c={getPickupTimeColor(data.parcel)}
                                        >
                                            {formatTime(data.parcel.pickupDateTimeEarliest)} -{" "}
                                            {formatTime(data.parcel.pickupDateTimeLatest)}
                                        </Text>
                                    </Group>
                                    <Group gap="sm" mt="xs">
                                        <IconMapPin
                                            size="1rem"
                                            color="var(--mantine-color-blue-6)"
                                        />
                                        <Text size="md" fw={500}>
                                            {data.parcel.pickupLocationName}
                                        </Text>
                                    </Group>
                                </Stack>

                                <Stack gap="sm" align="flex-end">
                                    <Badge
                                        color={getPickupStatus(data.parcel).color}
                                        variant="filled"
                                        size="lg"
                                        radius="md"
                                        style={{ fontSize: "0.875rem", fontWeight: 600 }}
                                    >
                                        {(() => {
                                            const status = getPickupStatus(data.parcel);
                                            switch (status.key) {
                                                case "pickedUp":
                                                    return t("admin.parcelDialog.status.handedOut");
                                                case "cancelled":
                                                    return t("admin.parcelDialog.status.cancelled");
                                                case "wrongDay":
                                                    return t("admin.parcelDialog.status.wrongDay");
                                                case "checkTime":
                                                    return t("admin.parcelDialog.status.checkTime");
                                                case "okToHandOut":
                                                    return t(
                                                        "admin.parcelDialog.status.okToHandOut",
                                                    );
                                                default:
                                                    return t("admin.parcelDialog.notHandedOut");
                                            }
                                        })()}
                                    </Badge>

                                    {data.parcel.isPickedUp && data.parcel.pickedUpAt && (
                                        <Stack gap={2} align="flex-end">
                                            <Text size="xs" c="dimmed">
                                                {formatDateTime(data.parcel.pickedUpAt)}
                                            </Text>
                                            {data.parcel.pickedUpBy && (
                                                <Text size="xs" c="dimmed">
                                                    {t("admin.parcelDialog.by")}{" "}
                                                    {data.parcel.pickedUpBy}
                                                </Text>
                                            )}
                                        </Stack>
                                    )}
                                    {data.parcel.deletedAt && (
                                        <Stack gap={2} align="flex-end">
                                            <Text size="xs" c="dimmed">
                                                {formatDateTime(data.parcel.deletedAt)}
                                            </Text>
                                            {data.parcel.deletedBy && (
                                                <Text size="xs" c="dimmed">
                                                    {t("admin.parcelDialog.by")}{" "}
                                                    {data.parcel.deletedBy}
                                                </Text>
                                            )}
                                        </Stack>
                                    )}
                                </Stack>
                            </Group>
                        </Card>

                        {/* Household Details */}
                        <Card withBorder>
                            <Stack gap="md">
                                <Group justify="space-between">
                                    <Text fw={500}>{t("admin.parcelDialog.householdDetails")}</Text>
                                    <Link
                                        href={`/households/${data.household.id}`}
                                        target="_blank"
                                        style={{
                                            fontSize: "var(--mantine-font-size-sm)",
                                            textDecoration: "none",
                                        }}
                                    >
                                        <Group gap="xs">
                                            <Text>{t("admin.parcelDialog.viewDetails")}</Text>
                                            <IconExternalLink size="0.9rem" />
                                        </Group>
                                    </Link>
                                </Group>

                                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                                    <Stack gap="sm">
                                        <Text fw={700} size="lg">
                                            {data.household.firstName} {data.household.lastName}
                                        </Text>
                                        <Group gap="sm">
                                            <IconPhone
                                                size="1rem"
                                                color="var(--mantine-color-gray-6)"
                                            />
                                            <Text size="md">{formatPhoneForDisplay(data.household.phoneNumber)}</Text>
                                        </Group>
                                        <Group gap="sm" align="baseline">
                                            <Text size="sm" c="dimmed" fw={500}>
                                                {t("admin.parcelDialog.postalCode")}:
                                            </Text>
                                            <Text size="sm" c="dark">
                                                {data.household.postalCode}
                                            </Text>
                                        </Group>
                                        <Group gap="sm" align="baseline">
                                            <Text size="sm" c="dimmed" fw={500}>
                                                {t("admin.parcelDialog.language")}:
                                            </Text>
                                            <Text size="sm" c="dark" fw={500}>
                                                {getLanguageName(data.household.locale, locale)}
                                            </Text>
                                        </Group>
                                    </Stack>

                                    <Stack gap="sm">
                                        <Group gap="sm" align="baseline">
                                            <Text size="sm" c="dimmed" fw={500}>
                                                {t("admin.parcelDialog.members", {
                                                    count: data.household.members.length,
                                                })}
                                                :
                                            </Text>
                                            <Text size="sm" c="dark" fw={600}>
                                                {data.household.members.length}
                                            </Text>
                                        </Group>
                                        {data.household.pets.length > 0 && (
                                            <Text size="sm">
                                                {t("admin.parcelDialog.pets")}:{" "}
                                                {data.household.pets
                                                    .map(pet => pet.species)
                                                    .join(", ")}
                                            </Text>
                                        )}
                                        {data.household.dietaryRestrictions.length > 0 && (
                                            <Box>
                                                <Text size="sm" fw={500} mb="xs">
                                                    {t("admin.parcelDialog.dietaryRestrictions")}:
                                                </Text>
                                                <Group gap="xs">
                                                    {data.household.dietaryRestrictions.map(
                                                        restriction => (
                                                            <Badge
                                                                key={restriction}
                                                                size="sm"
                                                                variant="outline"
                                                            >
                                                                {restriction}
                                                            </Badge>
                                                        ),
                                                    )}
                                                </Group>
                                            </Box>
                                        )}
                                        {data.household.additionalNeeds.length > 0 && (
                                            <Box>
                                                <Text size="sm" fw={500} mb="xs">
                                                    {t("admin.parcelDialog.additionalNeeds")}:
                                                </Text>
                                                <Group gap="xs">
                                                    {data.household.additionalNeeds.map(need => (
                                                        <Badge
                                                            key={need}
                                                            size="sm"
                                                            variant="outline"
                                                            color="blue"
                                                        >
                                                            {need}
                                                        </Badge>
                                                    ))}
                                                </Group>
                                            </Box>
                                        )}
                                    </Stack>
                                </SimpleGrid>
                            </Stack>
                        </Card>

                        {/* Comments Section */}
                        <Card withBorder>
                            <CommentSection
                                comments={convertParcelCommentsToComments(data.comments)}
                                onAddComment={handleAddComment}
                                onDeleteComment={handleDeleteComment}
                                entityType="parcel"
                                isSubmitting={submitting}
                                placeholder={t("admin.parcelDialog.addCommentPlaceholder")}
                            />
                        </Card>

                        {/* SMS Status */}
                        {state.smsRecords.length > 0 && (
                            <Card withBorder>
                                <Stack gap="md">
                                    <Group justify="space-between">
                                        <Group gap="xs">
                                            <IconSend size="1rem" />
                                            <Text fw={500}>
                                                {t("admin.parcelDialog.smsStatus.title")}
                                            </Text>
                                        </Group>
                                        <SmsActionButton
                                            parcelId={parcelId!}
                                            smsStatus={
                                                state.smsRecords[0]?.status as
                                                    | "queued"
                                                    | "sending"
                                                    | "sent"
                                                    | "retrying"
                                                    | "failed"
                                                    | "cancelled"
                                            }
                                            nextRetryAt={
                                                state.smsRecords[0]?.nextAttemptAt
                                                    ? new Date(state.smsRecords[0].nextAttemptAt)
                                                    : undefined
                                            }
                                            onSuccess={fetchParcelDetails}
                                            variant="light"
                                            size="sm"
                                        />
                                    </Group>
                                    {state.smsRecords.map(sms => (
                                        <Stack key={sms.id} gap="xs">
                                            <Group justify="space-between" wrap="nowrap">
                                                <Group gap="xs" wrap="nowrap">
                                                    {/* Internal status badge */}
                                                    <Badge
                                                        color={
                                                            sms.status === "sent"
                                                                ? "green"
                                                                : sms.status === "failed"
                                                                  ? "red"
                                                                  : sms.status === "queued"
                                                                    ? "blue"
                                                                    : "gray"
                                                        }
                                                        size="sm"
                                                    >
                                                        {t(
                                                            `admin.smsDashboard.status.${sms.status}`,
                                                        )}
                                                    </Badge>
                                                    {/* Provider status badge (only when sent) */}
                                                    {sms.status === "sent" && (
                                                        <Badge
                                                            color={
                                                                sms.providerStatus === "delivered"
                                                                    ? "green"
                                                                    : sms.providerStatus ===
                                                                        "failed"
                                                                      ? "red"
                                                                      : sms.providerStatus ===
                                                                          "not delivered"
                                                                        ? "orange"
                                                                        : "gray"
                                                            }
                                                            variant="outline"
                                                            size="sm"
                                                        >
                                                            {sms.providerStatus
                                                                ? t(
                                                                      `admin.parcelDialog.smsStatus.provider.${sms.providerStatus === "not delivered" ? "notDelivered" : sms.providerStatus}`,
                                                                  )
                                                                : t(
                                                                      "admin.parcelDialog.smsStatus.provider.awaiting",
                                                                  )}
                                                        </Badge>
                                                    )}
                                                    <Text size="sm" c="dimmed">
                                                        {t(
                                                            `admin.smsDashboard.intent.${sms.intent}`,
                                                        )}
                                                    </Text>
                                                </Group>
                                                {/* Timestamp */}
                                                <Text size="xs" c="dimmed">
                                                    {sms.sentAt
                                                        ? formatDateTime(sms.sentAt)
                                                        : formatDateTime(sms.createdAt)}
                                                </Text>
                                            </Group>
                                            {/* Provider status update time */}
                                            {sms.providerStatusUpdatedAt && (
                                                <Text size="xs" c="dimmed" ml="xs">
                                                    {t(
                                                        "admin.parcelDialog.smsStatus.deliveryStatusAt",
                                                    )}{" "}
                                                    {formatDateTime(sms.providerStatusUpdatedAt)}
                                                </Text>
                                            )}
                                        </Stack>
                                    ))}
                                </Stack>
                            </Card>
                        )}

                        {/* Actions - hide if cancelled */}
                        {!data.parcel.deletedAt && (
                            <Group justify="space-between">
                                {/* Cancel button - only show if not picked up */}
                                {!data.parcel.isPickedUp && (
                                    <Button
                                        color="red"
                                        variant="subtle"
                                        leftSection={<IconTrash size="0.9rem" />}
                                        onClick={handleDeleteParcel}
                                        loading={submitting}
                                    >
                                        {t("admin.parcelDialog.cancelParcel")}
                                    </Button>
                                )}

                                <Group ml="auto">
                                    {data.parcel.isPickedUp ? (
                                        <Button
                                            color="orange"
                                            leftSection={<IconX size="0.9rem" />}
                                            onClick={handleUndoPickup}
                                            loading={submitting}
                                        >
                                            {t("admin.parcelDialog.undoHandout")}
                                        </Button>
                                    ) : (
                                        <Button
                                            color="green"
                                            leftSection={<IconCheck size="0.9rem" />}
                                            onClick={handleMarkPickedUp}
                                            loading={submitting}
                                        >
                                            {t("admin.parcelDialog.markHandedOut")}
                                        </Button>
                                    )}
                                </Group>
                            </Group>
                        )}
                    </>
                )}
            </Stack>
        </Modal>
    );
}
