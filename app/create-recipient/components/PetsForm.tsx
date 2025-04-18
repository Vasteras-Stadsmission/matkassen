"use client";

import { useState } from "react";
import { SimpleGrid, Group, Button, Title, Text, Card, Select, ActionIcon } from "@mantine/core";
import { useForm } from "@mantine/form";
import { nanoid } from "@/app/db/schema";
import { IconPaw, IconTrash } from "@tabler/icons-react";

interface Pet {
    id?: string;
    species: "dog" | "cat" | "bunny" | "bird"; // Updated to match the schema enum
}

interface PetsFormProps {
    data: Pet[];
    updateData: (data: Pet[]) => void;
}

export default function PetsForm({ data, updateData }: PetsFormProps) {
    const [pets, setPets] = useState<Pet[]>(data || []);

    const form = useForm({
        initialValues: {
            species: "",
        },
        validate: {
            species: value => (!value ? "Välj djurart" : null),
        },
    });

    const addPet = (values: { species: string }) => {
        // Validate that species is one of the valid enum values
        if (!["dog", "cat", "bunny", "bird"].includes(values.species)) {
            form.setFieldError("species", "Ogiltig djurart");
            return;
        }

        const newPet: Pet = {
            id: nanoid(8),
            species: values.species as "dog" | "cat" | "bunny" | "bird",
        };

        const updatedPets = [...pets, newPet];
        setPets(updatedPets);
        updateData(updatedPets);
        form.reset();
    };

    const removePet = (index: number) => {
        const updatedPets = pets.filter((_, i) => i !== index);
        setPets(updatedPets);
        updateData(updatedPets);
    };

    const getSpeciesLabel = (species: string) => {
        switch (species) {
            case "dog":
                return "Hund";
            case "cat":
                return "Katt";
            case "bunny":
                return "Kanin";
            case "bird":
                return "Fågel";
            default:
                return species;
        }
    };

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                Husdjur
            </Title>
            <Text color="dimmed" size="sm" mb="lg">
                Registrera husdjur som finns i hushållet. Detta hjälper oss att anpassa
                matsortimentet.
            </Text>

            {pets.length > 0 && (
                <>
                    <Title order={5} mt="md" mb="xs">
                        Registrerade husdjur:
                    </Title>
                    {pets.map((pet, index) => (
                        <Group key={pet.id || index} mb="xs" justify="space-between">
                            <Group>
                                <IconPaw size="1.2rem" />
                                <Text>{getSpeciesLabel(pet.species)}</Text>
                            </Group>
                            <ActionIcon color="red" onClick={() => removePet(index)}>
                                <IconTrash size="1rem" />
                            </ActionIcon>
                        </Group>
                    ))}
                </>
            )}

            <form onSubmit={form.onSubmit(addPet)}>
                <Title order={5} mt="xl" mb="md">
                    Lägg till husdjur
                </Title>
                <SimpleGrid cols={{ base: 1, sm: 1 }}>
                    <Select
                        label="Djurart"
                        placeholder="Välj djurart"
                        data={[
                            { value: "dog", label: "Hund" },
                            { value: "cat", label: "Katt" },
                            { value: "bunny", label: "Kanin" },
                            { value: "bird", label: "Fågel" },
                        ]}
                        {...form.getInputProps("species")}
                    />
                </SimpleGrid>
                <Group justify="flex-end" mt="md">
                    <Button type="submit">Lägg till husdjur</Button>
                </Group>
            </form>
        </Card>
    );
}
