"use client";

import { useState, useEffect } from "react";
import { useRouter } from "@/app/i18n/navigation";
import { useTranslations } from "next-intl";
import { Group, Text, Button, Badge } from "@mantine/core";
import { IconMapPin, IconArrowLeft } from "@tabler/icons-react";
import type { PickupLocation } from "../types";
import type { TranslationFunction } from "../../types";
import { getUserFavoriteLocation } from "../utils/user-preferences";
import { FavoriteStar } from "./FavoriteStar";

interface LocationHeaderProps {
    currentLocation: PickupLocation;
    todayStats?: {
        totalParcels: number;
        completedParcels: number;
    };
}

export function LocationHeader({ currentLocation, todayStats }: LocationHeaderProps) {
    const router = useRouter();
    const t = useTranslations("schedule") as TranslationFunction;
    const [isFavorite, setIsFavorite] = useState(false);

    // Check if current location is favorite
    useEffect(() => {
        async function checkFavorite() {
            const result = await getUserFavoriteLocation();
            if (result.success) {
                setIsFavorite(result.data === currentLocation.id);
            } else {
                console.error("Failed to determine favorite location:", result.error.message);
                setIsFavorite(false);
            }
        }
        checkFavorite();
    }, [currentLocation.id]);

    const handleFavoriteChange = (newIsFavorite: boolean) => {
        setIsFavorite(newIsFavorite);
    };

    const handleBackToHub = () => {
        router.push("/schedule");
    };

    // Note that several components are there twice with different visibility based on screen size
    // to allow for better responsive design (e.g. hiding text on small screens)
    return (
        <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
            <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                <Button
                    variant="subtle"
                    size="xs"
                    leftSection={<IconArrowLeft size={14} />}
                    onClick={handleBackToHub}
                    hiddenFrom="sm"
                >
                    {t("location.header.locations")}
                </Button>
                <Button
                    variant="subtle"
                    size="sm"
                    leftSection={<IconArrowLeft size={16} />}
                    onClick={handleBackToHub}
                    visibleFrom="sm"
                >
                    {t("location.header.locations")}
                </Button>

                <Group gap="xs" align="center" style={{ minWidth: 0 }}>
                    <IconMapPin size={16} style={{ flexShrink: 0 }} />
                    <Text fw={500} truncate style={{ maxWidth: "150px" }} hiddenFrom="sm">
                        {currentLocation.name}
                    </Text>
                    <Text fw={500} truncate visibleFrom="sm">
                        {currentLocation.name}
                    </Text>
                    <FavoriteStar
                        locationId={currentLocation.id}
                        locationName={currentLocation.name}
                        isFavorite={isFavorite}
                        onFavoriteChange={handleFavoriteChange}
                        size={14}
                    />
                </Group>
            </Group>

            {/* Move today stats to be more compact on mobile */}
            {todayStats && (
                <Badge
                    variant="light"
                    color={
                        todayStats.completedParcels === todayStats.totalParcels &&
                        todayStats.totalParcels > 0
                            ? "green"
                            : "blue"
                    }
                    size="lg"
                    style={{ flexShrink: 0 }}
                    visibleFrom="sm"
                >
                    {t("location.header.completedToday", {
                        completed: todayStats.completedParcels,
                        total: todayStats.totalParcels,
                    })}
                </Badge>
            )}
        </Group>
    );
}
