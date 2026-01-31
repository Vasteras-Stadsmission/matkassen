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
    Switch,
} from "@mantine/core";
import { IconAlertCircle, IconInfoCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { getNoShowFollowupSettings, updateNoShowFollowupSettings } from "../actions";

export function NoShowFollowupSettings() {
    const t = useTranslations("settings.noshowFollowup");
    const [enabled, setEnabled] = useState(true);
    const [consecutiveThreshold, setConsecutiveThreshold] = useState<number | string>(2);
    const [totalThreshold, setTotalThreshold] = useState<number | string>(4);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Load current settings on mount
    useEffect(() => {
        async function loadSettings() {
            setLoading(true);
            try {
                const result = await getNoShowFollowupSettings();
                if (result.success) {
                    setEnabled(result.data.enabled);
                    setConsecutiveThreshold(result.data.consecutiveThreshold ?? 2);
                    setTotalThreshold(result.data.totalThreshold ?? 4);
                } else {
                    notifications.show({
                        title: t("errors.loadFailedTitle"),
                        message: t("errors.loadFailedMessage"),
                        color: "red",
                    });
                }
            } catch {
                notifications.show({
                    title: t("errors.loadFailedTitle"),
                    message: t("errors.loadFailedMessage"),
                    color: "red",
                });
            } finally {
                setLoading(false);
            }
        }
        loadSettings();
    }, [t]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const consecutiveValue =
                consecutiveThreshold === "" ? null : Number(consecutiveThreshold);
            const totalValue = totalThreshold === "" ? null : Number(totalThreshold);

            const result = await updateNoShowFollowupSettings({
                enabled,
                consecutiveThreshold: consecutiveValue,
                totalThreshold: totalValue,
            });

            if (result.success) {
                notifications.show({
                    title: t("success.savedTitle"),
                    message: t("success.savedMessage"),
                    color: "green",
                });
            } else {
                notifications.show({
                    title: t("errors.saveFailedTitle"),
                    message: t("errors.saveFailedMessage"),
                    color: "red",
                });
            }
        } catch {
            notifications.show({
                title: t("errors.saveFailedTitle"),
                message: t("errors.saveFailedMessage"),
                color: "red",
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Container size="md" py="md">
            <Stack gap="lg">
                <div>
                    <Title order={2}>{t("title")}</Title>
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
                        <Switch
                            label={t("enabledLabel")}
                            description={t("enabledDescription")}
                            checked={enabled}
                            onChange={event => setEnabled(event.currentTarget.checked)}
                            disabled={loading || saving}
                            size="md"
                        />

                        {enabled && (
                            <>
                                <NumberInput
                                    label={t("consecutiveLabel")}
                                    description={t("consecutiveDescription")}
                                    placeholder={t("consecutivePlaceholder")}
                                    value={consecutiveThreshold}
                                    onChange={setConsecutiveThreshold}
                                    min={1}
                                    max={10}
                                    disabled={loading || saving}
                                    allowNegative={false}
                                    allowDecimal={false}
                                />

                                <NumberInput
                                    label={t("totalLabel")}
                                    description={t("totalDescription")}
                                    placeholder={t("totalPlaceholder")}
                                    value={totalThreshold}
                                    onChange={setTotalThreshold}
                                    min={1}
                                    max={50}
                                    disabled={loading || saving}
                                    allowNegative={false}
                                    allowDecimal={false}
                                />

                                {(consecutiveThreshold !== "" || totalThreshold !== "") && (
                                    <Alert
                                        icon={<IconAlertCircle />}
                                        color="orange"
                                        variant="light"
                                    >
                                        {t("preview", {
                                            consecutive: String(consecutiveThreshold || "-"),
                                            total: String(totalThreshold || "-"),
                                        })}
                                    </Alert>
                                )}
                            </>
                        )}

                        <Group>
                            <Button onClick={handleSave} loading={saving} disabled={loading}>
                                {t("saveButton")}
                            </Button>
                        </Group>
                    </Stack>
                </Card>
            </Stack>
        </Container>
    );
}
