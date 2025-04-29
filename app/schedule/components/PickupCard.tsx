"use client";

import { Paper, Text, Tooltip, ActionIcon } from "@mantine/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FoodParcel } from "@/app/schedule/actions";
import { IconCalendarTime } from "@tabler/icons-react";
import styles from "./PickupCard.module.css"; // Import the CSS module

interface PickupCardProps {
    foodParcel: FoodParcel;
    isCompact?: boolean;
    onReschedule?: (foodParcel: FoodParcel) => void;
}

export default function PickupCard({
    foodParcel,
    isCompact = false,
    onReschedule,
}: PickupCardProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: foodParcel.id,
        data: {
            foodParcel,
        },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    // Determine color for the status dot
    const getStatusColor = () => {
        if (foodParcel.isPickedUp) return "green.6";

        const now = new Date();
        const isInPast = foodParcel.pickupLatestTime < now;
        return isInPast ? "red.6" : "primary";
    };

    // Format time for display
    const formatTime = (date: Date) => {
        return date.toLocaleTimeString("sv-SE", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    // Handle click to open reschedule modal
    const handleRescheduleClick = (e: React.MouseEvent) => {
        // Stop the click from triggering the parent's drag events
        e.stopPropagation();

        // Call the parent's onReschedule function with the current food parcel
        if (onReschedule) {
            onReschedule(foodParcel);
        }
    };

    const tooltipContent = (
        <div>
            <Text fw={600}>{foodParcel.householdName}</Text>
            <Text size="sm">
                Tid: {formatTime(foodParcel.pickupEarliestTime)} -{" "}
                {formatTime(foodParcel.pickupLatestTime)}
            </Text>
            <Text size="sm">Status: {foodParcel.isPickedUp ? "Uthämtad" : "Ej uthämtad"}</Text>
        </div>
    );

    if (isCompact) {
        return (
            <Tooltip label={tooltipContent} withArrow multiline withinPortal position="top">
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
                >
                    <Text size="xs" truncate fw={500}>
                        {foodParcel.householdName}
                    </Text>

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
                            title="Schemalägg utanför vecka"
                        >
                            <IconCalendarTime size="0.8rem" />
                        </ActionIcon>
                    )}
                </Paper>
            </Tooltip>
        );
    }

    return (
        <Tooltip label={tooltipContent} withArrow multiline withinPortal position="top">
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
                            backgroundColor: `var(--mantine-color-${getStatusColor()})`,
                        }}
                    />
                </div>

                <Text size="xs" c="dimmed">
                    {formatTime(foodParcel.pickupEarliestTime)}
                </Text>

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
                        title="Schemalägg utanför vecka"
                    >
                        <IconCalendarTime size="0.8rem" />
                    </ActionIcon>
                )}
            </Paper>
        </Tooltip>
    );
}
