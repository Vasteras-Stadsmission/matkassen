"use client";

// NOTE: Using 'as any' for translation keys due to type generation timing issues
// These should resolve once Next.js regenerates types from messages/en.json
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { Modal, Button, TextInput, Stack, Text, Alert } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { notifications } from "@mantine/notifications";
import { removeHouseholdAction } from "../actions/remove-household";
import { useRouter } from "@/app/i18n/navigation";

interface RemoveHouseholdDialogProps {
    householdId: string;
    householdLastName: string;
    opened: boolean;
    onClose: () => void;
}

export function RemoveHouseholdDialog({
    householdId,
    householdLastName,
    opened,
    onClose,
}: RemoveHouseholdDialogProps) {
    const t = useTranslations("householdDetail");
    const [lastNameInput, setLastNameInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleRemove = async () => {
        setLoading(true);
        setError(null);

        const result = await removeHouseholdAction({
            householdId,
            lastNameConfirmation: lastNameInput,
        });

        setLoading(false);

        if (result.success) {
            notifications.show({
                title: t("removal.success" as any),
                message: "",
                color: "green",
            });
            onClose();
            // Redirect to households list
            router.push("/households");
        } else {
            // Handle different error types
            if (result.error.code === "HAS_UPCOMING_PARCELS") {
                // Extract count from message
                const match = result.error.message.match(/(\d+) upcoming/);
                const count = match ? parseInt(match[1]) : 0;
                setError(t("removal.errors.upcomingParcelsMessage" as any, { count } as any));
            } else if (result.error.code === "CONFIRMATION_MISMATCH") {
                setError(t("removal.errors.lastNameMismatch" as any));
            } else if (result.error.code === "ALREADY_ANONYMIZED") {
                setError(t("removal.errors.alreadyRemoved" as any));
            } else {
                setError(t("removal.errors.removalFailed" as any));
            }
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={t("removal.dialogTitle" as any)}
            size="md"
            centered
            closeOnClickOutside={!loading}
            closeOnEscape={!loading}
        >
            <Stack gap="md">
                {error && (
                    <Alert
                        color="red"
                        title={
                            error.includes("upcoming")
                                ? t("removal.errors.hasUpcomingParcels" as any)
                                : undefined
                        }
                        icon={<IconAlertTriangle size={16} />}
                    >
                        {error}
                        {error.includes("upcoming") && (
                            <Text size="sm" mt="xs">
                                {t("removal.errors.upcomingParcelsAction" as any)}
                            </Text>
                        )}
                    </Alert>
                )}

                <div>
                    <Text size="sm" fw={500} mb={4}>
                        {t("removal.lastName" as any)}: {householdLastName}
                    </Text>
                    <Text size="sm" c="dimmed" mb="xs">
                        {t("removal.confirmationPrompt" as any)}
                    </Text>
                    <Text size="xs" c="dimmed" mb="sm">
                        {t("removal.confirmationHelp" as any)}
                    </Text>
                    <TextInput
                        value={lastNameInput}
                        onChange={e => setLastNameInput(e.target.value)}
                        placeholder={householdLastName}
                        disabled={loading}
                        data-autofocus
                    />
                </div>

                <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
                    <Text size="sm">{t("removal.warningCannotUndo" as any)}</Text>
                </Alert>

                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                    <Button variant="default" onClick={onClose} disabled={loading}>
                        {t("removal.cancelButton" as any)}
                    </Button>
                    <Button
                        color="red"
                        onClick={handleRemove}
                        loading={loading}
                        disabled={lastNameInput.trim().length === 0}
                    >
                        {loading ? t("removal.removing" as any) : t("removal.removeButton" as any)}
                    </Button>
                </div>
            </Stack>
        </Modal>
    );
}
