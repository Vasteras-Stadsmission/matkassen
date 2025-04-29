"use client";

import { Paper, Text, Tooltip } from "@mantine/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FoodParcel } from "@/app/schedule/actions";

interface PickupCardProps {
    foodParcel: FoodParcel;
    isCompact?: boolean;
}

export default function PickupCard({ foodParcel, isCompact = false }: PickupCardProps) {
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
                    }}
                    {...attributes}
                    {...listeners}
                    px="xs"
                    py={2}
                    radius="sm"
                    withBorder
                    bg="gray.0"
                    shadow="xs"
                    className="pickup-card-compact"
                >
                    <Text size="xs" truncate fw={500}>
                        {foodParcel.householdName}
                    </Text>
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
                }}
                {...attributes}
                {...listeners}
                p="xs"
                radius="sm"
                withBorder
                bg="white"
                shadow="xs"
                className="pickup-card"
                onClick={() => {}} // Add hover style with CSS instead
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
            </Paper>
        </Tooltip>
    );
}
