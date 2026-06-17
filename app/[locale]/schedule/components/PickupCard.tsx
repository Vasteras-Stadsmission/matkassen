"use client";

import { Paper, Text, Tooltip, ActionIcon } from "@mantine/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FoodParcel } from "@/app/[locale]/schedule/types";
import { IconCalendarTime, IconInfoCircle } from "@tabler/icons-react";
import styles from "./PickupCard.module.css";
import { useTranslations, useLocale } from "next-intl";
import { memo, useMemo } from "react";

interface PickupCardProps {
    foodParcel: FoodParcel;
    onReschedule?: (foodParcel: FoodParcel) => void;
    onOpenAdminDialog?: (parcelId: string) => void;
}

function PickupCard({ foodParcel, onReschedule, onOpenAdminDialog }: PickupCardProps) {
    const t = useTranslations("schedule");
    const locale = useLocale();
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: foodParcel.id,
        data: {
            foodParcel,
        },
    });

    // Memoize style calculation for better performance
    const style = useMemo(
        () => ({
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.5 : 1,
            willChange: "transform",
        }),
        [transform, transition, isDragging],
    );

    const statusLabel = useMemo(() => {
        if (foodParcel.isPickedUp) return t("pickedUpStatus");
        if (foodParcel.noShowAt) return t("noShowStatus");
        return t("notPickedUpStatus");
    }, [foodParcel.isPickedUp, foodParcel.noShowAt, t]);

    // Memoize time formatting
    const timeDisplay = useMemo(() => {
        const formatTime = (date: Date) => {
            return date.toLocaleTimeString("sv-SE", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            });
        };

        // Format date as weekday + date, e.g. "Måndag 2026-03-10" / "Monday 2026-03-10"
        const dateLocale = locale === "sv" ? "sv-SE" : "en-US";
        const weekday = foodParcel.pickupEarliestTime.toLocaleDateString(dateLocale, {
            weekday: "long",
        });
        const dateStr = foodParcel.pickupEarliestTime.toLocaleDateString("sv-SE", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
        const capitalizedWeekday =
            weekday.charAt(0).toLocaleUpperCase(dateLocale) + weekday.slice(1);

        return {
            earliest: formatTime(foodParcel.pickupEarliestTime),
            latest: formatTime(foodParcel.pickupLatestTime),
            date: `${capitalizedWeekday} ${dateStr}`,
        };
    }, [foodParcel.pickupEarliestTime, foodParcel.pickupLatestTime, locale]);

    // Handle click to open reschedule modal
    const handleRescheduleClick = (e: React.MouseEvent) => {
        // Stop the click from triggering the parent's drag events
        e.stopPropagation();

        // Call the parent's onReschedule function with the current food parcel
        if (onReschedule) {
            onReschedule(foodParcel);
        }
    };

    // Handle click to open admin dialog
    const handleAdminDialogClick = (e: React.MouseEvent) => {
        // Stop the click from triggering the parent's drag events
        e.stopPropagation();

        // Call the parent's onOpenAdminDialog function with the current parcel ID
        if (onOpenAdminDialog) {
            onOpenAdminDialog(foodParcel.id);
        }
    };

    const tooltipContent = (
        <div>
            <Text fw={600}>{foodParcel.householdName}</Text>
            <Text size="sm">{timeDisplay.date}</Text>
            <Text size="sm">
                {t("pickupTimeLabel")}: {timeDisplay.earliest} - {timeDisplay.latest}
            </Text>
            <Text size="sm">
                {t("statusLabel")}: {statusLabel}
            </Text>
            {foodParcel.primaryPickupLocationName && (
                <Text size="sm">
                    {t("primaryLocationLabel")}: {foodParcel.primaryPickupLocationName}
                </Text>
            )}
            {foodParcel.createdBy && (
                <Text size="sm">
                    {t("createdByLabel")}: {foodParcel.createdByName ?? foodParcel.createdBy}
                </Text>
            )}
        </div>
    );

    return (
        <Tooltip
            label={tooltipContent}
            withArrow
            multiline
            withinPortal
            position="top"
            disabled={isDragging}
        >
            <Paper
                ref={setNodeRef}
                style={{
                    ...style,
                    cursor: "grab",
                    position: "relative",
                }}
                {...attributes}
                {...listeners}
                px="xs"
                py={2}
                radius="sm"
                withBorder
                bg="gray.0"
                shadow="xs"
                className={styles["pickup-card-compact"]}
                data-dragging={isDragging}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        paddingRight: onOpenAdminDialog
                            ? onReschedule
                                ? 36
                                : 18
                            : onReschedule
                              ? 18
                              : 0,
                    }}
                >
                    {foodParcel.noShowAt && (
                        <span
                            aria-label={statusLabel}
                            title={statusLabel}
                            style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                backgroundColor: "var(--mantine-color-orange-6)",
                                flexShrink: 0,
                            }}
                        />
                    )}
                    <Text size="xs" truncate fw={500} style={{ minWidth: 0 }}>
                        {foodParcel.householdName}
                    </Text>
                </div>

                {/* Add admin info button */}
                {onOpenAdminDialog && (
                    <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="blue"
                        onClick={handleAdminDialogClick}
                        style={{
                            position: "absolute",
                            top: "50%",
                            right: onReschedule ? "20px" : "4px", // Adjust position if reschedule button is present
                            transform: "translateY(-50%)",
                            opacity: 0, // Hidden by default
                            transition: "opacity 0.2s",
                        }}
                        className={styles["admin-button"]}
                        title={t("viewParcelDetails")}
                    >
                        <IconInfoCircle size="0.8rem" />
                    </ActionIcon>
                )}

                {/* Add reschedule button */}
                {onReschedule && (
                    <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="blue"
                        onClick={handleRescheduleClick}
                        style={{
                            position: "absolute",
                            top: "50%",
                            right: "4px",
                            transform: "translateY(-50%)",
                            opacity: 0, // Hidden by default
                            transition: "opacity 0.2s",
                        }}
                        className={styles["reschedule-button"]}
                        title={t("reschedule.outsideWeek")}
                    >
                        <IconCalendarTime size="0.8rem" />
                    </ActionIcon>
                )}
            </Paper>
        </Tooltip>
    );
}

// Wrap with memo to prevent unnecessary re-renders during drag operations
export default memo(PickupCard);
