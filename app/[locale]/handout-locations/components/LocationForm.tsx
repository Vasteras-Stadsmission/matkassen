"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    Paper,
    TextInput,
    NumberInput,
    Button,
    Group,
    Tabs,
    Text,
    Stack,
    SimpleGrid,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useTranslations } from "next-intl";
import { notifications } from "@mantine/notifications";
import { IconBuilding, IconCalendar } from "@tabler/icons-react";
import { PickupLocationWithAllData, LocationFormInput } from "../types";
import { createLocation, updateLocation, getLocation } from "../actions";
import { SchedulesTab } from "./SchedulesTab";

interface LocationFormProps {
    location?: PickupLocationWithAllData | null;
    onSaved?: () => void;
    onLocationUpdated?: (id: string, updatedLocation: Partial<PickupLocationWithAllData>) => void;
    isModal?: boolean;
}

export function LocationForm({
    location,
    onSaved,
    onLocationUpdated,
    isModal = false,
}: LocationFormProps) {
    // Specify the correct namespace for translations
    const t = useTranslations("handoutLocations");
    const [activeTab, setActiveTab] = useState<string | null>("general");
    const [isSubmitting, setIsSubmitting] = useState(false);
    // We're using this in the useEffect, so we should display it in the UI
    const [isLoading, setIsLoading] = useState(false);
    const isMountedRef = useRef(true);

    // Pre-cache translation strings to avoid recreating functions
    const errorSavingTitle = t("errorSaving");
    const errorSavingMessage = t("errorSavingMessage");
    const locationCreatedTitle = t("locationCreated");
    const locationCreatedMessage = t("locationCreatedMessage");
    const locationUpdatedTitle = t("locationUpdated");
    const locationUpdatedMessage = t("locationUpdatedMessage");
    const errorText = t("errorSaving");
    const errorFetchingLocationText = t("errorSavingMessage");

    // Initialize form with location data if it exists
    const form = useForm<LocationFormInput>({
        initialValues: {
            name: location?.name || "",
            street_address: location?.street_address || "",
            postal_code: location?.postal_code || "",
            parcels_max_per_day: location?.parcels_max_per_day || 0,
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
        },
        transformValues: (values): LocationFormInput => ({
            ...values,
            contact_email: values.contact_email?.trim() || "",
            parcels_max_per_day: values.parcels_max_per_day || 0,
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
                    await updateLocation(location.id, values);

                    // Show success notification
                    notifications.show({
                        title: locationUpdatedTitle,
                        message: locationUpdatedMessage,
                        color: "green",
                    });

                    // Call onLocationUpdated callback if provided
                    if (onLocationUpdated) {
                        onLocationUpdated(location.id, values);
                    }
                } else {
                    // Create new location
                    await createLocation(values);

                    notifications.show({
                        title: locationCreatedTitle,
                        message: locationCreatedMessage,
                        color: "green",
                    });

                    // Reset form if in modal (for creating new locations)
                    if (isModal) {
                        form.reset();
                    }
                }

                // Call onSaved callback if provided - this will reload the data
                if (onSaved) {
                    onSaved();
                }
            } catch (error) {
                console.error("Error saving location:", error);
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

    // Fetch location data effect - only run once per location change
    useEffect(() => {
        // If editing an existing location, fetch the data
        if (location && location.id && !isModal) {
            setIsLoading(true);
            getLocation(location.id)
                .then(data => {
                    if (data) {
                        form.setValues({
                            name: data.name,
                            street_address: data.street_address || "",
                            postal_code: data.postal_code || "",
                            parcels_max_per_day: data.parcels_max_per_day || undefined,
                            contact_name: data.contact_name || "",
                            contact_email: data.contact_email || "",
                            contact_phone_number: data.contact_phone_number || "",
                            default_slot_duration_minutes: data.default_slot_duration_minutes || 15,
                        });
                    }
                    setIsLoading(false);
                })
                .catch(err => {
                    console.error("Failed to fetch location data:", err);
                    notifications.show({
                        title: errorFetchingLocationText,
                        message: err.message || errorText,
                        color: "red",
                    });
                    setIsLoading(false);
                });
        }
    }, [location, isModal, errorFetchingLocationText, errorText, form]);

    // Stable tab change handler
    const handleTabChange = (value: string | null) => {
        setActiveTab(value);
    };

    return (
        <Paper p="md" radius="md" withBorder={!isModal}>
            {isLoading ? (
                <Stack align="center" p="md">
                    <Text c="dimmed">{t("loading")}</Text>
                </Stack>
            ) : (
                <form onSubmit={form.onSubmit(values => handleSubmit(values))}>
                    <Tabs value={activeTab} onChange={handleTabChange}>
                        <Tabs.List mb="md">
                            <Tabs.Tab value="general" leftSection={<IconBuilding size={16} />}>
                                {t("generalInfo")}
                            </Tabs.Tab>
                            <Tabs.Tab value="schedules" leftSection={<IconCalendar size={16} />}>
                                {t("schedules")}
                            </Tabs.Tab>
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

                                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                                    <NumberInput
                                        label={t("maxParcelsPerDay")}
                                        placeholder={t("maxParcelsPlaceholder")}
                                        min={0}
                                        allowDecimal={false}
                                        allowNegative={false}
                                        {...form.getInputProps("parcels_max_per_day")}
                                    />
                                    <NumberInput
                                        label={t("defaultSlotDuration")}
                                        description={t("defaultSlotDurationDescription")}
                                        placeholder="15"
                                        min={5}
                                        step={5}
                                        required
                                        allowDecimal={false}
                                        allowNegative={false}
                                        {...form.getInputProps("default_slot_duration_minutes")}
                                    />
                                </SimpleGrid>

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
                            {location && <SchedulesTab location={location} onUpdated={onSaved} />}
                            {!location && (
                                <Text c="dimmed" ta="center" py="md">
                                    {t("saveLocationFirst")}
                                </Text>
                            )}
                        </Tabs.Panel>
                    </Tabs>

                    <Group justify="flex-end" mt="xl">
                        <Button type="submit" loading={isSubmitting}>
                            {location ? t("updateLocation") : t("createLocation")}
                        </Button>
                    </Group>
                </form>
            )}
        </Paper>
    );
}
