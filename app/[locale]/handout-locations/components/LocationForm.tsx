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
    isModal?: boolean;
}

export function LocationForm({ location, onSaved, isModal = false }: LocationFormProps) {
    // Specify the correct namespace for translations
    const t = useTranslations("handoutLocations");
    const [activeTab, setActiveTab] = useState<string | null>("general");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const hasInitializedRef = useRef(false);
    const isMountedRef = useRef(true);

    // Pre-cache translation strings to avoid recreating functions
    const errorSavingTitle = t("errorSaving");
    const errorSavingMessage = t("errorSavingMessage");
    const locationCreatedTitle = t("locationCreated");
    const locationCreatedMessage = t("locationCreatedMessage");
    const locationUpdatedTitle = t("locationUpdated");
    const locationUpdatedMessage = t("locationUpdatedMessage");
    const errorText = t("errorSaving"); // Using an existing key that works
    const errorFetchingLocationText = t("errorSavingMessage"); // Using an existing key that works

    // Initialize form with location data if it exists
    const form = useForm<LocationFormInput>({
        initialValues: {
            name: location?.name || "",
            street_address: location?.street_address || "",
            postal_code: location?.postal_code || "",
            // Always provide a default value (0) instead of allowing undefined for number fields
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
                // Set to null if empty to satisfy database constraint
                if (!value || value.trim() === "") return null;
                if (!/^\S+@\S+\.\S+$/.test(value)) return t("emailInvalid");
                return null;
            },
        },
        transformValues: (values): LocationFormInput => ({
            ...values,
            // Ensure empty email is stored as null rather than empty string
            contact_email: values.contact_email?.trim() || "",
            // Transform empty or zero values properly for optional number fields
            // While maintaining the LocationFormInput type
            parcels_max_per_day: values.parcels_max_per_day || 0,
        }),
    });

    // Handle form submission with useCallback to maintain reference stability
    const handleSubmit = useCallback(
        async (values: LocationFormInput) => {
            if (isSubmitting) return;
            setIsSubmitting(true);

            try {
                if (location) {
                    // Update existing location
                    await updateLocation(location.id, values);

                    notifications.show({
                        title: locationUpdatedTitle,
                        message: locationUpdatedMessage,
                        color: "green",
                    });
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

                // Call onSaved callback if provided
                if (onSaved && isMountedRef.current) {
                    onSaved();
                }
            } catch (error) {
                console.error("Error saving location:", error);
                if (isMountedRef.current) {
                    notifications.show({
                        title: errorSavingTitle,
                        message: errorSavingMessage,
                        color: "red",
                    });
                }
            } finally {
                if (isMountedRef.current) {
                    setIsSubmitting(false);
                }
            }
        },
        [
            location,
            isModal,
            isSubmitting,
            form,
            onSaved,
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
        // Skip if no location ID or already initialized
        if (!location?.id || hasInitializedRef.current) return;

        const fetchLocationData = async () => {
            try {
                // Fetch the location data
                const locationData = await getLocation(location.id);

                // Set form values with location data
                if (locationData && isMountedRef.current) {
                    form.setValues({
                        name: locationData.name,
                        street_address: locationData.street_address,
                        postal_code: locationData.postal_code,
                        // Ensure we provide a default value (0) for optional number fields
                        parcels_max_per_day: locationData.parcels_max_per_day ?? 0,
                        contact_name: locationData.contact_name ?? "",
                        contact_email: locationData.contact_email ?? "",
                        contact_phone_number: locationData.contact_phone_number ?? "",
                        default_slot_duration_minutes:
                            locationData.default_slot_duration_minutes || 15,
                    });
                    hasInitializedRef.current = true;
                }
            } catch (error) {
                console.error("Error fetching location data:", error);
                if (isMountedRef.current) {
                    notifications.show({
                        title: errorText,
                        message: errorFetchingLocationText,
                        color: "red",
                    });
                }
            }
        };

        fetchLocationData();
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
        </Paper>
    );
}
