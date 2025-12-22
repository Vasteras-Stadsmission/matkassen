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
    Tabs,
    Textarea,
    LoadingOverlay,
    Alert,
    Anchor,
    TypographyStylesProvider,
} from "@mantine/core";
import { IconExternalLink, IconInfoCircle } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import {
    getPrivacyPolicy,
    savePrivacyPolicy,
    type PrivacyPolicy,
} from "../actions";

// Simple markdown to HTML converter for preview
// Supports: headers, bold, italic, lists, links, paragraphs
function markdownToHtml(markdown: string): string {
    if (!markdown) return "";

    let html = markdown
        // Escape HTML
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        // Headers
        .replace(/^### (.+)$/gm, "<h3>$1</h3>")
        .replace(/^## (.+)$/gm, "<h2>$1</h2>")
        .replace(/^# (.+)$/gm, "<h1>$1</h1>")
        // Bold and italic
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        // Links
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        // Unordered lists
        .replace(/^- (.+)$/gm, "<li>$1</li>")
        // Paragraphs (double newlines)
        .replace(/\n\n/g, "</p><p>")
        // Single newlines within paragraphs
        .replace(/\n/g, "<br>");

    // Wrap list items in ul
    html = html.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");
    // Clean up multiple ul tags
    html = html.replace(/<\/ul><ul>/g, "");

    // Wrap in paragraph if not already wrapped
    if (!html.startsWith("<h") && !html.startsWith("<ul")) {
        html = `<p>${html}</p>`;
    }

    return html;
}

interface LanguageTab {
    value: string;
    label: string;
}

const LANGUAGES: LanguageTab[] = [
    { value: "sv", label: "Svenska" },
    { value: "en", label: "English" },
];

export function PrivacyPolicyEditor() {
    const t = useTranslations("settings.privacyPolicy");

    const [activeTab, setActiveTab] = useState<string>("sv");
    const [policies, setPolicies] = useState<Record<string, PrivacyPolicy | null>>({});
    const [contents, setContents] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    const loadPolicies = useCallback(async () => {
        setLoading(true);
        try {
            const results: Record<string, PrivacyPolicy | null> = {};
            const contentMap: Record<string, string> = {};

            for (const lang of LANGUAGES) {
                const result = await getPrivacyPolicy(lang.value);
                if (result.success) {
                    results[lang.value] = result.data;
                    contentMap[lang.value] = result.data?.content || "";
                }
            }

            setPolicies(results);
            setContents(contentMap);
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
        loadPolicies();
    }, [loadPolicies]);

    const handleSave = async () => {
        const content = contents[activeTab];
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
            const result = await savePrivacyPolicy({
                language: activeTab,
                content: content,
            });

            if (result.success) {
                notifications.show({
                    title: t("notifications.success"),
                    message: t("notifications.saved"),
                    color: "green",
                });
                // Update local state with new policy
                setPolicies(prev => ({
                    ...prev,
                    [activeTab]: result.data,
                }));
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

    const currentContent = contents[activeTab] || "";
    const currentPolicy = policies[activeTab];
    const hasChanges = currentPolicy?.content !== currentContent;

    return (
        <Container size="md" py="md">
            <Stack gap="lg">
                <Group justify="space-between">
                    <div>
                        <Title order={2}>{t("title")}</Title>
                        <Text c="dimmed" mt="xs">
                            {t("description")}
                        </Text>
                    </div>
                    <Anchor
                        href="/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Button
                            variant="light"
                            leftSection={<IconExternalLink size={16} />}
                        >
                            {t("viewPublicPage")}
                        </Button>
                    </Anchor>
                </Group>

                <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                    <Text size="sm">{t("markdownHint")}</Text>
                    <Text size="xs" c="dimmed" mt="xs">
                        {t("markdownExamples")}
                    </Text>
                </Alert>

                <div style={{ position: "relative" }}>
                    <LoadingOverlay visible={loading} />

                    <Tabs value={activeTab} onChange={(value) => setActiveTab(value || "sv")}>
                        <Tabs.List>
                            {LANGUAGES.map((lang) => (
                                <Tabs.Tab key={lang.value} value={lang.value}>
                                    {lang.label}
                                    {policies[lang.value] && (
                                        <Text span size="xs" c="dimmed" ml="xs">
                                            ({t("lastUpdated", {
                                                date: new Date(policies[lang.value]!.created_at).toLocaleDateString(),
                                            })})
                                        </Text>
                                    )}
                                </Tabs.Tab>
                            ))}
                        </Tabs.List>

                        {LANGUAGES.map((lang) => (
                            <Tabs.Panel key={lang.value} value={lang.value} pt="md">
                                <Stack gap="md">
                                    {showPreview ? (
                                        <Card withBorder padding="md">
                                            <Text fw={500} mb="md">{t("preview")}</Text>
                                            <TypographyStylesProvider>
                                                <div
                                                    dangerouslySetInnerHTML={{
                                                        __html: markdownToHtml(contents[lang.value] || ""),
                                                    }}
                                                />
                                            </TypographyStylesProvider>
                                            {policies[lang.value] && (
                                                <Text size="sm" c="dimmed" mt="md">
                                                    {t("lastUpdatedFull", {
                                                        date: new Date(policies[lang.value]!.created_at).toLocaleDateString(),
                                                    })}
                                                </Text>
                                            )}
                                        </Card>
                                    ) : (
                                        <Textarea
                                            placeholder={t("placeholder")}
                                            minRows={15}
                                            autosize
                                            value={contents[lang.value] || ""}
                                            onChange={(e) =>
                                                setContents((prev) => ({
                                                    ...prev,
                                                    [lang.value]: e.target.value,
                                                }))
                                            }
                                        />
                                    )}
                                </Stack>
                            </Tabs.Panel>
                        ))}
                    </Tabs>

                    <Group justify="space-between" mt="md">
                        <Button
                            variant="subtle"
                            onClick={() => setShowPreview(!showPreview)}
                        >
                            {showPreview ? t("buttons.edit") : t("buttons.preview")}
                        </Button>
                        <Button
                            onClick={handleSave}
                            loading={saving}
                            disabled={!hasChanges || !currentContent.trim()}
                        >
                            {t("buttons.save")}
                        </Button>
                    </Group>
                </div>
            </Stack>
        </Container>
    );
}
