"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { TextInput, SimpleGrid, Title, Text, Card, Box, Select, Alert } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDebouncedValue } from "@mantine/hooks";
import { IconAlertCircle, IconAlertTriangle } from "@tabler/icons-react";
import { Household } from "../types";
import deepEqual from "fast-deep-equal";
import { getLanguageSelectOptions } from "@/app/constants/languages";
import { useTranslations, useLocale } from "next-intl";
import { formatPostalCode } from "@/app/utils/validation/household-validation";
import {
    normalizePhoneToE164,
    formatPhoneForDisplay,
    validatePhoneInput,
} from "@/app/utils/validation/phone-validation";
import {
    checkHouseholdDuplicates,
    type DuplicateCheckResult,
} from "../../check-duplicates-action";

interface ValidationError {
    field: string;
    message: string;
}

interface HouseholdFormProps {
    data: Household;
    updateData: (data: Household) => void;
    error?: ValidationError | null;
    householdId?: string; // For edit mode - to exclude current household from duplicate checks
    onDuplicateCheckResult?: (result: DuplicateCheckResult) => void; // Callback to notify parent of duplicate check results
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

export default function HouseholdForm({
    data,
    updateData,
    error,
    householdId,
    onDuplicateCheckResult,
}: HouseholdFormProps) {
    const t = useTranslations("householdForm");
    const currentLocale = useLocale();

    // State for duplicate check results
    const [duplicateCheckResult, setDuplicateCheckResult] = useState<DuplicateCheckResult | null>(
        null,
    );
    const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

    // Request token to prevent race conditions with out-of-order responses
    const requestTokenRef = useRef(0);

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
            phone_number: value => {
                // Allow flexible input formats, will be normalized to E.164 on save
                const error = validatePhoneInput(value);
                return error ? t(error) : null;
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

    // Handle postal code special formatting
    const handlePostalCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value.replace(/\D/g, ""); // Extract only digits
        if (value.length > 5) value = value.slice(0, 5); // Limit to 5 digits
        form.setFieldValue("postal_code", value);
    };

    // Handle phone number formatting - store as digits only but allow flexible input
    const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/\D/g, ""); // Extract only digits
        form.setFieldValue("phone_number", value);
    };

    // Debounced duplicate check effect
    useEffect(() => {
        const checkDuplicates = async () => {
            // Only check if we have enough data
            const hasPhone = debouncedValues.phone_number.length >= 8;
            const hasName =
                debouncedValues.first_name.trim().length >= 2 &&
                debouncedValues.last_name.trim().length >= 2;

            if (!hasPhone && !hasName) {
                setDuplicateCheckResult(null);
                return;
            }

            // Increment request token for this request
            const currentToken = ++requestTokenRef.current;

            setIsCheckingDuplicates(true);

            try {
                const result = await checkHouseholdDuplicates({
                    phoneNumber: hasPhone ? debouncedValues.phone_number : undefined,
                    firstName: hasName ? debouncedValues.first_name : undefined,
                    lastName: hasName ? debouncedValues.last_name : undefined,
                    excludeHouseholdId: householdId,
                });

                // Only update state if this is still the latest request
                if (currentToken === requestTokenRef.current) {
                    if (result.success && result.data) {
                        setDuplicateCheckResult(result.data);
                        onDuplicateCheckResult?.(result.data);
                    } else {
                        setDuplicateCheckResult(null);
                    }
                }
            } catch (error) {
                console.error("Error checking duplicates:", error);
                // Only clear results if this is still the latest request
                if (currentToken === requestTokenRef.current) {
                    setDuplicateCheckResult(null);
                }
            } finally {
                // Only clear loading state if this is still the latest request
                if (currentToken === requestTokenRef.current) {
                    setIsCheckingDuplicates(false);
                }
            }
        };

        checkDuplicates();
    }, [debouncedValues, householdId, onDuplicateCheckResult]);

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                {t("basics")}
            </Title>
            <Text c="dimmed" size="sm" mb="lg">
                {t("basicDescription")}
            </Text>

            {/* Phone duplicate error alert (blocking) */}
            {duplicateCheckResult?.phoneExists && duplicateCheckResult.existingHousehold && (
                <Alert
                    variant="filled"
                    color="red"
                    title={t("duplicatePhone.title")}
                    icon={<IconAlertCircle />}
                    mb="md"
                >
                    {t("duplicatePhone.message", {
                        name: `${duplicateCheckResult.existingHousehold.first_name} ${duplicateCheckResult.existingHousehold.last_name}`,
                        id: duplicateCheckResult.existingHousehold.id,
                        phone: formatPhoneForDisplay(
                            duplicateCheckResult.existingHousehold.phone_number,
                        ),
                    })}
                </Alert>
            )}

            {/* Similar name warning (non-blocking) */}
            {!duplicateCheckResult?.phoneExists &&
                duplicateCheckResult?.similarHouseholds &&
                duplicateCheckResult.similarHouseholds.length > 0 && (
                    <Alert
                        variant="light"
                        color="yellow"
                        title={t("similarName.title")}
                        icon={<IconAlertTriangle />}
                        mb="md"
                    >
                        {t("similarName.message")}
                        <ul style={{ marginTop: "8px", marginBottom: 0 }}>
                            {duplicateCheckResult.similarHouseholds.map(household => (
                                <li key={household.id}>
                                    {household.first_name} {household.last_name} (
                                    {formatPhoneForDisplay(household.phone_number).replace(
                                        /\d(?=\d{4})/g,
                                        "*",
                                    )}
                                    )
                                </li>
                            ))}
                        </ul>
                    </Alert>
                )}

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
                        <TextInput
                            label={t("phoneNumber")}
                            placeholder={t("enterPhoneNumber")}
                            description={
                                form.values.phone_number.length >= 8
                                    ? formatPhoneForDisplay(
                                          normalizePhoneToE164(form.values.phone_number),
                                      )
                                    : undefined
                            }
                            withAsterisk
                            {...form.getInputProps("phone_number")}
                            onChange={handlePhoneNumberChange}
                            inputMode="numeric"
                            error={
                                form.errors.phone_number ||
                                (duplicateCheckResult?.phoneExists
                                    ? t("duplicatePhone.fieldError")
                                    : undefined)
                            }
                        />
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
