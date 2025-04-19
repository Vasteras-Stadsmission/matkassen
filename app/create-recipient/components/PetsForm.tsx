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
    Modal,
    Stack,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { nanoid } from "@/app/db/schema";
import { IconPlus, IconTrash, IconAlertCircle } from "@tabler/icons-react";
import { getPetSpecies } from "../actions";
import CounterInput from "@/components/CounterInput";

interface PetSpecies {
    id: string;
    name: string;
    isCustom?: boolean;
}

interface Pet {
    id?: string;
    species: string;
    count: number;
}

interface PetsFormProps {
    data: Pet[];
    updateData: (data: Pet[]) => void;
}

export default function PetsForm({ data, updateData }: PetsFormProps) {
    // State for pet species fetched from the database
    const [petTypes, setPetTypes] = useState<PetSpecies[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newPetType, setNewPetType] = useState<PetSpecies | null>(null);
    const [petTypeToDelete, setPetTypeToDelete] = useState<PetSpecies | null>(null);
    const [confirmModalOpened, { open: openConfirmModal, close: closeConfirmModal }] =
        useDisclosure(false);
    const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] =
        useDisclosure(false);

    // Initialize counters for each pet type
    const [petCounts, setPetCounts] = useState<Record<string, number>>({});

    const form = useForm({
        initialValues: {
            newPetType: "",
        },
        validate: {
            newPetType: value =>
                !value || value.length < 2 ? "Djurtypen måste vara minst 2 tecken" : null,
        },
    });

    // Fetch pet species from the database
    useEffect(() => {
        const fetchPetSpecies = async () => {
            try {
                const species = await getPetSpecies();

                // If we don't have any species in the DB, use dummy data
                if (species.length === 0) {
                    const dummySpecies = [
                        { id: "p1", name: "Hund" },
                        { id: "p2", name: "Katt" },
                        { id: "p3", name: "Kanin" },
                        { id: "p4", name: "Fågel" },
                        { id: "p5", name: "Fisk" },
                        { id: "p6", name: "Hamster" },
                    ];
                    setPetTypes(dummySpecies);

                    // Initialize counts based on the dummy species
                    const counts: Record<string, number> = {};
                    dummySpecies.forEach(type => {
                        counts[type.id] = 0;
                    });

                    // Set initial counts from data
                    data.forEach(pet => {
                        if (counts.hasOwnProperty(pet.species)) {
                            counts[pet.species] = pet.count || 0;
                        }
                    });

                    setPetCounts(counts);
                } else {
                    setPetTypes(species);

                    // Initialize counts based on the fetched species
                    const counts: Record<string, number> = {};
                    species.forEach(type => {
                        counts[type.id] = 0;
                    });

                    // Set initial counts from data
                    data.forEach(pet => {
                        if (counts.hasOwnProperty(pet.species)) {
                            counts[pet.species] = pet.count || 0;
                        }
                    });

                    setPetCounts(counts);
                }
            } catch (error) {
                console.error("Error fetching pet species:", error);
                // Fallback to dummy data
                const dummySpecies = [
                    { id: "p1", name: "Hund" },
                    { id: "p2", name: "Katt" },
                    { id: "p3", name: "Kanin" },
                    { id: "p4", name: "Fågel" },
                    { id: "p5", name: "Fisk" },
                    { id: "p6", name: "Hamster" },
                ];
                setPetTypes(dummySpecies);

                // Initialize counts based on the dummy species
                const counts: Record<string, number> = {};
                dummySpecies.forEach(type => {
                    counts[type.id] = 0;
                });

                // Set initial counts from data
                data.forEach(pet => {
                    if (counts.hasOwnProperty(pet.species)) {
                        counts[pet.species] = pet.count || 0;
                    }
                });

                setPetCounts(counts);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPetSpecies();
    }, [data]);

    // Make sure to include any custom pet types that are already in the data array
    useEffect(() => {
        if (!isLoading && data.length > 0) {
            const newTypes = [...petTypes];
            let updated = false;

            // Add any pet types from data that aren't in petTypes
            data.forEach(pet => {
                const exists = petTypes.some(type => type.id === pet.species);
                if (!exists) {
                    // Find or create a pet type
                    const existingType = petTypes.find(t => t.id === pet.species);
                    if (existingType) {
                        newTypes.push(existingType);
                    } else {
                        newTypes.push({
                            id: pet.species,
                            name: `Djurtyp ${newTypes.length + 1}`,
                            isCustom: true,
                        });
                    }
                    updated = true;

                    // Update counter
                    setPetCounts(prev => ({
                        ...prev,
                        [pet.species]: pet.count,
                    }));
                }
            });

            if (updated) {
                setPetTypes(newTypes);
            }
        }
    }, [data, isLoading, petTypes]);

    // Function to set count directly for a specific pet type
    const setCount = (petTypeId: string, value: number) => {
        const count = Math.max(0, value); // Ensure count is not negative
        const updatedCounts = { ...petCounts, [petTypeId]: count };
        setPetCounts(updatedCounts);
        updatePetsData(updatedCounts);
    };

    // Convert counts to Pet array for data saving
    const updatePetsData = (counts: Record<string, number>) => {
        const petsData: Pet[] = [];

        // For each pet type with count > 0, create a Pet object
        Object.entries(counts).forEach(([species, count]) => {
            if (count > 0) {
                // Try to find existing pet of this species to preserve ID
                const existingPet = data.find(pet => pet.species === species);

                petsData.push({
                    id: existingPet?.id || nanoid(8),
                    species,
                    count,
                });
            }
        });

        updateData(petsData);
    };

    // Create a new custom pet type and open the confirmation modal
    const createCustomPetType = (values: { newPetType: string }) => {
        const petType: PetSpecies = {
            id: nanoid(8),
            name: values.newPetType,
            isCustom: true,
        };

        setNewPetType(petType);
        openConfirmModal();
    };

    // Confirm and add the new custom pet type
    const confirmCustomPetType = () => {
        if (!newPetType) return;

        // Add to pet types
        const updatedTypes = [...petTypes, newPetType];
        setPetTypes(updatedTypes);

        // Initialize counter for new pet type
        setPetCounts(prev => ({
            ...prev,
            [newPetType.id]: 0,
        }));

        form.reset();
        closeConfirmModal();
        setNewPetType(null);
    };

    // Initiate the deletion of a pet type by opening a confirmation modal
    const initiateRemovePetType = (petType: PetSpecies) => {
        setPetTypeToDelete(petType);
        openDeleteModal();
    };

    // Confirm and remove a pet type entirely
    const confirmRemovePetType = () => {
        if (!petTypeToDelete) return;

        const updatedTypes = petTypes.filter(type => type.id !== petTypeToDelete.id);
        setPetTypes(updatedTypes);

        // Remove from counters
        const updatedCounts = { ...petCounts };
        delete updatedCounts[petTypeToDelete.id];
        setPetCounts(updatedCounts);

        // Update saved data
        updatePetsData(updatedCounts);

        closeDeleteModal();
        setPetTypeToDelete(null);
    };

    if (isLoading) {
        return (
            <Card withBorder p="md" radius="md">
                <Title order={3} mb="md">
                    Husdjur
                </Title>
                <Group justify="center" py="xl">
                    <Loader size="md" />
                    <Text>Laddar husdjurstyper...</Text>
                </Group>
            </Card>
        );
    }

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                Husdjur
            </Title>
            <Text color="dimmed" size="sm" mb="lg">
                Registrera husdjur som finns i hushållet. Detta hjälper oss att anpassa
                matsortimentet.
            </Text>

            <Stack spacing="md">
                {petTypes.map(petType => (
                    <Group
                        key={petType.id}
                        position="apart"
                        spacing="xs"
                        style={{ borderBottom: "1px solid #f1f1f1", paddingBottom: "8px" }}
                    >
                        <Group>
                            <Text size="md" fw={500} w={150}>
                                {petType.name}
                            </Text>
                            {petType.isCustom && (
                                <ActionIcon
                                    size="sm"
                                    color="red"
                                    variant="subtle"
                                    onClick={() => initiateRemovePetType(petType)}
                                >
                                    <IconTrash size="0.9rem" />
                                </ActionIcon>
                            )}
                        </Group>
                        <CounterInput
                            value={petCounts[petType.id] || 0}
                            onChange={value => setCount(petType.id, value)}
                            min={0}
                            max={99}
                        />
                    </Group>
                ))}
            </Stack>

            <Title order={5} mt="xl" mb="md">
                Lägg till ny typ av husdjur
            </Title>
            <form onSubmit={form.onSubmit(createCustomPetType)}>
                <Group align="flex-end">
                    <TextInput
                        label="Ny typ av husdjur"
                        placeholder="T.ex. Marsvin, Ödla, etc."
                        style={{ flex: 1 }}
                        {...form.getInputProps("newPetType")}
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

            {/* Confirmation modal for adding new pet type */}
            <Modal
                opened={confirmModalOpened}
                onClose={closeConfirmModal}
                title={
                    <Group>
                        <IconAlertCircle size="1.3rem" color="orange" />
                        <Text fw={600}>Bekräfta ny husdjurstyp</Text>
                    </Group>
                }
                centered
            >
                <Stack>
                    <Text>
                        Du lägger till en ny husdjurstyp som kommer att sparas i databasen och vara
                        tillgänglig för alla andra hushåll också.
                    </Text>

                    <Text fw={600} size="lg" ta="center">
                        "{newPetType?.name}"
                    </Text>

                    <Text>
                        Är du säker på att namnet är korrekt stavat och att denna husdjurstyp
                        behöver läggas till?
                    </Text>

                    <Group justify="apart" mt="md">
                        <Button variant="outline" onClick={closeConfirmModal}>
                            Avbryt
                        </Button>
                        <Button color="green" onClick={confirmCustomPetType}>
                            Ja, lägg till
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Confirmation modal for deleting a pet type */}
            <Modal
                opened={deleteModalOpened}
                onClose={closeDeleteModal}
                title={
                    <Group>
                        <IconAlertCircle size="1.3rem" color="red" />
                        <Text fw={600}>Bekräfta borttagning</Text>
                    </Group>
                }
                centered
            >
                <Stack>
                    <Text>
                        Du håller på att ta bort en husdjurstyp från systemet. Detta kommer påverka
                        alla hushåll som har denna djurtyp.
                    </Text>

                    <Text fw={600} size="lg" ta="center">
                        "{petTypeToDelete?.name}"
                    </Text>

                    <Text>Är du säker på att du vill ta bort denna husdjurstyp permanent?</Text>

                    <Group justify="apart" mt="md">
                        <Button variant="outline" onClick={closeDeleteModal}>
                            Avbryt
                        </Button>
                        <Button color="red" onClick={confirmRemovePetType}>
                            Ja, ta bort
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Card>
    );
}
