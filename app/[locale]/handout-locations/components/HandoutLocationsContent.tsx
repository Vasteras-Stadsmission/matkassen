"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Group, Button, Paper, Text, Tabs, ActionIcon, Modal, Stack, Flex } from "@mantine/core";
import { useTranslations } from "next-intl";
import { useDisclosure } from "@mantine/hooks";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { LocationForm } from "./LocationForm";
import { getLocations, deleteLocation } from "../actions";
import { notifications } from "@mantine/notifications";
import { PickupLocationWithAllData } from "../types";
import type { MouseEvent } from "react";

export function HandoutLocationsContent() {
    const t = useTranslations("handoutLocations");
    const [activeTab, setActiveTab] = useState<string | null>(null);
    const [locations, setLocations] = useState<PickupLocationWithAllData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedLocation, setSelectedLocation] = useState<PickupLocationWithAllData | null>(
        null,
    );
    const [opened, { open, close }] = useDisclosure(false);

    // Use a ref to track if locations have been loaded
    const hasLoadedRef = useRef(false);

    // Pre-cache all translation strings that might be used in callbacks
    const errorLoadingTitle = t("errorLoading");
    const errorLoadingMessage = t("errorLoadingMessage");
    const locationDeletedTitle = t("locationDeleted");
    const locationDeletedMessage = t("locationDeletedMessage");
    const errorDeletingTitle = t("errorDeleting");
    const errorDeletingMessage = t("errorDeletingMessage");
    const confirmDeleteText = t("confirmDelete");

    // Load locations from the server
    const loadLocations = useCallback(
        async (forceReload: boolean = false): Promise<void> => {
            // Only prevent duplicate loading attempts if we're already loading AND have tried before
            if (isLoading && hasLoadedRef.current) return;

            // Skip loading if we already have data, UNLESS forceReload is true
            if (hasLoadedRef.current && locations.length > 0 && !forceReload) return;

            setIsLoading(true);
            try {
                const data = await getLocations();
                setLocations(data);
                hasLoadedRef.current = true;

                // Set the first location as active if available and no active tab is set
                if (data.length > 0 && !activeTab) {
                    setActiveTab(data[0].id);
                }
            } catch (error) {
                console.error("Failed to load locations:", error);
                notifications.show({
                    title: errorLoadingTitle,
                    message: errorLoadingMessage,
                    color: "red",
                });
            } finally {
                setIsLoading(false);
            }
        },
        [isLoading, locations.length, activeTab, errorLoadingTitle, errorLoadingMessage],
    );

    // Fetch locations only on initial component mount
    useEffect(() => {
        loadLocations();
    }, [loadLocations]);

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
                    await deleteLocation(locationId);

                    // Manual state update instead of reloading all locations
                    setLocations(prev => prev.filter(loc => loc.id !== locationId));

                    notifications.show({
                        title: locationDeletedTitle,
                        message: locationDeletedMessage,
                        color: "green",
                    });
                } catch (error) {
                    console.error("Failed to delete location:", error);
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

    // Create a stable reference to the reload function for the form
    const handleReload = useCallback((): void => {
        // Force reload when explicitly called
        loadLocations(true);
    }, [loadLocations]);

    // Handle location form submission (create or edit)
    const handleFormSubmit = () => {
        close();
        loadLocations(true); // Force reload when creating a new location
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
                            {isLoading ? t("loading") : t("noLocations")}
                        </Text>
                        {!isLoading && (
                            <Button onClick={handleAddLocation}>{t("addFirstLocation")}</Button>
                        )}
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
                                onSaved={() => handleReload()}
                                onLocationUpdated={(id, updatedLocation) => {
                                    // Update the location name in local state immediately
                                    setLocations(prevLocations =>
                                        prevLocations.map(loc =>
                                            loc.id === id ? { ...loc, ...updatedLocation } : loc,
                                        ),
                                    );
                                }}
                            />
                        </Tabs.Panel>
                    ))}
                </Tabs>
            )}

            {/* Modal for creating new locations */}
            <Modal opened={opened} onClose={close} title={t("addLocation")} size="lg">
                <LocationForm location={selectedLocation} onSaved={handleFormSubmit} isModal />
            </Modal>
        </>
    );
}
