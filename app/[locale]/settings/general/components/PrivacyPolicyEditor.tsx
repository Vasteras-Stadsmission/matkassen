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
    Select,
    ActionIcon,
    Badge,
} from "@mantine/core";
import { IconExternalLink, IconInfoCircle, IconPlus, IconX } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { getAllPrivacyPolicies, savePrivacyPolicy, type PrivacyPolicy } from "../actions";
import { markdownToHtml } from "@/app/utils/markdown-to-html";

interface LanguageOption {
    value: string;
    label: string;
}

// All public languages supported by the system (from public-*.json files)
const ALL_LANGUAGES: LanguageOption[] = [
    { value: "ar", label: "العربية (Arabic)" },
    { value: "de", label: "Deutsch (German)" },
    { value: "el", label: "Ελληνικά (Greek)" },
    { value: "en", label: "English" },
    { value: "es", label: "Español (Spanish)" },
    { value: "fa", label: "فارسی (Persian)" },
    { value: "fi", label: "Suomi (Finnish)" },
    { value: "fr", label: "Français (French)" },
    { value: "hy", label: "Armenian" },
    { value: "it", label: "Italiano (Italian)" },
    { value: "ka", label: "ქართული (Georgian)" },
    { value: "ku", label: "Kurdî (Kurdish)" },
    { value: "pl", label: "Polski (Polish)" },
    { value: "ru", label: "Русский (Russian)" },
    { value: "so", label: "Soomaali (Somali)" },
    { value: "sv", label: "Svenska (Swedish)" },
    { value: "sw", label: "Kiswahili (Swahili)" },
    { value: "th", label: "ไทย (Thai)" },
    { value: "uk", label: "Українська (Ukrainian)" },
    { value: "vi", label: "Tiếng Việt (Vietnamese)" },
];

export function PrivacyPolicyEditor() {
    const t = useTranslations("settings.privacyPolicy");

    const [activeLanguages, setActiveLanguages] = useState<string[]>(["sv"]);
    const [activeTab, setActiveTab] = useState<string>("sv");
    const [policies, setPolicies] = useState<Record<string, PrivacyPolicy | null>>({});
    const [contents, setContents] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [selectedNewLang, setSelectedNewLang] = useState<string | null>(null);

    const loadPolicies = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getAllPrivacyPolicies();
            if (result.success && result.data) {
                const results: Record<string, PrivacyPolicy | null> = {};
                const contentMap: Record<string, string> = {};
                const langs: string[] = [];

                for (const policy of result.data) {
                    results[policy.language] = policy;
                    contentMap[policy.language] = policy.content || "";
                    langs.push(policy.language);
                }

                setPolicies(results);
                setContents(contentMap);

                // Set active languages from existing policies, default to sv if none
                if (langs.length > 0) {
                    setActiveLanguages(langs);
                    setActiveTab(langs[0]);
                } else {
                    setActiveLanguages(["sv"]);
                    setActiveTab("sv");
                }
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
        loadPolicies();
    }, [loadPolicies]);

    const addLanguage = (langCode: string) => {
        if (!activeLanguages.includes(langCode)) {
            setActiveLanguages(prev => [...prev, langCode]);
            setContents(prev => ({ ...prev, [langCode]: "" }));
            setActiveTab(langCode);
        }
        setSelectedNewLang(null);
    };

    const removeLanguage = (langCode: string) => {
        // Only allow removing if no saved content exists
        if (policies[langCode]) {
            notifications.show({
                title: t("notifications.error"),
                message: t("notifications.cannotRemoveSaved"),
                color: "red",
            });
            return;
        }

        setActiveLanguages(prev => prev.filter(l => l !== langCode));
        setContents(prev => {
            const newContents = { ...prev };
            delete newContents[langCode];
            return newContents;
        });

        // Switch to another tab if removing the active one
        if (activeTab === langCode) {
            const remaining = activeLanguages.filter(l => l !== langCode);
            setActiveTab(remaining[0] || "sv");
        }
    };

    const availableLanguages = ALL_LANGUAGES.filter(lang => !activeLanguages.includes(lang.value));

    const getLanguageLabel = (code: string) => {
        const lang = ALL_LANGUAGES.find(l => l.value === code);
        return lang?.label || code.toUpperCase();
    };

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
                    <Anchor href="/privacy" target="_blank" rel="noopener noreferrer">
                        <Button variant="light" leftSection={<IconExternalLink size={16} />}>
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

                    <Tabs value={activeTab} onChange={value => setActiveTab(value || "sv")}>
                        <Group gap="xs" mb="md">
                            <Tabs.List style={{ flex: 1 }}>
                                {activeLanguages.map(langCode => (
                                    <Tabs.Tab key={langCode} value={langCode}>
                                        <Group gap="xs">
                                            <span>{getLanguageLabel(langCode)}</span>
                                            {policies[langCode] && (
                                                <Badge size="xs" variant="light" color="green">
                                                    {t("saved")}
                                                </Badge>
                                            )}
                                            {!policies[langCode] && activeLanguages.length > 1 && (
                                                <ActionIcon
                                                    size="xs"
                                                    variant="subtle"
                                                    color="gray"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        removeLanguage(langCode);
                                                    }}
                                                >
                                                    <IconX size={12} />
                                                </ActionIcon>
                                            )}
                                        </Group>
                                    </Tabs.Tab>
                                ))}
                            </Tabs.List>

                            {availableLanguages.length > 0 && (
                                <Group gap="xs">
                                    <Select
                                        placeholder={t("addLanguage")}
                                        data={availableLanguages.map(l => ({
                                            value: l.value,
                                            label: l.label,
                                        }))}
                                        value={selectedNewLang}
                                        onChange={setSelectedNewLang}
                                        size="sm"
                                        w={200}
                                        searchable
                                        clearable
                                    />
                                    <ActionIcon
                                        variant="filled"
                                        color="blue"
                                        disabled={!selectedNewLang}
                                        onClick={() =>
                                            selectedNewLang && addLanguage(selectedNewLang)
                                        }
                                    >
                                        <IconPlus size={16} />
                                    </ActionIcon>
                                </Group>
                            )}
                        </Group>

                        {activeLanguages.map(langCode => (
                            <Tabs.Panel key={langCode} value={langCode} pt="md">
                                <Stack gap="md">
                                    {showPreview ? (
                                        <Card withBorder padding="md">
                                            <Text fw={500} mb="md">
                                                {t("preview")}
                                            </Text>
                                            <TypographyStylesProvider>
                                                <div
                                                    dangerouslySetInnerHTML={{
                                                        __html: markdownToHtml(
                                                            contents[langCode] || "",
                                                        ),
                                                    }}
                                                />
                                            </TypographyStylesProvider>
                                            {policies[langCode] && (
                                                <Text size="sm" c="dimmed" mt="md">
                                                    {t("lastUpdatedFull", {
                                                        date: new Date(
                                                            policies[langCode]!.created_at,
                                                        ).toLocaleDateString(),
                                                    })}
                                                </Text>
                                            )}
                                        </Card>
                                    ) : (
                                        <Textarea
                                            placeholder={t("placeholder")}
                                            minRows={15}
                                            autosize
                                            value={contents[langCode] || ""}
                                            onChange={e =>
                                                setContents(prev => ({
                                                    ...prev,
                                                    [langCode]: e.target.value,
                                                }))
                                            }
                                        />
                                    )}
                                </Stack>
                            </Tabs.Panel>
                        ))}
                    </Tabs>

                    <Group justify="space-between" mt="md">
                        <Button variant="subtle" onClick={() => setShowPreview(!showPreview)}>
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
