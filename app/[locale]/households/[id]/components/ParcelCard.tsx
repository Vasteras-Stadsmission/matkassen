"use client";

import { Paper, Group, Stack, Box, Text, ThemeIcon, Badge } from "@mantine/core";
import { IconCalendarEvent, IconClock } from "@tabler/icons-react";
import classes from "./ParcelCard.module.css";

export interface ParcelCardData {
    id: string;
    pickupDate: Date | string;
    pickupEarliestTime: Date | string;
    pickupLatestTime: Date | string;
    isPickedUp?: boolean | null;
    noShowAt?: Date | string | null;
    deletedAt?: Date | string | null;
    deletedBy?: string | null;
}

interface ParcelCardProps {
    parcel: ParcelCardData;
    onClick?: () => void;
    status: "upcoming" | "pickedUp" | "notPickedUp" | "noShow" | "cancelled";
    statusLabel: string;
    getWeekdayName: (date: Date | string) => string;
    formatDate: (date: Date | string | null | undefined) => string;
    formatTime: (date: Date | string | null | undefined) => string;
    deletedLabel?: string;
    byLabel?: string;
}

export function ParcelCard({
    parcel,
    onClick,
    status,
    statusLabel,
    getWeekdayName,
    formatDate,
    formatTime,
    deletedLabel,
    byLabel,
}: ParcelCardProps) {
    const isPast = status === "notPickedUp" || status === "noShow";
    const isCancelled = status === "cancelled";

    const getStatusColor = () => {
        switch (status) {
            case "pickedUp":
                return "green";
            case "noShow":
                return "orange";
            case "notPickedUp":
                return "red";
            case "cancelled":
                return "gray";
            default:
                return "blue";
        }
    };

    const getIconColor = () => {
        if (isCancelled) return "gray";
        if (status === "noShow") return "orange";
        if (isPast) return "red";
        return "indigo";
    };

    return (
        <Paper
            withBorder
            p="md"
            radius="md"
            className={`${classes.card} ${onClick ? classes.clickable : ""} ${isCancelled ? classes.cancelled : ""}`}
            bg={isCancelled ? "gray.0" : isPast ? "red.0" : "white"}
            onClick={onClick}
        >
            <Group justify="space-between" wrap="nowrap">
                <Stack gap="xs" style={{ flex: 1 }}>
                    <Group gap="xs">
                        <ThemeIcon size="md" variant="light" color={getIconColor()}>
                            <IconCalendarEvent size={16} />
                        </ThemeIcon>
                        <Box>
                            <Text fw={600} size="sm" c={isCancelled ? "dimmed" : undefined}>
                                {getWeekdayName(parcel.pickupDate)}
                            </Text>
                            <Text size="sm" c="dimmed">
                                {formatDate(parcel.pickupDate)}
                            </Text>
                        </Box>
                    </Group>
                    <Group gap="xs">
                        <ThemeIcon size="md" variant="light" color={getIconColor()}>
                            <IconClock size={16} />
                        </ThemeIcon>
                        <Text size="sm" fw={500} c={isCancelled ? "dimmed" : undefined}>
                            {formatTime(parcel.pickupEarliestTime)} –{" "}
                            {formatTime(parcel.pickupLatestTime)}
                        </Text>
                    </Group>
                    {isCancelled && parcel.deletedAt && deletedLabel && (
                        <Text size="xs" c="dimmed" fs="italic">
                            {deletedLabel} {formatDate(parcel.deletedAt)}
                            {parcel.deletedBy && byLabel && ` ${byLabel} @${parcel.deletedBy}`}
                        </Text>
                    )}
                </Stack>

                <Badge size="lg" variant="light" color={getStatusColor()}>
                    {statusLabel}
                </Badge>
            </Group>
        </Paper>
    );
}
