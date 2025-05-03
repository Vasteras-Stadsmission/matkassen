"use client";

import { useEffect, useRef, useMemo } from "react";
import { TextInput, SimpleGrid, Title, Text, Card, Box, Select } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDebouncedValue } from "@mantine/hooks";
import { Household } from "../types";
import deepEqual from "fast-deep-equal";
import { getLanguageSelectOptions } from "@/app/constants/languages";
import { useTranslations, useLocale } from "next-intl";

interface ValidationError {
    field: string;
    message: string;
}

interface HouseholdFormProps {
    data: Household;
    updateData: (data: Household) => void;
    error?: ValidationError | null;
}

// Define a type for the form values
interface FormValues {
    first_name: string;
    last_name: string;
    phone_number: string;
    locale: string;
    postal_code: string;
}

// Using fast-deep-equal for robust deep comparison of objects
function objectsEqual<T>(a: T, b: T): boolean {
    return deepEqual(a, b);
}

export default function HouseholdForm({ data, updateData, error }: HouseholdFormProps) {
    const t = useTranslations("householdForm");
    const currentLocale = useLocale();

    // Standardized field container style
    const fieldContainerStyle = { minHeight: "85px" };

    // Use Mantine's useForm for proper form handling
    const form = useForm<FormValues>({
        initialValues: {
            first_name: data.first_name || "",
            last_name: data.last_name || "",
            phone_number: data.phone_number || "",
            locale: data.locale || "sv",
            postal_code: data.postal_code || "",
        },
        validate: {
            first_name: value => (value.trim().length < 2 ? t("validation.firstNameLength") : null),
            last_name: value => (value.trim().length < 2 ? t("validation.lastNameLength") : null),
            phone_number: value =>
                !/^\d{8,12}$/.test(value) ? t("validation.phoneNumberFormat") : null,
            postal_code: value => {
                const stripped = value.replace(/\s/g, "");
                return !/^\d{5}$/.test(stripped) ? t("validation.postalCodeFormat") : null;
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
            postal_code: currentForm.values.postal_code,
        };

        const dataValues = {
            first_name: data.first_name || "",
            last_name: data.last_name || "",
            phone_number: data.phone_number || "",
            locale: data.locale || "sv",
            postal_code: data.postal_code || "",
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
        const dataValues = {
            first_name: data.first_name || "",
            last_name: data.last_name || "",
            phone_number: data.phone_number || "",
            locale: data.locale || "sv",
            postal_code: data.postal_code || "",
        };

        // Only call updateData if the debounced values actually changed
        if (!objectsEqual(debouncedValues, dataValues)) {
            updateData(debouncedValues);
        }
    }, [debouncedValues, updateData, data]);

    // Format postal code with space after 3 digits
    const formatPostalCode = (value: string) => {
        if (!value) return "";
        const digits = value.replace(/\D/g, "");
        if (digits.length <= 3) return digits;
        return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    };

    // Handle postal code special formatting
    const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value.replace(/\D/g, ""); // Extract only digits
        if (value.length > 5) value = value.slice(0, 5); // Limit to 5 digits
        form.setFieldValue("postal_code", value);
    };

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                {t("basics")}
            </Title>
            <Text c="dimmed" size="sm" mb="lg">
                {t("basicDescription")}
            </Text>

            <form>
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
                        <TextInput
                            label={t("phoneNumber")}
                            placeholder={t("enterPhoneNumber")}
                            withAsterisk
                            {...form.getInputProps("phone_number")}
                        />
                    </Box>

                    <Box style={fieldContainerStyle}>
                        <TextInput
                            label={t("postalCode")}
                            placeholder="123 45"
                            withAsterisk
                            {...form.getInputProps("postal_code", { withFocus: true })}
                            value={formatPostalCode(form.values.postal_code)}
                            onChange={handlePostalCodeChange}
                            inputMode="numeric"
                            maxLength={6}
                        />
                    </Box>

                    <Box style={fieldContainerStyle}>
                        <Select
                            label={t("language")}
                            placeholder={t("selectLanguage")}
                            data={languageOptions}
                            {...form.getInputProps("locale")}
                        />
                    </Box>
                </SimpleGrid>
            </form>
        </Card>
    );
}
