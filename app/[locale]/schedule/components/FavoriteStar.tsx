"use client";

import { useState } from "react";
import { ActionIcon, Tooltip, Modal, Button, Stack, Text } from "@mantine/core";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useDisclosure } from "@mantine/hooks";
import { useTranslations } from "next-intl";
import { getUserFavoriteLocation, setUserFavoriteLocation } from "../utils/user-preferences";
import type { TranslationFunction } from "../../types";

interface FavoriteStarProps {
    locationId: string;
    locationName: string;
    isFavorite: boolean;
    onFavoriteChange?: (isFavorite: boolean) => void;
    size?: number;
    tooltipPosition?: "top" | "bottom" | "left" | "right";
}

export function FavoriteStar({
    locationId,
    locationName,
    isFavorite,
    onFavoriteChange,
    size = 20,
    tooltipPosition = "top",
}: FavoriteStarProps) {
    const t = useTranslations("schedule") as TranslationFunction;
    const [isLoading, setIsLoading] = useState(false);
    const [confirmModalOpened, { open: openConfirmModal, close: closeConfirmModal }] =
        useDisclosure(false);
    const [confirmationData, setConfirmationData] = useState<{
        title: string;
        message: string;
        action: () => Promise<void>;
        confirmLabel: string;
        confirmColor?: string;
    } | null>(null);

    const handleStarClick = async () => {
        if (isLoading) return;

        try {
            // Get current favorite to determine the action
            const currentFavoriteId = await getUserFavoriteLocation();

            if (isFavorite) {
                // Remove favorite
                setConfirmationData({
                    title: t("hub.confirmRemoveFavorite", { location: locationName }),
                    message: t("hub.favoriteExplanation"),
                    confirmLabel: t("hub.confirmRemoveFavoriteLabel"),
                    confirmColor: "red",
                    action: async () => {
                        const success = await setUserFavoriteLocation(null);
                        if (success) {
                            notifications.show({
                                title: t("hub.notificationSuccessTitle"),
                                message: t("hub.favoriteRemoved", { location: locationName }),
                                color: "green",
                            });
                            onFavoriteChange?.(false);
                        } else {
                            notifications.show({
                                title: t("hub.notificationErrorTitle"),
                                message: t("hub.favoriteUpdateFailed"),
                                color: "red",
                            });
                        }
                    },
                });
            } else if (currentFavoriteId && currentFavoriteId !== locationId) {
                // Change favorite from one location to another
                setConfirmationData({
                    title: t("hub.confirmChangeFavorite", {
                        oldLocation: t("hub.currentFavoriteLabel"),
                        newLocation: locationName,
                    }),
                    message: t("hub.favoriteExplanation"),
                    confirmLabel: t("hub.confirmChangeFavoriteLabel"),
                    action: async () => {
                        const success = await setUserFavoriteLocation(locationId);
                        if (success) {
                            notifications.show({
                                title: t("hub.notificationSuccessTitle"),
                                message: t("hub.favoriteChanged", { location: locationName }),
                                color: "green",
                            });
                            onFavoriteChange?.(true);
                        } else {
                            notifications.show({
                                title: t("hub.notificationErrorTitle"),
                                message: t("hub.favoriteUpdateFailed"),
                                color: "red",
                            });
                        }
                    },
                });
            } else {
                // Set first favorite
                setConfirmationData({
                    title: t("hub.confirmSetFavorite", { location: locationName }),
                    message: t("hub.favoriteExplanation"),
                    confirmLabel: t("hub.setAsFavorite"),
                    action: async () => {
                        const success = await setUserFavoriteLocation(locationId);
                        if (success) {
                            notifications.show({
                                title: t("hub.notificationSuccessTitle"),
                                message: t("hub.favoriteSet", { location: locationName }),
                                color: "green",
                            });
                            onFavoriteChange?.(true);
                        } else {
                            notifications.show({
                                title: t("hub.notificationErrorTitle"),
                                message: t("hub.favoriteUpdateFailed"),
                                color: "red",
                            });
                        }
                    },
                });
            }

            openConfirmModal();
        } catch (error) {
            console.error("Error handling favorite star click:", error);
            notifications.show({
                title: t("hub.notificationErrorTitle"),
                message: t("hub.favoriteUpdateFailed"),
                color: "red",
            });
        }
    };

    const handleConfirm = async () => {
        if (!confirmationData) return;

        setIsLoading(true);
        closeConfirmModal();

        try {
            await confirmationData.action();
        } catch (error) {
            console.error("Error executing favorite action:", error);
            notifications.show({
                title: t("hub.notificationErrorTitle"),
                message: t("hub.favoriteUpdateFailed"),
                color: "red",
            });
        } finally {
            setIsLoading(false);
            setConfirmationData(null);
        }
    };

    const handleCancel = () => {
        closeConfirmModal();
        setConfirmationData(null);
    };

    const tooltipLabel = isFavorite
        ? t("hub.tooltipRemoveFavorite", { location: locationName })
        : t("hub.tooltipSetFavorite", { location: locationName });

    return (
        <>
            <Tooltip label={tooltipLabel} position={tooltipPosition}>
                <ActionIcon
                    variant="subtle"
                    size={size + 4}
                    onClick={handleStarClick}
                    loading={isLoading}
                    color={isFavorite ? "yellow" : "gray"}
                    aria-label={tooltipLabel}
                >
                    {isFavorite ? <IconStarFilled size={size} /> : <IconStar size={size} />}
                </ActionIcon>
            </Tooltip>

            <Modal
                opened={confirmModalOpened}
                onClose={handleCancel}
                title={confirmationData?.title}
                centered
            >
                <Stack gap="md">
                    <Text size="sm">{confirmationData?.message}</Text>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        <Button variant="subtle" onClick={handleCancel}>
                            {t("hub.cancelButton")}
                        </Button>
                        <Button
                            color={confirmationData?.confirmColor || "blue"}
                            onClick={handleConfirm}
                        >
                            {confirmationData?.confirmLabel}
                        </Button>
                    </div>
                </Stack>
            </Modal>
        </>
    );
}
