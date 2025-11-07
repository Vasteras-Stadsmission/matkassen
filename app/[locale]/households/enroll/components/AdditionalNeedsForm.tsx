"use client";

import { useState, useEffect } from "react";
import {
    Group,
    Button,
    Title,
    Text,
    Card,
    TextInput,
    Chip,
    ActionIcon,
    Loader,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { nanoid } from "@/app/db/schema";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { getAdditionalNeeds } from "../actions";
import { AdditionalNeed } from "../types";
import { useTranslations } from "next-intl";

interface AdditionalNeedsFormProps {
    data: AdditionalNeed[];
    updateData: (data: AdditionalNeed[]) => void;
}

export default function AdditionalNeedsForm({ data, updateData }: AdditionalNeedsFormProps) {
    const t = useTranslations("additionalNeeds");

    const [needs, setNeeds] = useState<AdditionalNeed[]>(data || []);
    const [availableNeeds, setAvailableNeeds] = useState<AdditionalNeed[]>([]);
    const [loading, setLoading] = useState(true);

    const form = useForm({
        initialValues: {
            newNeed: "",
        },
        validate: {
            newNeed: value => (!value || value.length < 2 ? t("validation.minLength") : null),
        },
        validateInputOnBlur: true, // Only validate when field loses focus
        validateInputOnChange: false, // Don't validate while typing
    });

    // Fetch additional needs from database
    useEffect(() => {
        async function fetchData() {
            try {
                const dbNeeds = await getAdditionalNeeds();

                if (dbNeeds.length > 0) {
                    setAvailableNeeds(dbNeeds);
                } else {
                    setAvailableNeeds([]);
                }
            } catch {
                setAvailableNeeds([]);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    // Make sure to include any custom needs that are already in the data array
    useEffect(() => {
        if (!loading && data.length > 0) {
            const newAvailable = [...availableNeeds];
            let updated = false;

            // Add any needs from data that aren't in availableNeeds
            data.forEach(need => {
                const exists = availableNeeds.some(n => n.id === need.id);
                if (!exists) {
                    newAvailable.push(need);
                    updated = true;
                }
            });

            if (updated) {
                setAvailableNeeds(newAvailable);
            }
        }
    }, [data, loading, availableNeeds]);

    // Check if a need is selected
    const isSelected = (id: string) => needs.some(item => item.id === id);

    // Toggle a need
    const toggleNeed = (id: string) => {
        if (isSelected(id)) {
            const updated = needs.filter(item => item.id !== id);
            setNeeds(updated);
            updateData(updated);
        } else {
            const need = availableNeeds.find(item => item.id === id);
            if (need) {
                const updated = [...needs, need];
                setNeeds(updated);
                updateData(updated);
            }
        }
    };

    // Add a new custom need
    const addCustomNeed = (values: { newNeed: string }) => {
        const newNeed: AdditionalNeed = {
            id: nanoid(8),
            need: values.newNeed,
            isCustom: true,
        };

        // Add to both available needs and selected needs
        const updatedAvailable = [...availableNeeds, newNeed];
        setAvailableNeeds(updatedAvailable);

        const updatedSelected = [...needs, newNeed];
        setNeeds(updatedSelected);
        updateData(updatedSelected);

        form.reset();
    };

    // Remove a need entirely from the available list
    const removeNeed = (id: string) => {
        const updatedAvailable = availableNeeds.filter(item => item.id !== id);
        setAvailableNeeds(updatedAvailable);

        const updatedSelected = needs.filter(item => item.id !== id);
        setNeeds(updatedSelected);
        updateData(updatedSelected);
    };

    if (loading) {
        return (
            <Card withBorder p="md" radius="md">
                <Group justify="center" py="xl">
                    <Loader size="md" />
                    <Text>{t("loading")}</Text>
                </Group>
            </Card>
        );
    }

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                {t("title")}
            </Title>
            <Text c="dimmed" size="sm" mb="lg">
                {t("description")}
            </Text>

            <Group mt="md">
                {availableNeeds.map(item => (
                    <Chip
                        key={item.id}
                        checked={isSelected(item.id)}
                        onChange={() => toggleNeed(item.id)}
                        variant={isSelected(item.id) ? "filled" : "outline"}
                        color={isSelected(item.id) ? "blue" : "gray"}
                        radius="sm"
                    >
                        {item.need}
                        {item.isCustom && (
                            <ActionIcon
                                size="xs"
                                color="red"
                                ml={5}
                                onClick={() => removeNeed(item.id)}
                            >
                                <IconTrash size="0.8rem" />
                            </ActionIcon>
                        )}
                    </Chip>
                ))}
            </Group>

            <Title order={5} mt="xl" mb="md">
                {t("addNew")}
            </Title>
            <form onSubmit={form.onSubmit(addCustomNeed)}>
                <Group align="flex-end">
                    <TextInput
                        label={t("newNeed")}
                        placeholder={t("placeholderExample")}
                        style={{ flex: 1 }}
                        {...form.getInputProps("newNeed")}
                    />
                    <Button
                        type="submit"
                        leftSection={<IconPlus size="1rem" />}
                        variant="light"
                        color="teal"
                    >
                        {t("add")}
                    </Button>
                </Group>
            </form>
        </Card>
    );
}
