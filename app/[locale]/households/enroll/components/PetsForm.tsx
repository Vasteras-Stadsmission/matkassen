"use client";

import { useState, useEffect } from "react";
import {
    Group,
    Button,
    Title,
    Text,
    Card,
    TextInput,
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
import { Pet, PetSpecies } from "../types";
import { useTranslations } from "next-intl";

interface PetsFormProps {
    data: Pet[];
    updateData: (data: Pet[]) => void;
}

export default function PetsForm({ data, updateData }: PetsFormProps) {
    const t = useTranslations("pets");

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

    // Keep a mapping of species ID to name for persistence
    const [speciesNameMap, setSpeciesNameMap] = useState<Record<string, string>>({});

    const form = useForm({
        initialValues: {
            newPetType: "",
        },
        validate: {
            newPetType: value => (!value || value.length < 2 ? t("validation.minLength") : null),
        },
        validateInputOnBlur: true, // Only validate when field loses focus
        validateInputOnChange: false, // Don't validate while typing
    });

    // Fetch pet species from the database
    useEffect(() => {
        const fetchPetSpecies = async () => {
            try {
                const species = await getPetSpecies();

                if (species.length > 0) {
                    setPetTypes(species);

                    // Initialize counts based on the fetched species
                    const counts: Record<string, number> = {};
                    const names: Record<string, string> = {};

                    species.forEach(type => {
                        counts[type.id] = 0;
                        names[type.id] = type.name;
                    });

                    // Set initial counts from data
                    data.forEach(pet => {
                        if (counts.hasOwnProperty(pet.species)) {
                            counts[pet.species] = pet.count || 0;
                        }

                        // If pet has a stored species name, use it to update the mapping
                        if (pet.speciesName) {
                            names[pet.species] = pet.speciesName;
                        }
                    });

                    setPetCounts(counts);
                    setSpeciesNameMap(names);
                } else {
                    console.error("No pet species found in the database");
                    setPetTypes([]);
                    setPetCounts({});
                }
            } catch (error) {
                console.error("Error fetching pet species:", error);
                setPetTypes([]);
                setPetCounts({});
            } finally {
                setIsLoading(false);
            }
        };

        fetchPetSpecies();
    }, [data]); // Added data dependency

    // Make sure to include any custom pet types that are already in the data array
    useEffect(() => {
        if (!isLoading && data.length > 0) {
            const newTypes = [...petTypes];
            const newSpeciesNames = { ...speciesNameMap };
            let updated = false;

            // Add any pet types from data that aren't in petTypes
            data.forEach(pet => {
                const exists = petTypes.some(type => type.id === pet.species);
                if (!exists) {
                    // Find or create a pet type
                    // If pet has a speciesName, use it, otherwise generate a default name
                    const petName =
                        pet.speciesName ||
                        t("defaultPetType", {
                            index: String(newTypes.length + 1),
                        });

                    newTypes.push({
                        id: pet.species,
                        name: petName,
                        isCustom: true,
                    });

                    // Store the name in our mapping
                    newSpeciesNames[pet.species] = petName;

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
                setSpeciesNameMap(newSpeciesNames);
            }
        }
    }, [data, isLoading, petTypes, speciesNameMap, t]);

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
                // Get the species name from our mapping
                const speciesName =
                    speciesNameMap[species] ||
                    petTypes.find(type => type.id === species)?.name ||
                    t("unknownPetType");

                petsData.push({
                    id: existingPet?.id || nanoid(8),
                    species,
                    speciesName, // Save the name with the pet data for persistence
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

        // Add to species name mapping
        setSpeciesNameMap(prev => ({
            ...prev,
            [newPetType.id]: newPetType.name,
        }));

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

        // Remove from species name mapping
        const updatedSpeciesNameMap = { ...speciesNameMap };
        delete updatedSpeciesNameMap[petTypeToDelete.id];
        setSpeciesNameMap(updatedSpeciesNameMap);

        // Update saved data
        updatePetsData(updatedCounts);

        closeDeleteModal();
        setPetTypeToDelete(null);
    };

    if (isLoading) {
        return (
            <Card withBorder p="md" radius="md">
                <Title order={3} mb="md">
                    {t("title")}
                </Title>
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

            <Stack gap="md">
                {petTypes.map(petType => (
                    <Group
                        key={petType.id}
                        justify="apart"
                        gap="xs"
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
                {t("addNew")}
            </Title>
            <form onSubmit={form.onSubmit(createCustomPetType)}>
                <Group align="flex-end">
                    <TextInput
                        label={t("newPetType")}
                        placeholder={t("placeholderExample")}
                        style={{ flex: 1 }}
                        {...form.getInputProps("newPetType")}
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

            {/* Confirmation modal for adding new pet type */}
            <Modal
                opened={confirmModalOpened}
                onClose={closeConfirmModal}
                title={
                    <Group>
                        <IconAlertCircle size="1.3rem" color="orange" />
                        <Text fw={600}>{t("addConfirmTitle")}</Text>
                    </Group>
                }
                centered
            >
                <Stack>
                    <Text>{t("addConfirmQuestion")}</Text>

                    <Text fw={600} size="lg" ta="center">
                        "{newPetType?.name}"
                    </Text>

                    <Group justify="apart" mt="md">
                        <Button variant="outline" onClick={closeConfirmModal}>
                            {t("cancel")}
                        </Button>
                        <Button color="green" onClick={confirmCustomPetType}>
                            {t("add")}
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
                        <Text fw={600}>{t("removeConfirmTitle")}</Text>
                    </Group>
                }
                centered
            >
                <Stack>
                    <Text>{t("removeConfirmQuestion")}</Text>

                    <Text fw={600} size="lg" ta="center">
                        "{petTypeToDelete?.name}"
                    </Text>

                    <Group justify="apart" mt="md">
                        <Button variant="outline" onClick={closeDeleteModal}>
                            {t("cancel")}
                        </Button>
                        <Button color="red" onClick={confirmRemovePetType}>
                            {t("remove")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Card>
    );
}
