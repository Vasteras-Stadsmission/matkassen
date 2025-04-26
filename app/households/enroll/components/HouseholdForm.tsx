"use client";

import { useEffect } from "react";
import { TextInput, SimpleGrid, Title, Text, Card, Box } from "@mantine/core";
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
    // Use Mantine's useForm for proper form handling
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
                !/^\d{8,12}$/.test(value) ? "Ange ett giltigt telefonnummer (8-12 siffror)" : null,
            postal_code: value => {
                const stripped = value.replace(/\s/g, "");
                return !/^\d{5}$/.test(stripped) ? "Postnummer måste bestå av 5 siffror" : null;
            },
        },
        validateInputOnBlur: true,
        validateInputOnChange: false,
    });

    // Handle validation errors from parent
    useEffect(() => {
        if (error && error.field) {
            form.setFieldError(error.field, error.message);
        }
    }, [error, form]);

    // Update parent when form values change
    useEffect(() => {
        const handler = setTimeout(() => {
            updateData(form.values);
        }, 300);

        return () => clearTimeout(handler);
    }, [form.values, updateData]);

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
                Grunduppgifter
            </Title>
            <Text c="dimmed" size="sm" mb="lg">
                Fyll i grundläggande kontaktuppgifter för hushållet. Dessa uppgifter används för att
                kontakta hushållet.
            </Text>

            <form>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    <Box style={{ minHeight: "85px" }}>
                        <TextInput
                            label="Förnamn"
                            placeholder="Ange förnamn"
                            withAsterisk
                            {...form.getInputProps("first_name")}
                        />
                    </Box>

                    <Box style={{ minHeight: "85px" }}>
                        <TextInput
                            label="Efternamn"
                            placeholder="Ange efternamn"
                            withAsterisk
                            {...form.getInputProps("last_name")}
                        />
                    </Box>

                    <Box style={{ minHeight: "85px" }}>
                        <TextInput
                            label="Telefonnummer"
                            placeholder="Ange telefonnummer"
                            withAsterisk
                            {...form.getInputProps("phone_number")}
                        />
                    </Box>

                    <Box style={{ minHeight: "85px" }}>
                        <TextInput
                            label="Postnummer"
                            placeholder="123 45"
                            withAsterisk
                            value={formatPostalCode(form.values.postal_code)}
                            onChange={handlePostalCodeChange}
                            onBlur={() => form.validateField("postal_code")}
                            error={form.errors.postal_code}
                            inputMode="numeric"
                            maxLength={6}
                        />
                    </Box>
                </SimpleGrid>
            </form>
        </Card>
    );
}
