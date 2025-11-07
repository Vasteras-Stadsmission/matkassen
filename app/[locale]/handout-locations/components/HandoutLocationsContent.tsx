"use client";

import { useState, useCallback } from "react";
import { Group, Button, Paper, Text, Tabs, ActionIcon, Modal, Stack, Flex } from "@mantine/core";
import { useTranslations } from "next-intl";
import { useDisclosure } from "@mantine/hooks";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { LocationForm } from "./LocationForm";
import { deleteLocation } from "../actions";
import { notifications } from "@mantine/notifications";
import { PickupLocationWithAllData } from "../types";
import type { MouseEvent } from "react";

interface Props {
    initialLocations: PickupLocationWithAllData[];
}

export function HandoutLocationsContent({ initialLocations }: Props) {
    const t = useTranslations("handoutLocations");
    const [locations, setLocations] = useState<PickupLocationWithAllData[]>(initialLocations);
    const [activeTab, setActiveTab] = useState<string | null>(initialLocations[0]?.id ?? null);
    const [selectedLocation, setSelectedLocation] = useState<PickupLocationWithAllData | null>(
        null,
    );
    const [opened, { open, close }] = useDisclosure(false);

    // Pre-cache all translation strings that might be used in callbacks
    const locationDeletedTitle = t("locationDeleted");
    const locationDeletedMessage = t("locationDeletedMessage");
    const errorDeletingTitle = t("errorDeleting");
    const errorDeletingMessage = t("errorDeletingMessage");
    const confirmDeleteText = t("confirmDelete");

    // Handle creating a new location - make it a direct function reference
    const handleAddLocation = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        setSelectedLocation(null);
        open();
    };

    // Handle deleting a location
    const handleDeleteLocation = useCallback(
        async (locationId: string) => {
            if (window.confirm(confirmDeleteText)) {
                try {
                    const result = await deleteLocation(locationId);

                    if (!result.success) {
                        throw new Error(result.error.message);
                    }

                    // Manual state update for optimistic UI
                    setLocations(prev => prev.filter(loc => loc.id !== locationId));

                    // No need to refresh - server action handles revalidation

                    notifications.show({
                        title: locationDeletedTitle,
                        message: locationDeletedMessage,
                        color: "green",
                    });
                } catch {
                    // Failed to delete location
                    notifications.show({
                        title: errorDeletingTitle,
                        message: errorDeletingMessage,
                        color: "red",
                    });
                }
            }
        },
        [
            confirmDeleteText,
            errorDeletingMessage,
            errorDeletingTitle,
            locationDeletedMessage,
            locationDeletedTitle,
        ],
    );

    // Handle updating location state after form submission
    const handleLocationUpdate = (
        id: string,
        updatedLocation: Partial<PickupLocationWithAllData>,
    ): void => {
        setLocations(prevLocations =>
            prevLocations.map(loc => (loc.id === id ? { ...loc, ...updatedLocation } : loc)),
        );
    };

    // Changing the active tab should NOT trigger a reload
    const handleTabChange = (tabValue: string | null) => {
        setActiveTab(tabValue);
    };

    return (
        <>
            <Group justify="space-between" mb="md">
                <Text fw={500} size="lg">
                    {t("locationsList")}
                </Text>
                <Button leftSection={<IconPlus size={16} />} onClick={handleAddLocation}>
                    {t("addLocation")}
                </Button>
            </Group>

            {locations.length === 0 ? (
                <Paper p="xl" withBorder>
                    <Stack align="center" py="xl">
                        <Text ta="center" c="dimmed">
                            {t("noLocations")}
                        </Text>
                        <Button onClick={handleAddLocation}>{t("addFirstLocation")}</Button>
                    </Stack>
                </Paper>
            ) : (
                <Tabs value={activeTab} onChange={handleTabChange}>
                    <Tabs.List>
                        {locations.map(location => (
                            <Flex key={location.id} align="center" gap={4}>
                                <Tabs.Tab value={location.id}>{location.name}</Tabs.Tab>
                                <ActionIcon
                                    size="sm"
                                    variant="subtle"
                                    color="red"
                                    onClick={(e: MouseEvent) => {
                                        e.stopPropagation();
                                        handleDeleteLocation(location.id);
                                    }}
                                    aria-label={t("deleteLocationAriaLabel")}
                                >
                                    <IconTrash size={16} />
                                </ActionIcon>
                            </Flex>
                        ))}
                    </Tabs.List>

                    {locations.map(location => (
                        <Tabs.Panel key={location.id} value={location.id} pt="xs">
                            <LocationForm
                                location={location}
                                onSaved={async () => {
                                    // No need to refresh data for schedule updates in main tabs
                                    // The SchedulesTab component handles its own state updates
                                }}
                                onLocationUpdated={handleLocationUpdate}
                            />
                        </Tabs.Panel>
                    ))}
                </Tabs>
            )}

            {/* Modal for creating new locations */}
            <Modal opened={opened} onClose={close} title={t("addLocation")} size="lg">
                <LocationForm
                    location={selectedLocation}
                    onSaved={() => close()}
                    onLocationUpdated={handleLocationUpdate}
                    isModal
                />
            </Modal>
        </>
    );
}
