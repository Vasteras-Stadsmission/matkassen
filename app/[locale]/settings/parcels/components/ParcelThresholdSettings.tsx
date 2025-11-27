"use client";

import { useState, useEffect } from "react";
import {
    Container,
    Title,
    Text,
    Button,
    Stack,
    Card,
    NumberInput,
    Alert,
    Group,
    LoadingOverlay,
} from "@mantine/core";
import { IconAlertCircle, IconInfoCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { getParcelWarningThreshold, updateParcelWarningThreshold } from "../actions";

export function ParcelThresholdSettings() {
    const t = useTranslations("settings.parcelThreshold");
    const [threshold, setThreshold] = useState<number | string>("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Load current threshold on mount
    useEffect(() => {
        async function loadThreshold() {
            setLoading(true);
            const result = await getParcelWarningThreshold();
            if (result.success) {
                setThreshold(result.data.threshold ?? "");
            } else {
                notifications.show({
                    title: t("errors.loadFailedTitle"),
                    message: t("errors.loadFailedMessage"),
                    color: "red",
                });
            }
            setLoading(false);
        }
        loadThreshold();
    }, [t]);

    const handleSave = async () => {
        setSaving(true);
        const thresholdValue = threshold === "" ? null : Number(threshold);

        const result = await updateParcelWarningThreshold(thresholdValue);
        if (result.success) {
            notifications.show({
                title: t("success.savedTitle"),
                message: t("success.savedMessage"),
                color: "green",
            });
        } else {
            notifications.show({
                title: t("errors.saveFailedTitle"),
                message: result.error?.message || t("errors.saveFailedMessage"),
                color: "red",
            });
        }
        setSaving(false);
    };

    const handleClear = async () => {
        setSaving(true);
        const result = await updateParcelWarningThreshold(null);
        if (result.success) {
            setThreshold("");
            notifications.show({
                title: t("success.savedTitle"),
                message: t("success.clearedMessage"),
                color: "green",
            });
        } else {
            notifications.show({
                title: t("errors.saveFailedTitle"),
                message: result.error?.message || t("errors.saveFailedMessage"),
                color: "red",
            });
        }
        setSaving(false);
    };

    return (
        <Container size="md" py="xl">
            <Stack gap="lg">
                <div>
                    <Title order={1}>{t("title")}</Title>
                    <Text c="dimmed" mt="xs">
                        {t("description")}
                    </Text>
                </div>

                <Alert icon={<IconInfoCircle />} color="blue" variant="light">
                    {t("infoMessage")}
                </Alert>

                <Card shadow="sm" padding="lg" withBorder pos="relative">
                    <LoadingOverlay visible={loading} />
                    <Stack gap="md">
                        <NumberInput
                            label={t("thresholdLabel")}
                            description={t("thresholdDescription")}
                            placeholder={t("thresholdPlaceholder")}
                            value={threshold}
                            onChange={setThreshold}
                            min={0}
                            disabled={loading || saving}
                            allowNegative={false}
                            allowDecimal={false}
                        />

                        {threshold !== "" && (
                            <Alert icon={<IconAlertCircle />} color="orange" variant="light">
                                {t("warningPreview", { threshold: Number(threshold) })}
                            </Alert>
                        )}

                        <Group>
                            <Button onClick={handleSave} loading={saving} disabled={loading}>
                                {t("saveButton")}
                            </Button>
                            <Button
                                onClick={handleClear}
                                variant="outline"
                                disabled={loading || saving || threshold === ""}
                            >
                                {t("clearButton")}
                            </Button>
                        </Group>
                    </Stack>
                </Card>
            </Stack>
        </Container>
    );
}
