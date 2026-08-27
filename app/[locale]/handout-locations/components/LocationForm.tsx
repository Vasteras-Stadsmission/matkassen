"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Paper, TextInput, Button, Group, Tabs, Text, Stack, SimpleGrid } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useTranslations } from "next-intl";
import { notifications } from "@mantine/notifications";
import { PickupLocationWithAllData, LocationFormInput } from "../types";
import { createLocation, updateLocation } from "../actions";
import { SchedulesTab } from "./schedules/SchedulesTab";
import { LimitsTab } from "./limits/LimitsTab";

interface LocationFormProps {
    location?: PickupLocationWithAllData | null;
    onSaved?: () => void;
    onLocationUpdated?: (id: string, updatedLocation: Partial<PickupLocationWithAllData>) => void;
    onLocationCreated?: (newLocation: PickupLocationWithAllData) => void;
    isModal?: boolean;
}

export function LocationForm({
    location,
    onSaved,
    onLocationUpdated,
    onLocationCreated,
    isModal = false,
}: LocationFormProps) {
    // Specify the correct namespace for translations
    const t = useTranslations("handoutLocations");
    const [activeTab, setActiveTab] = useState<string | null>("general");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isMountedRef = useRef(true);

    // Pre-cache translation strings to avoid recreating functions
    const errorSavingTitle = t("errorSaving");
    const errorSavingMessage = t("errorSavingMessage");
    const locationCreatedTitle = t("locationCreated");
    const locationCreatedMessage = t("locationCreatedMessage");
    const locationUpdatedTitle = t("locationUpdated");
    const locationUpdatedMessage = t("locationUpdatedMessage");

    // Initialize form with location data if it exists
    const form = useForm<LocationFormInput>({
        initialValues: {
            name: location?.name || "",
            street_address: location?.street_address || "",
            postal_code: location?.postal_code || "",
            parcels_max_per_day: location?.parcels_max_per_day ?? null,
            contact_name: location?.contact_name || "",
            contact_email: location?.contact_email || "",
            contact_phone_number: location?.contact_phone_number || "",
            default_slot_duration_minutes: location?.default_slot_duration_minutes || 15,
        },
        validate: {
            name: value => (value ? null : t("nameRequired")),
            street_address: value => (value ? null : t("streetAddressRequired")),
            postal_code: value => {
                if (!value) return t("postalCodeRequired");
                if (!/^\d{5}$/.test(value)) return t("postalCodeFormat");
                return null;
            },
            contact_email: value => {
                if (!value || value.trim() === "") return null;
                if (!/^\S+@\S+\.\S+$/.test(value)) return t("emailInvalid");
                return null;
            },
            default_slot_duration_minutes: value => {
                const numValue = Number(value);
                if (numValue <= 0) return t("slotDurationPositive");
                if (numValue > 240) return t("slotDurationMaxExceeded");
                if (numValue % 15 !== 0) return t("slotDurationIncrement");
                return null;
            },
            parcels_max_per_day: value => {
                if (value === null || value === undefined) return null;
                const numValue = Number(value);
                if (!Number.isInteger(numValue) || numValue <= 0) {
                    return t("maxParcelsPerDayPositive");
                }
                return null;
            },
        },
        transformValues: (values): LocationFormInput => ({
            ...values,
            contact_email: values.contact_email?.trim() || "",
            parcels_max_per_day: values.parcels_max_per_day || null,
        }),
    });

    // Handle form submission
    const handleSubmit = useCallback(
        async (values: LocationFormInput): Promise<void> => {
            if (isSubmitting) return;

            try {
                setIsSubmitting(true);

                if (location) {
                    // Update existing location
                    const valuesWithCurrentOperationalSettings = {
                        ...values,
                        parcels_max_per_day: location.parcels_max_per_day,
                        default_slot_duration_minutes: location.default_slot_duration_minutes,
                    };
                    const result = await updateLocation(
                        location.id,
                        valuesWithCurrentOperationalSettings,
                    );

                    if (!result.success) {
                        throw new Error(result.error.message);
                    }

                    // Show success notification
                    notifications.show({
                        title: locationUpdatedTitle,
                        message: locationUpdatedMessage,
                        color: "green",
                    });

                    // Call onLocationUpdated callback if provided
                    if (onLocationUpdated) {
                        onLocationUpdated(location.id, valuesWithCurrentOperationalSettings);
                    }
                } else {
                    // Create new location
                    const result = await createLocation(values);

                    if (!result.success) {
                        throw new Error(result.error.message);
                    }

                    notifications.show({
                        title: locationCreatedTitle,
                        message: locationCreatedMessage,
                        color: "green",
                    });

                    // Notify parent of new location
                    if (onLocationCreated) {
                        onLocationCreated(result.data);
                    }

                    // Reset form if in modal (for creating new locations)
                    if (isModal) {
                        form.reset();
                    }
                }

                // Call onSaved callback if provided - this will reload the data
                if (onSaved) {
                    onSaved();
                }
            } catch {
                // Error saving location
                notifications.show({
                    title: errorSavingTitle,
                    message: errorSavingMessage,
                    color: "red",
                });
            } finally {
                // Always make sure submitting state is reset
                setIsSubmitting(false);
            }
        },
        [
            location,
            isModal,
            isSubmitting,
            form,
            onSaved,
            onLocationUpdated,
            onLocationCreated,
            errorSavingTitle,
            errorSavingMessage,
            locationCreatedTitle,
            locationCreatedMessage,
            locationUpdatedTitle,
            locationUpdatedMessage,
        ],
    );

    // Set up cleanup on component unmount
    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Initialize form with the provided location data
    useEffect(() => {
        if (location && location.id) {
            // Simply use the location data that was passed via props
            form.setValues({
                name: location.name,
                street_address: location.street_address || "",
                postal_code: location.postal_code || "",
                parcels_max_per_day: location.parcels_max_per_day ?? null,
                contact_name: location.contact_name || "",
                contact_email: location.contact_email || "",
                contact_phone_number: location.contact_phone_number || "",
                default_slot_duration_minutes: location.default_slot_duration_minutes || 15,
            });
        }
        // We're intentionally not including form in the dependency array to avoid infinite loops
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location?.id]);

    // Stable tab change handler
    const handleTabChange = (value: string | null) => {
        setActiveTab(value);
    };

    return (
        <Paper p="md" radius="md" withBorder={!isModal}>
            <form onSubmit={form.onSubmit(values => handleSubmit(values))}>
                <Tabs value={activeTab} onChange={handleTabChange}>
                    <Tabs.List mb="md" grow>
                        <Tabs.Tab value="general">{t("generalInfo")}</Tabs.Tab>
                        {location && <Tabs.Tab value="schedules">{t("openingHours")}</Tabs.Tab>}
                        {location && <Tabs.Tab value="limits">{t("limits.tab")}</Tabs.Tab>}
                    </Tabs.List>

                    {/* General Information Tab */}
                    <Tabs.Panel value="general">
                        <Stack>
                            <SimpleGrid cols={{ base: 1, sm: 2 }}>
                                <TextInput
                                    label={t("name")}
                                    placeholder={t("namePlaceholder")}
                                    required
                                    {...form.getInputProps("name")}
                                />
                                <TextInput
                                    label={t("postalCode")}
                                    placeholder="12345"
                                    required
                                    {...form.getInputProps("postal_code")}
                                />
                            </SimpleGrid>

                            <TextInput
                                label={t("streetAddress")}
                                placeholder={t("streetAddressPlaceholder")}
                                required
                                {...form.getInputProps("street_address")}
                            />

                            <Text fw={600} mt="md">
                                {t("contactInfo")}
                            </Text>

                            <SimpleGrid cols={{ base: 1, sm: 3 }}>
                                <TextInput
                                    label={t("contactName")}
                                    placeholder={t("contactNamePlaceholder")}
                                    {...form.getInputProps("contact_name")}
                                />
                                <TextInput
                                    label={t("contactEmail")}
                                    placeholder={t("contactEmailPlaceholder")}
                                    {...form.getInputProps("contact_email")}
                                />
                                <TextInput
                                    label={t("contactPhone")}
                                    placeholder={t("contactPhonePlaceholder")}
                                    {...form.getInputProps("contact_phone_number")}
                                />
                            </SimpleGrid>
                        </Stack>
                    </Tabs.Panel>

                    {/* Schedules Tab */}
                    <Tabs.Panel value="schedules">
                        {location && (
                            <SchedulesTab
                                location={location}
                                onUpdated={onSaved}
                                onLocationUpdated={onLocationUpdated}
                            />
                        )}
                        {!location && (
                            <Text c="dimmed" ta="center" py="md">
                                {t("saveLocationFirst")}
                            </Text>
                        )}
                    </Tabs.Panel>

                    <Tabs.Panel value="limits">
                        {location && (
                            <LimitsTab location={location} onLocationUpdated={onLocationUpdated} />
                        )}
                    </Tabs.Panel>
                </Tabs>

                {/* Only show the submit button on the General tab */}
                {activeTab === "general" && (
                    <Group justify="flex-end" mt="xl">
                        <Button type="submit" loading={isSubmitting}>
                            {location ? t("updateLocation") : t("createLocation")}
                        </Button>
                    </Group>
                )}
            </form>
        </Paper>
    );
}
