"use client";

import { useEffect, useRef, useMemo } from "react";
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
import { formatPostalCode } from "@/app/utils/validation/household-validation";
import {
    validatePhoneInput,
    stripSwedishPrefix,
    formatPhoneInputWithSpaces,
} from "@/app/utils/validation/phone-validation";

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
    sms_consent: boolean;
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
    // Strip +46 prefix from phone for display (it's shown as a fixed prefix in the UI)
    // Note: sms_consent is collected here for validation and UI; persistence and audit logging of consent are handled server-side
    const form = useForm<FormValues>({
        initialValues: {
            first_name: data.first_name || "",
            last_name: data.last_name || "",
            phone_number: stripSwedishPrefix(data.phone_number || ""),
            locale: data.locale || "sv",
            postal_code: data.postal_code || "",
            sms_consent: data.sms_consent || false,
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
            postal_code: value => {
                if (!value || value.trim().length === 0) return null;
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
            sms_consent: currentForm.values.sms_consent,
        };

        const dataValues = {
            first_name: data.first_name || "",
            last_name: data.last_name || "",
            phone_number: data.phone_number || "",
            locale: data.locale || "sv",
            postal_code: data.postal_code || "",
            sms_consent: data.sms_consent || false,
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
            sms_consent: data.sms_consent || false,
        };

        // Only call updateData if the debounced values actually changed
        if (!objectsEqual(debouncedValues, dataValues)) {
            updateData(debouncedValues);
        }
    }, [debouncedValues, updateData, data]);

    // Handle postal code special formatting
    const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value.replace(/\D/g, ""); // Extract only digits
        if (value.length > 5) value = value.slice(0, 5); // Limit to 5 digits
        form.setFieldValue("postal_code", value);
    };

    // Handle phone number input with live formatting
    // Format: 0712 34 56 78 (with leading 0) or 712 34 56 78 (without)
    const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = formatPhoneInputWithSpaces(e.target.value);
        form.setFieldValue("phone_number", formatted);
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
                        <TextInput
                            label={t("postalCode")}
                            placeholder="123 45"
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
