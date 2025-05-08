"use client";

import { Paper, Stack, Tooltip } from "@mantine/core";
import { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { FoodParcel } from "@/app/[locale]/schedule/actions";
import { isPastTimeSlot } from "@/app/utils/date-utils";
import PickupCard from "./PickupCard";

interface TimeSlotCellProps {
    date: Date;
    time: string;
    parcels: (
        | FoodParcel
        | {
              element: ReactNode;
              id: string;
              [key: string]: unknown;
          }
    )[];
    maxParcelsPerSlot: number;
    isOverCapacity?: boolean;
    dayIndex?: number;
    isUnavailable?: boolean;
    unavailableReason?: string;
}

export default function TimeSlotCell({
    date,
    time,
    parcels,
    maxParcelsPerSlot,
    isOverCapacity = false,
    dayIndex = 0, // Default to 0 for backward compatibility
    isUnavailable = false,
    unavailableReason,
}: TimeSlotCellProps) {
    // Check if the time slot is in the past using our timezone-aware utility
    const isPast = isPastTimeSlot(date, time);

    // Setup droppable container with day index included
    const { setNodeRef, isOver } = useDroppable({
        id: `day-${dayIndex}-${date.toISOString().split("T")[0]}-${time}`,
        disabled: isPast || isUnavailable, // Disable dropping on past or unavailable time slots
    });

    // Determine background color based on capacity, hover state, and availability status
    const getBgColor = () => {
        if (isPast || isUnavailable) return "gray.2"; // Grey out past or unavailable time slots
        if (isOver) return "blue.0";
        if (isOverCapacity) return "red.0";
        if (parcels.length >= maxParcelsPerSlot * 0.75) return "yellow.0";
        return "white";
    };

    // Create the cell content
    const cellContent = (
        <Paper
            ref={setNodeRef}
            p={4}
            radius="sm"
            withBorder
            bg={getBgColor()}
            style={{
                height: "100%",
                transition: "background-color 0.2s",
                position: "relative",
                minHeight: 40,
                opacity: isPast || isUnavailable ? 0.7 : 1, // Reduce opacity for past or unavailable time slots
                cursor: isPast || isUnavailable ? "not-allowed" : "default", // Change cursor for unavailable time slots
                backgroundImage: isUnavailable
                    ? "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.05) 5px, rgba(0,0,0,0.05) 10px)"
                    : "none", // Add subtle pattern for unavailable slots
            }}
        >
            {/* Parcels stack */}
            <Stack gap={4}>
                {parcels.map(parcel =>
                    "element" in parcel ? (
                        <div key={parcel.id}>{parcel.element}</div>
                    ) : (
                        <PickupCard key={parcel.id} foodParcel={parcel} isCompact={true} />
                    ),
                )}
            </Stack>
        </Paper>
    );

    // If the slot is unavailable and we have a reason, wrap it in a tooltip
    if (isUnavailable && unavailableReason) {
        return (
            <Tooltip label={unavailableReason} position="top" withArrow>
                {cellContent}
            </Tooltip>
        );
    }

    return cellContent;
}
