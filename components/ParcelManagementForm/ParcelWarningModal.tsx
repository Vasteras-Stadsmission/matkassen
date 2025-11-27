"use client";

import { Modal, Text, Button, Group, Checkbox, Alert, Stack } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

interface ParcelWarningModalProps {
    opened: boolean;
    onClose: () => void;
    onConfirm: () => void;
    parcelCount: number;
    threshold: number;
    householdName: string;
}

export function ParcelWarningModal({
    opened,
    onClose,
    onConfirm,
    parcelCount,
    threshold,
    householdName,
}: ParcelWarningModalProps) {
    const t = useTranslations("parcelWarning");
    const [acknowledged, setAcknowledged] = useState(false);

    const handleConfirm = () => {
        onConfirm();
        setAcknowledged(false); // Reset for next time
    };

    const handleClose = () => {
        onClose();
        setAcknowledged(false); // Reset checkbox when closing
    };

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title={t("modal.title")}
            centered
            size="md"
            closeOnClickOutside={false}
        >
            <Stack gap="md">
                <Alert icon={<IconAlertTriangle />} color="orange" variant="light">
                    <Text size="sm">
                        {t("modal.message", {
                            householdName,
                            count: parcelCount,
                            threshold,
                        })}
                    </Text>
                </Alert>

                <Text size="sm" c="dimmed">
                    {t("modal.explanation")}
                </Text>

                <Checkbox
                    checked={acknowledged}
                    onChange={event => setAcknowledged(event.currentTarget.checked)}
                    label={t("modal.acknowledgmentLabel")}
                />

                <Group justify="flex-end" mt="md">
                    <Button variant="outline" onClick={handleClose}>
                        {t("modal.cancelButton")}
                    </Button>
                    <Button onClick={handleConfirm} disabled={!acknowledged} color="orange">
                        {t("modal.confirmButton")}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
