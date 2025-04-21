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
import { getDietaryRestrictions } from "../actions";
import { DietaryRestriction } from "../types";

interface DietaryRestrictionsFormProps {
    data: DietaryRestriction[];
    updateData: (data: DietaryRestriction[]) => void;
}

export default function DietaryRestrictionsForm({
    data,
    updateData,
}: DietaryRestrictionsFormProps) {
    const [availableRestrictions, setAvailableRestrictions] = useState<DietaryRestriction[]>([]);
    const [loading, setLoading] = useState(true);
    const [newRestriction, setNewRestriction] = useState<DietaryRestriction | null>(null);
    const [restrictionToDelete, setRestrictionToDelete] = useState<DietaryRestriction | null>(null);
    const [confirmModalOpened, { open: openConfirmModal, close: closeConfirmModal }] =
        useDisclosure(false);
    const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] =
        useDisclosure(false);

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
                if (dbRestrictions.length > 0) {
                    setAvailableRestrictions(dbRestrictions);
                } else {
                    console.error("No dietary restrictions found in the database");
                    setAvailableRestrictions([]);
                }
            } catch (error) {
                console.error("Error fetching dietary restrictions:", error);
                setAvailableRestrictions([]);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    // Make sure to include any custom restrictions that are already in the data array
    useEffect(() => {
        if (!loading && data.length > 0) {
            const newAvailable = [...availableRestrictions];
            let updated = false;

            // Add any restrictions from data that aren't in availableRestrictions
            data.forEach(restriction => {
                const exists = availableRestrictions.some(r => r.id === restriction.id);
                if (!exists) {
                    newAvailable.push(restriction);
                    updated = true;
                }
            });

            if (updated) {
                setAvailableRestrictions(newAvailable);
            }
        }
    }, [data, loading, availableRestrictions]);

    // Check if a restriction is selected
    const isSelected = (id: string) => data.some(item => item.id === id);

    // Toggle a restriction
    const toggleRestriction = (id: string) => {
        if (isSelected(id)) {
            const updated = data.filter(item => item.id !== id);
            updateData(updated);
        } else {
            const restriction = availableRestrictions.find(item => item.id === id);
            if (restriction) {
                const updated = [...data, restriction];
                updateData(updated);
            }
        }
    };

    // Create a new custom restriction and open the confirmation modal
    const createCustomRestriction = (values: { newRestriction: string }) => {
        const restriction: DietaryRestriction = {
            id: nanoid(8),
            name: values.newRestriction,
            isCustom: true,
        };

        setNewRestriction(restriction);
        openConfirmModal();
    };

    // Confirm and add the new custom restriction
    const confirmCustomRestriction = () => {
        if (!newRestriction) return;

        // Add to both available restrictions and selected restrictions
        const updatedAvailable = [...availableRestrictions, newRestriction];
        setAvailableRestrictions(updatedAvailable);

        const updatedSelected = [...data, newRestriction];
        updateData(updatedSelected);

        form.reset();
        closeConfirmModal();
        setNewRestriction(null);
    };

    // Initiate the deletion of a restriction by opening a confirmation modal
    const initiateRemoveRestriction = (restriction: DietaryRestriction, e: React.MouseEvent) => {
        e.stopPropagation();
        setRestrictionToDelete(restriction);
        openDeleteModal();
    };

    // Confirm and remove a restriction entirely from the available list
    const confirmRemoveRestriction = () => {
        if (!restrictionToDelete) return;

        const updatedAvailable = availableRestrictions.filter(
            item => item.id !== restrictionToDelete.id,
        );
        setAvailableRestrictions(updatedAvailable);

        const updatedSelected = data.filter(item => item.id !== restrictionToDelete.id);
        updateData(updatedSelected);

        closeDeleteModal();
        setRestrictionToDelete(null);
    };

    if (loading) {
        return (
            <Card withBorder p="md" radius="md">
                <Group justify="center" py="xl">
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
            <Text c="dimmed" size="sm" mb="lg">
                Välj matrestriktioner som gäller för hushållet. Du kan välja från listan eller lägga
                till egna restriktioner.
            </Text>

            <Group mt="md">
                {availableRestrictions.map(restriction => (
                    <Chip
                        key={restriction.id}
                        checked={isSelected(restriction.id)}
                        onChange={() => toggleRestriction(restriction.id)}
                        variant={isSelected(restriction.id) ? "filled" : "outline"}
                        color={isSelected(restriction.id) ? "blue" : "gray"}
                        radius="sm"
                    >
                        {restriction.name}
                        {restriction.isCustom && (
                            <ActionIcon
                                size="xs"
                                color="red"
                                ml={5}
                                onClick={e => initiateRemoveRestriction(restriction, e)}
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
            <form onSubmit={form.onSubmit(createCustomRestriction)}>
                <Group align="flex-end">
                    <TextInput
                        label="Ny matrestriktion"
                        placeholder="T.ex. Jordgubbar, Soja, etc."
                        style={{ flex: 1 }}
                        {...form.getInputProps("newRestriction")}
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

            {/* Confirmation modal for adding new dietary restriction */}
            <Modal
                opened={confirmModalOpened}
                onClose={closeConfirmModal}
                title={
                    <Group>
                        <IconAlertCircle size="1.3rem" color="orange" />
                        <Text fw={600}>Lägg till matrestriktion</Text>
                    </Group>
                }
                centered
            >
                <Stack>
                    <Text>Vill du lägga till följande matrestriktion i din ansökan?</Text>

                    <Text fw={600} size="lg" ta="center">
                        "{newRestriction?.name}"
                    </Text>

                    <Group justify="apart" mt="md">
                        <Button variant="outline" onClick={closeConfirmModal}>
                            Avbryt
                        </Button>
                        <Button color="green" onClick={confirmCustomRestriction}>
                            Lägg till
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Confirmation modal for deleting a dietary restriction */}
            <Modal
                opened={deleteModalOpened}
                onClose={closeDeleteModal}
                title={
                    <Group>
                        <IconAlertCircle size="1.3rem" color="red" />
                        <Text fw={600}>Ta bort matrestriktion</Text>
                    </Group>
                }
                centered
            >
                <Stack>
                    <Text>Vill du ta bort följande matrestriktion från din ansökan?</Text>

                    <Text fw={600} size="lg" ta="center">
                        "{restrictionToDelete?.name}"
                    </Text>

                    <Group justify="apart" mt="md">
                        <Button variant="outline" onClick={closeDeleteModal}>
                            Avbryt
                        </Button>
                        <Button color="red" onClick={confirmRemoveRestriction}>
                            Ta bort
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Card>
    );
}