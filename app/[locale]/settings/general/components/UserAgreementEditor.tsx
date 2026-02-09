"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Container,
    Title,
    Text,
    Button,
    Stack,
    Card,
    Group,
    Textarea,
    LoadingOverlay,
    Alert,
    TypographyStylesProvider,
    Badge,
    Table,
} from "@mantine/core";
import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import {
    getCurrentUserAgreement,
    getAllUserAgreements,
    saveUserAgreement,
    type UserAgreementWithStats,
} from "../actions";
import { markdownToHtml } from "@/app/utils/markdown-to-html";

export function UserAgreementEditor() {
    const t = useTranslations("settings.userAgreement");

    const [currentAgreement, setCurrentAgreement] = useState<UserAgreementWithStats | null>(null);
    const [allAgreements, setAllAgreements] = useState<UserAgreementWithStats[]>([]);
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const loadAgreements = useCallback(async () => {
        setLoading(true);
        try {
            const [currentResult, allResult] = await Promise.all([
                getCurrentUserAgreement(),
                getAllUserAgreements(),
            ]);

            if (currentResult.success) {
                setCurrentAgreement(currentResult.data);
                setContent(currentResult.data?.content || "");
            }

            if (allResult.success) {
                setAllAgreements(allResult.data || []);
            }
        } catch {
            notifications.show({
                title: t("notifications.error"),
                message: t("notifications.loadError"),
                color: "red",
            });
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        loadAgreements();
    }, [loadAgreements]);

    const handleSave = async () => {
        if (!content?.trim()) {
            notifications.show({
                title: t("notifications.error"),
                message: t("notifications.emptyContent"),
                color: "red",
            });
            return;
        }

        setSaving(true);
        try {
            const result = await saveUserAgreement({ content });

            if (result.success) {
                notifications.show({
                    title: t("notifications.success"),
                    message: t("notifications.saved"),
                    color: "green",
                });
                // Reload to get updated data including acceptance count
                await loadAgreements();
            } else {
                notifications.show({
                    title: t("notifications.error"),
                    message: t("notifications.saveError"),
                    color: "red",
                });
            }
        } catch {
            notifications.show({
                title: t("notifications.error"),
                message: t("notifications.saveError"),
                color: "red",
            });
        } finally {
            setSaving(false);
        }
    };

    const hasChanges = currentAgreement?.content !== content;

    return (
        <Container size="md" py="md">
            <Stack gap="lg">
                <div>
                    <Title order={2}>{t("title")}</Title>
                    <Text c="dimmed" mt="xs">
                        {t("description")}
                    </Text>
                </div>

                {currentAgreement && (
                    <Group gap="xs">
                        <Badge variant="light" color="blue">
                            {t("currentVersion", { version: String(currentAgreement.version) })}
                        </Badge>
                        <Badge variant="light" color="green">
                            {t("acceptedBy", { count: String(currentAgreement.acceptanceCount) })}
                        </Badge>
                    </Group>
                )}

                {!currentAgreement && !loading && (
                    <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                        {t("noAgreement")}
                    </Alert>
                )}

                <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light">
                    <Text size="sm">{t("publishWarning")}</Text>
                </Alert>

                <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                    <Text size="sm">{t("markdownHint")}</Text>
                </Alert>

                <div style={{ position: "relative" }}>
                    <LoadingOverlay visible={loading} />

                    {showPreview ? (
                        <Card withBorder padding="md">
                            <Text fw={500} mb="md">
                                {t("preview")}
                            </Text>
                            <TypographyStylesProvider>
                                <div
                                    dangerouslySetInnerHTML={{
                                        __html: markdownToHtml(content || ""),
                                    }}
                                />
                            </TypographyStylesProvider>
                        </Card>
                    ) : (
                        <Textarea
                            placeholder={t("placeholder")}
                            minRows={15}
                            autosize
                            value={content}
                            onChange={e => setContent(e.target.value)}
                        />
                    )}

                    <Group justify="space-between" mt="md">
                        <Group gap="xs">
                            <Button variant="subtle" onClick={() => setShowPreview(!showPreview)}>
                                {showPreview ? t("buttons.edit") : t("buttons.preview")}
                            </Button>
                            {allAgreements.length > 0 && (
                                <Button
                                    variant="subtle"
                                    onClick={() => setShowHistory(!showHistory)}
                                >
                                    {showHistory
                                        ? t("buttons.hideHistory")
                                        : t("buttons.showHistory")}
                                </Button>
                            )}
                        </Group>
                        <Button
                            onClick={handleSave}
                            loading={saving}
                            disabled={!hasChanges || !content.trim()}
                        >
                            {currentAgreement ? t("buttons.publish") : t("buttons.create")}
                        </Button>
                    </Group>
                </div>

                {showHistory && allAgreements.length > 0 && (
                    <Card withBorder padding="md">
                        <Text fw={500} mb="md">
                            {t("versionHistory")}
                        </Text>
                        <Table>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>{t("table.version")}</Table.Th>
                                    <Table.Th>{t("table.createdAt")}</Table.Th>
                                    <Table.Th>{t("table.createdBy")}</Table.Th>
                                    <Table.Th>{t("table.acceptedBy")}</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {allAgreements.map(agreement => (
                                    <Table.Tr key={agreement.id}>
                                        <Table.Td>
                                            <Badge
                                                variant={
                                                    agreement.id === currentAgreement?.id
                                                        ? "filled"
                                                        : "light"
                                                }
                                                color="blue"
                                            >
                                                v{agreement.version}
                                            </Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            {new Date(agreement.createdAt).toLocaleDateString(
                                                "sv-SE",
                                            )}
                                        </Table.Td>
                                        <Table.Td>{agreement.createdBy || "-"}</Table.Td>
                                        <Table.Td>{agreement.acceptanceCount}</Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Card>
                )}
            </Stack>
        </Container>
    );
}
