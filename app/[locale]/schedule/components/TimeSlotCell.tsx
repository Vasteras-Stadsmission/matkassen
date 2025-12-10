"use client";

import { Paper, Stack, Tooltip } from "@mantine/core";
import { ReactNode, memo, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { FoodParcel } from "@/app/[locale]/schedule/types";
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
    /** Maximum parcels per slot. null = no limit */
    maxParcelsPerSlot: number | null;
    isOverCapacity?: boolean;
    dayIndex?: number;
    isUnavailable?: boolean;
    unavailableReason?: string;
    onOpenAdminDialog?: (parcelId: string) => void;
}

function TimeSlotCell({
    date,
    time,
    parcels,
    maxParcelsPerSlot,
    isOverCapacity = false,
    dayIndex = 0,
    isUnavailable = false,
    unavailableReason,
    onOpenAdminDialog,
}: TimeSlotCellProps) {
    // Memoize calculations for better performance
    const isPast = useMemo(() => isPastTimeSlot(date, time), [date, time]);

    const droppableId = useMemo(
        () => `day-${dayIndex}-${date.toISOString().split("T")[0]}-${time}`,
        [dayIndex, date, time],
    );

    // Setup droppable container with day index included
    const { setNodeRef, isOver } = useDroppable({
        id: droppableId,
        disabled: isPast || isUnavailable, // Disable dropping on past or unavailable time slots
    });

    // Memoize background color calculation - simplified for better performance
    const bgColor = useMemo(() => {
        if (isPast || isUnavailable) return "gray.2";
        if (isOver) return "blue.1"; // Slightly more noticeable drop zone
        if (isOverCapacity) return "red.0";
        // null = no limit, so never show approaching-capacity warning
        if (maxParcelsPerSlot !== null && parcels.length >= maxParcelsPerSlot * 0.75)
            return "yellow.0";
        return "white";
    }, [isPast, isUnavailable, isOver, isOverCapacity, parcels.length, maxParcelsPerSlot]);

    // Create the cell content
    const cellContent = (
        <Paper
            ref={setNodeRef}
            p={4}
            radius="sm"
            withBorder
            bg={bgColor}
            style={{
                height: "100%",
                transition: isOver ? "none" : "background-color 0.1s ease", // Faster transition, disabled during drag
                position: "relative",
                minHeight: 40,
                opacity: isPast || isUnavailable ? 0.7 : 1,
                cursor: isPast || isUnavailable ? "not-allowed" : "default",
                backgroundImage: isUnavailable
                    ? "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.05) 5px, rgba(0,0,0,0.05) 10px)"
                    : "none",
                willChange: "background-color", // Optimize for color changes during drag
                // Use transform3d for hardware acceleration
                transform: "translate3d(0, 0, 0)",
            }}
        >
            {/* Parcels stack */}
            <Stack gap={4}>
                {parcels.map(parcel =>
                    "element" in parcel ? (
                        <div key={parcel.id}>{parcel.element}</div>
                    ) : (
                        <PickupCard
                            key={parcel.id}
                            foodParcel={parcel}
                            isCompact={true}
                            onOpenAdminDialog={onOpenAdminDialog}
                        />
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

// Wrap with memo to prevent unnecessary re-renders during drag operations
export default memo(TimeSlotCell);
