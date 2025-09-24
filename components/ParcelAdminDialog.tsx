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
    Divider,
    Loader,
    Alert,
    Textarea,
    Anchor,
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
    IconEdit,
    IconExternalLink,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { ParcelDetails } from "@/app/api/admin/parcel/[parcelId]/details/route";

interface ParcelAdminDialogProps {
    parcelId: string | null;
    opened: boolean;
    onClose: () => void;
    onParcelUpdated?: () => void;
}

interface ParcelDialogState {
    loading: boolean;
    error: string | null;
    data: ParcelDetails | null;
    submitting: boolean;
    newComment: string;
}

export function ParcelAdminDialog({
    parcelId,
    opened,
    onClose,
    onParcelUpdated,
}: ParcelAdminDialogProps) {
    const t = useTranslations();
    const [state, setState] = useState<ParcelDialogState>({
        loading: false,
        error: null,
        data: null,
        submitting: false,
        newComment: "",
    });

    const fetchParcelDetails = useCallback(async () => {
        if (!parcelId) return;

        setState(prev => ({ ...prev, loading: true, error: null }));

        try {
            const response = await fetch(`/api/admin/parcel/${parcelId}/details`);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            const data = await response.json();
            setState(prev => ({ ...prev, data, loading: false }));
        } catch (error) {
            setState(prev => ({
                ...prev,
                loading: false,
                error:
                    error instanceof Error && error.message.includes("not found")
                        ? t("admin.parcelDialog.errors.parcelNotFound")
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
            onParcelUpdated?.();
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
            onParcelUpdated?.();
        } catch {
            setState(prev => ({
                ...prev,
                error: t("admin.parcelDialog.errors.undoPickupFailed"),
            }));
        } finally {
            setState(prev => ({ ...prev, submitting: false }));
        }
    };

    const handleAddComment = async () => {
        if (!parcelId || !state.newComment.trim()) return;

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
                        comment: state.newComment.trim(),
                    }),
                },
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            // Clear comment and refresh data
            setState(prev => ({ ...prev, newComment: "" }));
            await fetchParcelDetails();
        } catch {
            setState(prev => ({
                ...prev,
                error: t("admin.parcelDialog.errors.addCommentFailed"),
            }));
        } finally {
            setState(prev => ({ ...prev, submitting: false }));
        }
    };

    const formatDateTime = (dateTimeString: string) => {
        const date = new Date(dateTimeString);
        return date.toLocaleString();
    };

    const formatDate = (dateTimeString: string) => {
        const date = new Date(dateTimeString);
        return date.toLocaleDateString();
    };

    const formatTime = (dateTimeString: string) => {
        const date = new Date(dateTimeString);
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    const handleClose = () => {
        setState(prev => ({ ...prev, newComment: "", error: null }));
        onClose();
    };

    const { loading, error, data, submitting, newComment } = state;

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title={
                <Group gap="sm">
                    <IconInfoCircle size="1.2rem" />
                    <Text fw={600}>
                        {t("admin.parcelDialog.title")} {parcelId ? `#${parcelId}` : ""}
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
                        <Card withBorder>
                            <Group justify="space-between" align="flex-start">
                                <Stack gap="xs">
                                    <Group gap="sm">
                                        <IconCalendar size="1rem" />
                                        <Text fw={500}>
                                            {t("admin.parcelDialog.pickupSchedule")}
                                        </Text>
                                    </Group>
                                    <Text size="sm" c="dimmed">
                                        {formatDate(data.parcel.pickupDateTimeEarliest)}
                                    </Text>
                                    <Text size="sm">
                                        {formatTime(data.parcel.pickupDateTimeEarliest)} -{" "}
                                        {formatTime(data.parcel.pickupDateTimeLatest)}
                                    </Text>
                                    <Group gap="xs">
                                        <IconMapPin size="0.9rem" />
                                        <Text size="sm">{data.parcel.pickupLocationName}</Text>
                                    </Group>
                                    <Text size="xs" c="dimmed">
                                        {data.parcel.pickupLocationAddress}
                                    </Text>
                                </Stack>

                                <Stack gap="xs" align="flex-end">
                                    <Badge
                                        color={data.parcel.isPickedUp ? "green" : "gray"}
                                        variant={data.parcel.isPickedUp ? "filled" : "outline"}
                                    >
                                        {data.parcel.isPickedUp
                                            ? t("admin.parcelDialog.pickedUp")
                                            : t("admin.parcelDialog.notPickedUp")}
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
                                </Stack>
                            </Group>
                        </Card>

                        {/* Household Details */}
                        <Card withBorder>
                            <Stack gap="md">
                                <Group justify="space-between">
                                    <Text fw={500}>{t("admin.parcelDialog.householdDetails")}</Text>
                                    <Anchor
                                        href={`/households?household-id=${data.household.id}`}
                                        target="_blank"
                                        size="sm"
                                    >
                                        <Group gap="xs">
                                            <Text>{t("admin.parcelDialog.viewDetails")}</Text>
                                            <IconExternalLink size="0.9rem" />
                                        </Group>
                                    </Anchor>
                                </Group>

                                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                                    <Stack gap="xs">
                                        <Text size="sm" fw={500}>
                                            {t("admin.parcelDialog.contactInfo")}
                                        </Text>
                                        <Group gap="xs">
                                            <Text fw={500}>
                                                {data.household.firstName} {data.household.lastName}
                                            </Text>
                                        </Group>
                                        <Group gap="xs">
                                            <IconPhone size="0.9rem" />
                                            <Text size="sm">{data.household.phoneNumber}</Text>
                                        </Group>
                                        <Text size="sm" c="dimmed">
                                            {t("admin.parcelDialog.postalCode")}:{" "}
                                            {data.household.postalCode}
                                        </Text>
                                        <Text size="sm" c="dimmed">
                                            {t("admin.parcelDialog.language")}:{" "}
                                            {data.household.locale.toUpperCase()}
                                        </Text>
                                    </Stack>

                                    <Stack gap="xs">
                                        <Text size="sm" fw={500}>
                                            {t("admin.parcelDialog.householdComposition")}
                                        </Text>
                                        <Text size="sm">
                                            {t("admin.parcelDialog.members", {
                                                count: data.household.members.length,
                                            })}
                                        </Text>
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
                            <Stack gap="md">
                                <Text fw={500}>{t("admin.parcelDialog.comments")}</Text>

                                {/* Existing Comments */}
                                {data.comments.length > 0 ? (
                                    <Stack gap="sm">
                                        {data.comments.map(comment => (
                                            <Card key={comment.id} withBorder radius="sm">
                                                <Stack gap="xs">
                                                    <Group justify="space-between">
                                                        <Text size="sm" fw={500}>
                                                            {comment.author}
                                                        </Text>
                                                        <Text size="xs" c="dimmed">
                                                            {formatDateTime(comment.createdAt)}
                                                        </Text>
                                                    </Group>
                                                    <Text size="sm">{comment.comment}</Text>
                                                </Stack>
                                            </Card>
                                        ))}
                                    </Stack>
                                ) : (
                                    <Text size="sm" c="dimmed" ta="center" py="md">
                                        {t("admin.parcelDialog.noComments")}
                                    </Text>
                                )}

                                {/* Add Comment */}
                                <Divider />
                                <Stack gap="sm">
                                    <Textarea
                                        placeholder={t("admin.parcelDialog.addCommentPlaceholder")}
                                        value={newComment}
                                        onChange={event =>
                                            setState(prev => ({
                                                ...prev,
                                                newComment: event.currentTarget.value,
                                            }))
                                        }
                                        minRows={3}
                                        disabled={submitting}
                                    />
                                    <Group justify="flex-end">
                                        <Button
                                            leftSection={<IconEdit size="0.9rem" />}
                                            onClick={handleAddComment}
                                            disabled={!newComment.trim() || submitting}
                                            loading={submitting}
                                            size="sm"
                                        >
                                            {t("admin.parcelDialog.addComment")}
                                        </Button>
                                    </Group>
                                </Stack>
                            </Stack>
                        </Card>

                        {/* Actions */}
                        <Group justify="flex-end">
                            <Group>
                                {data.parcel.isPickedUp ? (
                                    <Button
                                        color="orange"
                                        leftSection={<IconX size="0.9rem" />}
                                        onClick={handleUndoPickup}
                                        loading={submitting}
                                    >
                                        {t("admin.parcelDialog.undoPickup")}
                                    </Button>
                                ) : (
                                    <Button
                                        color="green"
                                        leftSection={<IconCheck size="0.9rem" />}
                                        onClick={handleMarkPickedUp}
                                        loading={submitting}
                                    >
                                        {t("admin.parcelDialog.markPickedUp")}
                                    </Button>
                                )}
                            </Group>
                        </Group>
                    </>
                )}
            </Stack>
        </Modal>
    );
}
