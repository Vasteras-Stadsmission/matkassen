"use client";

import { useEffect, useCallback, useRef } from "react";
import { TextInput, SimpleGrid, Title, Text, Card } from "@mantine/core";
import { useForm } from "@mantine/form";
import { Household } from "../types";

interface ValidationError {
    field: string;
    message: string;
}

interface HouseholdFormProps {
    data: Household;
    updateData: (data: Household) => void;
    error?: ValidationError | null;
}

export default function HouseholdForm({ data, updateData, error }: HouseholdFormProps) {
    const isUpdatingRef = useRef(false);

    const form = useForm({
        initialValues: {
            first_name: data.first_name || "",
            last_name: data.last_name || "",
            phone_number: data.phone_number || "",
            locale: data.locale || "sv",
            postal_code: data.postal_code || "",
        },
        validate: {
            first_name: value =>
                value.trim().length < 2 ? "Förnamn måste vara minst 2 tecken" : null,
            last_name: value =>
                value.trim().length < 2 ? "Efternamn måste vara minst 2 tecken" : null,
            phone_number: value =>
                /^\d{8,12}$/.test(value) ? null : "Ange ett giltigt telefonnummer (8-12 siffror)",
            postal_code: value => {
                const stripped = value.replace(/\s/g, "");
                return /^\d{5}$/.test(stripped) ? null : "Postnummer måste bestå av 5 siffror";
            },
        },
    });

    useEffect(() => {
        if (isUpdatingRef.current) return;

        if (data) {
            const formValues = {
                first_name: data.first_name || form.values.first_name,
                last_name: data.last_name || form.values.last_name,
                phone_number: data.phone_number || form.values.phone_number,
                postal_code: data.postal_code || form.values.postal_code,
                locale: data.locale || form.values.locale,
            };

            const hasChanges = Object.keys(formValues).some(
                key =>
                    formValues[key as keyof typeof formValues] !==
                    form.values[key as keyof typeof form.values],
            );

            if (hasChanges) {
                form.setValues(formValues);
            }
        }
    }, [data]);

    const handlePostalCodeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        let value = event.target.value.replace(/\D/g, "");
        if (value.length > 5) {
            value = value.slice(0, 5);
        }
        form.setFieldValue("postal_code", value);
    };

    const formatPostalCode = (value: string) => {
        if (!value) return "";
        const digits = value.replace(/\D/g, "");
        if (digits.length <= 3) return digits;
        return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    };

    const updateParentData = useCallback(() => {
        if (form.isDirty()) {
            isUpdatingRef.current = true;
            updateData(form.values);
            setTimeout(() => {
                isUpdatingRef.current = false;
            }, 200);
        }
    }, [form, updateData]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            updateParentData();
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [form.values, updateParentData]);

    useEffect(() => {
        if (error && error.field) {
            form.setFieldError(error.field, error.message);
        }
    }, [error, form]);

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                Grunduppgifter
            </Title>
            <Text c="dimmed" size="sm" mb="lg">
                Fyll i grundläggande kontaktuppgifter för hushållet. Dessa uppgifter används för att
                kontakta hushållet.
            </Text>

            <form>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <TextInput
                        label="Förnamn"
                        placeholder="Ange förnamn"
                        withAsterisk
                        {...form.getInputProps("first_name")}
                    />
                    <TextInput
                        label="Efternamn"
                        placeholder="Ange efternamn"
                        withAsterisk
                        {...form.getInputProps("last_name")}
                    />
                    <TextInput
                        label="Telefonnummer"
                        placeholder="Ange telefonnummer"
                        withAsterisk
                        {...form.getInputProps("phone_number")}
                    />
                    <TextInput
                        label="Postnummer"
                        placeholder="123 45"
                        withAsterisk
                        value={formatPostalCode(form.values.postal_code)}
                        onChange={handlePostalCodeChange}
                        error={form.errors.postal_code}
                        inputMode="numeric"
                        maxLength={6}
                        inputWrapperOrder={["label", "error", "input", "description"]}
                    />
                </SimpleGrid>
            </form>
        </Card>
    );
}
