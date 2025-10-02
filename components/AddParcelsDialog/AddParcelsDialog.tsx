"use client";

import { Modal, Title, Text, Group, Button } from "@mantine/core";
import { IconPackage, IconX } from "@tabler/icons-react";
import { useRouter } from "@/app/i18n/navigation";

interface AddParcelsDialogProps {
    opened: boolean;
    onClose: () => void;
    householdId: string;
    householdName: string;
}

export function AddParcelsDialog({
    opened,
    onClose,
    householdId,
    householdName,
}: AddParcelsDialogProps) {
    const router = useRouter();

    const handleAddParcels = () => {
        router.push(`/households/${householdId}/parcels`);
        onClose();
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group gap="sm">
                    <IconPackage size="1.2rem" />
                    <Title order={3}>Add Food Parcels</Title>
                </Group>
            }
            centered
            size="md"
        >
            <Text mb="md">
                Household <strong>{householdName}</strong> has been created successfully!
            </Text>
            <Text mb="lg" c="dimmed">
                Would you like to add food parcel scheduling for this household now?
            </Text>

            <Group justify="flex-end" gap="sm">
                <Button variant="subtle" onClick={onClose} leftSection={<IconX size="1rem" />}>
                    Later
                </Button>
                <Button
                    onClick={handleAddParcels}
                    leftSection={<IconPackage size="1rem" />}
                    color="blue"
                >
                    Add Parcels
                </Button>
            </Group>
        </Modal>
    );
}
