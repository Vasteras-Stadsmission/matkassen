"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import {
    TextInput,
    SimpleGrid,
    Title,
    Text,
    Card,
    Box,
    Select,
    Checkbox,
    Stack,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDebouncedValue } from "@mantine/hooks";
import { Household } from "../types";
import deepEqual from "fast-deep-equal";
import { getLanguageSelectOptions } from "@/app/constants/languages";
import { useTranslations, useLocale } from "next-intl";
import {
    validatePhoneInput,
    stripSwedishPrefix,
    formatPhoneInputWithSpaces,
} from "@/app/utils/validation/phone-validation";
import { getPickupLocationsAction } from "../client-actions";
import type { PickupLocation } from "../types";

interface ValidationError {
    field: string;
    message: string;
}

interface HouseholdFormProps {
    data: Household;
    updateData: (data: Household) => void;
    error?: ValidationError | null;
    /** Original phone number (stripped, without +46) for edit mode - used to detect changes and reset SMS consent */
    originalPhone?: string;
    /** Pre-fetched pickup locations from parent (avoids duplicate fetch) */
    pickupLocationsData?: PickupLocation[];
}

// Define a type for the form values
interface FormValues {
    first_name: string;
    last_name: string;
    phone_number: string;
    locale: string;
    sms_consent: boolean;
    primary_pickup_location_id: string;
}

// Normalize nullable string to empty string for form values (null and "" are equivalent)
function toFormString(value: string | null | undefined): string {
    return value || "";
}

// Using fast-deep-equal for robust deep comparison of objects
function objectsEqual<T>(a: T, b: T): boolean {
    return deepEqual(a, b);
}

