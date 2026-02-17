"use client";

import { Paper, Text, Tooltip, ActionIcon } from "@mantine/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FoodParcel } from "@/app/[locale]/schedule/types";
import { IconCalendarTime, IconInfoCircle } from "@tabler/icons-react";
import styles from "./PickupCard.module.css"; // Import the CSS module
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";

interface PickupCardProps {
    foodParcel: FoodParcel;
    isCompact?: boolean;
    onReschedule?: (foodParcel: FoodParcel) => void;
    onOpenAdminDialog?: (parcelId: string) => void;
}

function PickupCard({
    foodParcel,
    isCompact = false,
    onReschedule,
    onOpenAdminDialog,
}: PickupCardProps) {
    const t = useTranslations("schedule");
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

    // Memoize color calculation
    const statusColor = useMemo(() => {
        if (foodParcel.isPickedUp) return "green.6";

        const now = new Date();
        const isInPast = foodParcel.pickupLatestTime < now;
        return isInPast ? "red.6" : "primary";
    }, [foodParcel.isPickedUp, foodParcel.pickupLatestTime]);

    // Memoize time formatting
    const timeDisplay = useMemo(() => {
        const formatTime = (date: Date) => {
            return date.toLocaleTimeString("sv-SE", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            });
        };

        return {
            earliest: formatTime(foodParcel.pickupEarliestTime),
            latest: formatTime(foodParcel.pickupLatestTime),
        };
    }, [foodParcel.pickupEarliestTime, foodParcel.pickupLatestTime]);

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
            <Text size="sm">
                {t("pickupTimeLabel")}: {timeDisplay.earliest} - {timeDisplay.latest}
            </Text>
            <Text size="sm">
                {t("statusLabel")}:{" "}
                {foodParcel.isPickedUp ? t("pickedUpStatus") : t("notPickedUpStatus")}
            </Text>
            {foodParcel.primaryPickupLocationName && (
                <Text size="sm">
                    {t("primaryLocationLabel")}: {foodParcel.primaryPickupLocationName}
                </Text>
            )}
            {foodParcel.createdBy && (
                <Text size="sm">
                    {t("createdByLabel")}: {foodParcel.createdBy}
                </Text>
            )}
        </div>
    );

    if (isCompact) {
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
                        "cursor": "grab",
                        "&:hover": { backgroundColor: "var(--mantine-color-blue-0)" },
                        "position": "relative",
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
                    <Text size="xs" truncate fw={500}>
                        {foodParcel.householdName}
                    </Text>

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
                            title="View household details"
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
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    position: "relative",
                }}
                {...attributes}
                {...listeners}
                p="xs"
                radius="sm"
                withBorder
                bg="white"
                shadow="xs"
                className={styles["pickup-card"]}
                data-dragging={isDragging}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <Text size="sm" fw={500} truncate style={{ flex: 1 }}>
                        {foodParcel.householdName}
                    </Text>

                    <div
                        style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            backgroundColor: `var(--mantine-color-${statusColor})`,
                        }}
                    />
                </div>

                <Text size="xs" c="dimmed">
                    {timeDisplay.earliest}
                </Text>

                {/* Add admin info button */}
                {onOpenAdminDialog && (
                    <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="blue"
                        onClick={handleAdminDialogClick}
                        style={{
                            position: "absolute",
                            top: "4px",
                            right: onReschedule ? "20px" : "4px", // Adjust position if reschedule button is present
                            opacity: 0, // Hidden by default
                            transition: "opacity 0.2s",
                        }}
                        className={styles["admin-button"]}
                        title="View household details"
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
                            top: "4px",
                            right: "4px",
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
