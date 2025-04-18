"use client";

import { useEffect } from "react";
import { TextInput, SimpleGrid, Group, Title, Text, Card } from "@mantine/core";
import { useForm } from "@mantine/form";

interface Household {
    first_name: string;
    last_name: string;
    phone_number: string;
    locale: string;
    postal_code: string;
}

interface HouseholdFormProps {
    data: Household;
    updateData: (data: Household) => void;
}

export default function HouseholdForm({ data, updateData }: HouseholdFormProps) {
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
            postal_code: value =>
                /^\d{5}$/.test(value) ? null : "Postkod måste bestå av 5 siffror",
        },
    });

    // Update parent component when form values change
    useEffect(() => {
        if (form.isDirty()) {
            updateData(form.values);
        }
    }, [form.values, updateData]);

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                Grunduppgifter
            </Title>
            <Text color="dimmed" size="sm" mb="lg">
                Fyll i grundläggande kontaktuppgifter för hushållet. Dessa uppgifter används för att
                kontakta mottagaren.
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
                        placeholder="12345"
                        withAsterisk
                        {...form.getInputProps("postal_code")}
                    />
                </SimpleGrid>
            </form>
        </Card>
    );
}