export default function HouseholdForm({
    data,
    updateData,
    error,
    originalPhone,
    pickupLocationsData,
}: HouseholdFormProps) {
    const t = useTranslations("householdForm");
    const currentLocale = useLocale();

    // Pickup locations state - use pre-fetched data if available, otherwise fetch
    const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>(
        pickupLocationsData || [],
    );

    // Fetch pickup locations on mount only if not provided by parent
    useEffect(() => {
        if (pickupLocationsData) {
            setPickupLocations(pickupLocationsData);
            return;
        }
        getPickupLocationsAction()
            .then(setPickupLocations)
            .catch(() => {
                // Silently fail - location selector will just be empty
            });
    }, [pickupLocationsData]);

    // Memoize location options for the Select
    const locationOptions = useMemo(
        () =>
            pickupLocations.map(loc => ({
                value: loc.id,
                label: loc.name,
            })),
        [pickupLocations],
    );

    // Standardized field container style
    const fieldContainerStyle = { minHeight: "85px" };

    // Use Mantine's useForm for proper form handling
    // Strip +46 prefix from phone for display (it's shown as a fixed prefix in the UI)
    // Note: sms_consent is collected here for validation and UI; persistence and audit logging of consent are handled server-side
    const form = useForm<FormValues>({
        initialValues: {
            first_name: data.first_name || "",
            last_name: data.last_name || "",
            phone_number: stripSwedishPrefix(data.phone_number || ""),
            locale: data.locale || "sv",
            sms_consent: data.sms_consent || false,
            primary_pickup_location_id: data.primary_pickup_location_id || "",
        },
        validate: {
            first_name: value => (value.trim().length < 2 ? t("validation.firstNameLength") : null),
            last_name: value => (value.trim().length < 2 ? t("validation.lastNameLength") : null),
            phone_number: value => {
                // Allow flexible input formats, will be normalized to E.164 on save
                const error = validatePhoneInput(value);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return error ? t(error as any) : null;
            },
        },
        validateInputOnBlur: true,
        validateInputOnChange: false,
    });

    // Memoize the language options to prevent unnecessary recalculations on re-renders
    // Use the current locale when generating the language options
    const languageOptions = useMemo(() => getLanguageSelectOptions(currentLocale), [currentLocale]);

    // Create a stable ref to the form object to prevent infinite loops
    const formRef = useRef(form);

    // Use Mantine's useDebouncedValue hook to debounce form value changes
    // This will cancel previous timeouts when new changes arrive within the 300ms window
    const [debouncedValues] = useDebouncedValue(form.values, 300);

    // Update form values when data changes (e.g., when async data loads)
    useEffect(() => {
        const currentForm = formRef.current;
        const currentValues = {
            first_name: currentForm.values.first_name,
            last_name: currentForm.values.last_name,
            phone_number: currentForm.values.phone_number,
            locale: currentForm.values.locale,
            sms_consent: currentForm.values.sms_consent,
            primary_pickup_location_id: currentForm.values.primary_pickup_location_id,
        };

        // Strip +46 prefix from phone for display (same as initialValues)
        // Use toFormString for nullable fields to prevent null↔"" sync cycles
        const dataValues = {
            first_name: data.first_name || "",
            last_name: data.last_name || "",
            phone_number: stripSwedishPrefix(data.phone_number || ""),
            locale: data.locale || "sv",
            sms_consent: data.sms_consent || false,
            primary_pickup_location_id: toFormString(data.primary_pickup_location_id),
        };

        // Only update form values if they are actually different
        if (!objectsEqual(currentValues, dataValues)) {
            currentForm.setValues(dataValues);
        }
    }, [data]);

    // Handle validation errors from parent
    useEffect(() => {
        if (error && error.field) {
            formRef.current.setFieldError(error.field, error.message);
        }
    }, [error]);

    // Update parent with debounced values
    useEffect(() => {
        // Strip +46 prefix for comparison (form values don't have the prefix)
        // Use toFormString for nullable fields to prevent null↔"" sync cycles
        const dataValues = {
            first_name: data.first_name || "",
            last_name: data.last_name || "",
            phone_number: stripSwedishPrefix(data.phone_number || ""),
            locale: data.locale || "sv",
            sms_consent: data.sms_consent || false,
            primary_pickup_location_id: toFormString(data.primary_pickup_location_id),
        };

        // Only call updateData if the debounced values actually changed
        if (!objectsEqual(debouncedValues, dataValues)) {
            updateData(debouncedValues);
        }
    }, [debouncedValues, updateData, data]);

    // Handle phone number input with live formatting
    // Format: 0712 34 56 78 (with leading 0) or 712 34 56 78 (without)
    const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = formatPhoneInputWithSpaces(e.target.value);
        form.setFieldValue("phone_number", formatted);

        // In edit mode, auto-uncheck SMS consent when phone changes from original
        // (user needs to re-consent for the new number)
        if (originalPhone !== undefined) {
            const digitsOnly = formatted.replace(/\D/g, "");
            const originalDigits = originalPhone.replace(/\D/g, "");
            const phoneChanged = digitsOnly !== originalDigits;

            if (phoneChanged && form.values.sms_consent) {
                form.setFieldValue("sms_consent", false);
            }
        }
    };

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                {t("basics")}
            </Title>
            <Text c="dimmed" size="sm" mb="lg">
                {t("basicDescription")}
            </Text>

            <form onSubmit={e => e.preventDefault()}>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <Box style={fieldContainerStyle}>
                        <TextInput
                            label={t("firstName")}
                            placeholder={t("enterFirstName")}
                            withAsterisk
                            {...form.getInputProps("first_name")}
                        />
                    </Box>

                    <Box style={fieldContainerStyle}>
                        <TextInput
                            label={t("lastName")}
                            placeholder={t("enterLastName")}
                            withAsterisk
                            {...form.getInputProps("last_name")}
                        />
                    </Box>

                    <Box style={fieldContainerStyle}>
                        <Stack gap="xs">
                            <TextInput
                                label={t("phoneNumber")}
                                placeholder="712 34 56 78"
                                description={t("phoneDescription")}
                                leftSection={
                                    <span
                                        style={{
                                            fontSize: "14px",
                                            color: "var(--mantine-color-dimmed)",
                                        }}
                                    >
                                        +46
                                    </span>
                                }
                                leftSectionWidth={45}
                                withAsterisk
                                {...form.getInputProps("phone_number")}
                                onChange={handlePhoneNumberChange}
                                inputMode="tel"
                                maxLength={13}
                            />
                            <Checkbox
                                label={t("smsConsent")}
                                description={t("smsConsentDescription")}
                                {...form.getInputProps("sms_consent", { type: "checkbox" })}
                            />
                        </Stack>
                    </Box>

                    <Box style={fieldContainerStyle}>
                        <Select
                            label={t("language")}
                            placeholder={t("selectLanguage")}
                            data={languageOptions}
                            {...form.getInputProps("locale")}
                        />
                    </Box>

                    <Box style={fieldContainerStyle}>
                        <Select
                            label={t("primaryLocation")}
                            description={t("primaryLocationDescription")}
                            placeholder={t("selectPrimaryLocation")}
                            data={locationOptions}
                            clearable
                            searchable
                            {...form.getInputProps("primary_pickup_location_id")}
                        />
                    </Box>
                </SimpleGrid>
            </form>
        </Card>
    );
}
