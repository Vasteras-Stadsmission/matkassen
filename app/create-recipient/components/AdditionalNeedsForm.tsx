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

interface AdditionalNeed {
    id: string;
    need: string;
    isCustom?: boolean;
}

interface AdditionalNeedsFormProps {
    data: AdditionalNeed[];
    updateData: (data: AdditionalNeed[]) => void;
}

export default function AdditionalNeedsForm({ data, updateData }: AdditionalNeedsFormProps) {
    const [needs, setNeeds] = useState<AdditionalNeed[]>(data || []);
    const [availableNeeds, setAvailableNeeds] = useState<AdditionalNeed[]>([]);
    const [loading, setLoading] = useState(true);

    const form = useForm({
        initialValues: {
            newNeed: "",
        },
        validate: {
            newNeed: value =>
                !value || value.length < 2 ? "Behovet måste vara minst 2 tecken" : null,
        },
    });

    // Fetch additional needs from database
    useEffect(() => {
        async function fetchData() {
            try {
                const dbNeeds = await getAdditionalNeeds();

                // If we don't have any needs in the DB, use dummy data
                if (dbNeeds.length === 0) {
                    setAvailableNeeds([
                        { id: "n1", need: "Blöjor" },
                        { id: "n2", need: "Tamponger/bindor" },
                        { id: "n3", need: "Kattmat" },
                        { id: "n4", need: "Hundmat" },
                        { id: "n5", need: "Rengöringsmedel" },
                        { id: "n6", need: "Tvål" },
                        { id: "n7", need: "Tandkräm" },
                        { id: "n8", need: "Toalettpapper" },
                    ]);
                } else {
                    setAvailableNeeds(dbNeeds);
                }
            } catch (error) {
                console.error("Error fetching additional needs:", error);
                // Fallback to dummy data
                setAvailableNeeds([
                    { id: "n1", need: "Blöjor" },
                    { id: "n2", need: "Tamponger/bindor" },
                    { id: "n3", need: "Kattmat" },
                    { id: "n4", need: "Hundmat" },
                    { id: "n5", need: "Rengöringsmedel" },
                    { id: "n6", need: "Tvål" },
                    { id: "n7", need: "Tandkräm" },
                    { id: "n8", need: "Toalettpapper" },
                ]);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

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
                    <Text>Laddar ytterligare behov...</Text>
                </Group>
            </Card>
        );
    }

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                Ytterligare behov
            </Title>
            <Text color="dimmed" size="sm" mb="lg">
                Välj ytterligare behov som hushållet kan ha. Du kan välja från listan eller lägga
                till egna behov.
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
                Lägg till nytt behov
            </Title>
            <form onSubmit={form.onSubmit(addCustomNeed)}>
                <Group align="flex-end">
                    <TextInput
                        label="Nytt behov"
                        placeholder="T.ex. Rakhyvlar, Schampo, etc."
                        style={{ flex: 1 }}
                        {...form.getInputProps("newNeed")}
                    />
                    <Button
                        type="submit"
                        leftSection={<IconPlus size="1rem" />}
                        variant="light"
                        color="teal"
                    >
                        Lägg till
                    </Button>
                </Group>
            </form>
        </Card>
    );
}
