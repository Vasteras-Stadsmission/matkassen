"use client";

import { Stack, Text } from "@mantine/core";
import { ParcelCard, type ParcelCardData } from "./ParcelCard";

interface ParcelListProps {
    parcels: ParcelCardData[];
    onParcelClick?: (parcelId: string) => void;
    emptyMessage: string;
    getWeekdayName: (date: Date | string) => string;
    formatDate: (date: Date | string | null | undefined) => string;
    formatTime: (date: Date | string | null | undefined) => string;
    isDateInPast: (date: Date | string) => boolean;
    statusLabels: {
        pickedUp: string;
        notPickedUp: string;
        noShow: string;
        upcoming: string;
        cancelled: string;
    };
    deletedLabel?: string;
    byLabel?: string;
}

export function ParcelList({
    parcels,
    onParcelClick,
    emptyMessage,
    getWeekdayName,
    formatDate,
    formatTime,
    isDateInPast,
    statusLabels,
    deletedLabel,
    byLabel,
}: ParcelListProps) {
    if (parcels.length === 0) {
        return (
            <Text c="dimmed" size="sm">
                {emptyMessage}
            </Text>
        );
    }

    return (
        <Stack gap="sm">
            {parcels.map(parcel => {
                const isPast = isDateInPast(parcel.pickupDate);
                const isPickedUp = Boolean(parcel.isPickedUp);
                const isNoShow = Boolean(parcel.noShowAt);
                const isCancelled = Boolean(parcel.deletedAt);

                let status: "upcoming" | "pickedUp" | "notPickedUp" | "noShow" | "cancelled";
                if (isCancelled) {
                    status = "cancelled";
                } else if (isPickedUp) {
                    status = "pickedUp";
                } else if (isNoShow) {
                    status = "noShow";
                } else if (isPast) {
                    status = "notPickedUp";
                } else {
                    status = "upcoming";
                }

                return (
                    <ParcelCard
                        key={parcel.id}
                        parcel={parcel}
                        onClick={onParcelClick ? () => onParcelClick(parcel.id) : undefined}
                        status={status}
                        statusLabel={statusLabels[status]}
                        getWeekdayName={getWeekdayName}
                        formatDate={formatDate}
                        formatTime={formatTime}
                        deletedLabel={deletedLabel}
                        byLabel={byLabel}
                    />
                );
            })}
        </Stack>
    );
}
