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
import { getDietaryRestrictions } from "../actions";

interface DietaryRestriction {
    id: string;
    name: string;
    isCustom?: boolean;
}

interface DietaryRestrictionsFormProps {
    data: DietaryRestriction[];
    updateData: (data: DietaryRestriction[]) => void;
}

export default function DietaryRestrictionsForm({
    data,
    updateData,
}: DietaryRestrictionsFormProps) {
    const [restrictions, setRestrictions] = useState<DietaryRestriction[]>(data || []);
    const [availableRestrictions, setAvailableRestrictions] = useState<DietaryRestriction[]>([]);
    const [loading, setLoading] = useState(true);

    const form = useForm({
        initialValues: {
            newRestriction: "",
        },
        validate: {
            newRestriction: value =>
                !value || value.length < 2 ? "Matrestriktionen måste vara minst 2 tecken" : null,
        },
    });

    // Fetch dietary restrictions from database
    useEffect(() => {
        async function fetchData() {
            try {
                const dbRestrictions = await getDietaryRestrictions();

                // If we don't have any restrictions in the DB, use dummy data
                if (dbRestrictions.length === 0) {
                    setAvailableRestrictions([
                        { id: "r1", name: "Gluten" },
                        { id: "r2", name: "Laktos" },
                        { id: "r3", name: "Nötter" },
                        { id: "r4", name: "Ägg" },
                        { id: "r5", name: "Fisk" },
                        { id: "r6", name: "Vegetarian" },
                        { id: "r7", name: "Vegan" },
                        { id: "r8", name: "Fläskkött" },
                    ]);
                } else {
                    setAvailableRestrictions(dbRestrictions);
                }
            } catch (error) {
                console.error("Error fetching dietary restrictions:", error);
                // Fallback to dummy data
                setAvailableRestrictions([
                    { id: "r1", name: "Gluten" },
                    { id: "r2", name: "Laktos" },
                    { id: "r3", name: "Nötter" },
                    { id: "r4", name: "Ägg" },
                    { id: "r5", name: "Fisk" },
                    { id: "r6", name: "Vegetarian" },
                    { id: "r7", name: "Vegan" },
                    { id: "r8", name: "Fläskkött" },
                ]);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    // Check if a restriction is selected
    const isSelected = (id: string) => restrictions.some(item => item.id === id);

    // Toggle a restriction
    const toggleRestriction = (id: string) => {
        if (isSelected(id)) {
            const updated = restrictions.filter(item => item.id !== id);
            setRestrictions(updated);
            updateData(updated);
        } else {
            const restriction = availableRestrictions.find(item => item.id === id);
            if (restriction) {
                const updated = [...restrictions, restriction];
                setRestrictions(updated);
                updateData(updated);
            }
        }
    };

    // Add a new custom restriction
    const addCustomRestriction = (values: { newRestriction: string }) => {
        const newRestriction: DietaryRestriction = {
            id: nanoid(8),
            name: values.newRestriction,
            isCustom: true,
        };

        // Add to both available restrictions and selected restrictions
        const updatedAvailable = [...availableRestrictions, newRestriction];
        setAvailableRestrictions(updatedAvailable);

        const updatedSelected = [...restrictions, newRestriction];
        setRestrictions(updatedSelected);
        updateData(updatedSelected);

        form.reset();
    };

    // Remove a restriction entirely from the available list
    const removeRestriction = (id: string) => {
        const updatedAvailable = availableRestrictions.filter(item => item.id !== id);
        setAvailableRestrictions(updatedAvailable);

        const updatedSelected = restrictions.filter(item => item.id !== id);
        setRestrictions(updatedSelected);
        updateData(updatedSelected);
    };

    if (loading) {
        return (
            <Card withBorder p="md" radius="md">
                <Group position="center" py="xl">
                    <Loader size="md" />
                    <Text>Laddar matrestriktioner...</Text>
                </Group>
            </Card>
        );
    }

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                Matrestriktioner
            </Title>
            <Text color="dimmed" size="sm" mb="lg">
                Välj matrestriktioner som gäller för hushållet. Du kan välja från listan eller lägga
                till egna restriktioner.
            </Text>

            <Title order={5} mb="sm">
                Välj från befintliga restriktioner
            </Title>
            <Group mt="md">
                {availableRestrictions.map(restriction => (
                    <Chip
                        key={restriction.id}
                        checked={isSelected(restriction.id)}
                        onChange={() => toggleRestriction(restriction.id)}
                        variant="filled"
                        radius="sm"
                    >
                        {restriction.name}
                        {restriction.isCustom && (
                            <ActionIcon
                                size="xs"
                                color="red"
                                ml={5}
                                onClick={e => {
                                    e.stopPropagation();
                                    removeRestriction(restriction.id);
                                }}
                            >
                                <IconTrash size="0.8rem" />
                            </ActionIcon>
                        )}
                    </Chip>
                ))}
            </Group>

            <Title order={5} mt="xl" mb="md">
                Lägg till ny restriktion
            </Title>
            <form onSubmit={form.onSubmit(addCustomRestriction)}>
                <Group align="flex-end">
                    <TextInput
                        label="Ny matrestriktion"
                        placeholder="T.ex. Jordgubbar, Soja, etc."
                        style={{ flex: 1 }}
                        {...form.getInputProps("newRestriction")}
                    />
                    <Button type="submit" leftIcon={<IconPlus size="1rem" />}>
                        Lägg till
                    </Button>
                </Group>
            </form>

            {restrictions.length > 0 && (
                <>
                    <Title order={5} mt="xl" mb="sm">
                        Valda restriktioner:
                    </Title>
                    <Group mt="sm">
                        {restrictions.map(restriction => (
                            <Chip
                                key={restriction.id}
                                checked
                                onChange={() => toggleRestriction(restriction.id)}
                                variant="filled"
                                color="blue"
                                radius="sm"
                            >
                                {restriction.name}
                            </Chip>
                        ))}
                    </Group>
                </>
            )}
        </Card>
    );
}
