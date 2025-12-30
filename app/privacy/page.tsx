import {
    getPublicPrivacyPolicy,
    getAvailablePrivacyPolicyLanguages,
} from "@/app/utils/public-privacy-policy";
import { markdownToHtml } from "@/app/utils/markdown-to-html";
import { isRtlLocale, SUPPORTED_LOCALES, type SupportedLocale } from "@/app/utils/locale-detection";
import { BRAND_NAME } from "@/app/config/branding";
import {
    Paper,
    Title,
    Text,
    Stack,
    MantineProvider,
    TypographyStylesProvider,
    Container,
    Alert,
    Group,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { PublicLocaleSwitcher } from "@/app/components/PublicLocaleSwitcher";
import type { Metadata } from "next";
import { logger } from "@/app/utils/logger";

interface PrivacyPageProps {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// Interface for public messages structure
interface PublicMessages {
    publicParcel: {
        chooseLanguage: string;
    };
    publicPrivacy: {
        title: string;
        description: string;
        lastUpdated: string;
        noPolicy: string;
        fallbackNotice: string;
    };
}

// Load messages based on locale
async function loadMessages(locale: string): Promise<PublicMessages> {
    // Validate locale is supported
    const validLocale = SUPPORTED_LOCALES.includes(locale as SupportedLocale) ? locale : "en";

    try {
        const messages = (await import(`@/messages/public-${validLocale}.json`)).default;

        if (!messages || !messages.publicPrivacy) {
            throw new Error(`Invalid message structure for locale ${validLocale}`);
        }

        return messages as PublicMessages;
    } catch (error) {
        // Fallback to English if locale file doesn't exist
        logger.warn(
            {
                locale: validLocale,
                error: error instanceof Error ? error.message : String(error),
            },
            "Locale-specific message bundle missing, falling back to English",
        );

        const fallbackMessages = (await import(`@/messages/public-en.json`)).default;

        if (!fallbackMessages || !fallbackMessages.publicPrivacy) {
            throw new Error("Invalid fallback message structure");
        }

        return fallbackMessages as PublicMessages;
    }
}

// Format noPolicy message by replacing {brandName} placeholder
function formatNoPolicy(template: string): string {
    return template.replace("{brandName}", BRAND_NAME);
}

// Dynamic metadata based on language
export async function generateMetadata({ searchParams }: PrivacyPageProps): Promise<Metadata> {
    const resolvedSearchParams = (await searchParams) ?? {};
    const rawLang = resolvedSearchParams.lang;
    const lang = Array.isArray(rawLang) ? rawLang[0] : rawLang;
    const requestedLanguage = lang || "sv";
    const messages = await loadMessages(requestedLanguage);

    return {
        title: `${BRAND_NAME} - ${messages.publicPrivacy.title}`,
        description: messages.publicPrivacy.description,
        robots: "noindex, nofollow",
    };
}

export default async function PrivacyPage({ searchParams }: PrivacyPageProps) {
    const resolvedSearchParams = (await searchParams) ?? {};
    const rawLang = resolvedSearchParams.lang;
    const lang = Array.isArray(rawLang) ? rawLang[0] : rawLang;

    // Default to Swedish if no language specified
    const requestedLanguage = lang || "sv";

    const policy = await getPublicPrivacyPolicy(requestedLanguage);

    // Use policy's actual language for content display, requested language for UI
    // This handles the fallback case where Swedish content is shown for other languages
    const contentLanguage = policy?.language || requestedLanguage;
    const showingFallback = policy && policy.language !== requestedLanguage;

    // Load messages based on requested language (user's preference)
    const messages = await loadMessages(requestedLanguage);
    const chooseLanguageLabel = messages.publicParcel.chooseLanguage;

    // Check if the requested language is RTL (for UI layout)
    const isRtl = isRtlLocale(requestedLanguage as SupportedLocale);

    // Check if the content language is RTL (for content display when showing fallback)
    const isContentRtl = isRtlLocale(contentLanguage as SupportedLocale);

    // Format the date nicely using the content language
    const formatDate = (date: Date) => {
        // BCP 47 locale tags for all 21 supported locales
        const localeMap: Record<string, string> = {
            sv: "sv-SE",
            en: "en-GB",
            ar: "ar-SA",
            fa: "fa-IR",
            ku: "ku",
            es: "es-ES",
            fr: "fr-FR",
            de: "de-DE",
            el: "el-GR",
            sw: "sw-KE",
            so: "so-SO",
            so_so: "so-SO",
            uk: "uk-UA",
            ru: "ru-RU",
            ka: "ka-GE",
            fi: "fi-FI",
            it: "it-IT",
            th: "th-TH",
            vi: "vi-VN",
            pl: "pl-PL",
        };
        return date.toLocaleDateString(localeMap[contentLanguage] || "en-GB", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    // Language switcher options - only show languages that have a privacy policy
    const availableLanguages = await getAvailablePrivacyPolicyLanguages();
    const languageOptions = availableLanguages.map(value => ({
        value,
        label: value,
    }));

    return (
        <MantineProvider defaultColorScheme="light">
            <div
                dir={isRtl ? "rtl" : "ltr"}
                style={{
                    margin: 0,
                    padding: "16px",
                    backgroundColor: "#f8f9fa",
                    minHeight: "100vh",
                }}
            >
                <Container size="md">
                    <Stack gap="lg">
                        <Paper p="xl" radius="md" shadow="sm">
                            <Stack gap="lg">
                                <Group justify="space-between" align="flex-start">
                                    <Title order={1} style={{ flex: 1, minWidth: 0 }}>
                                        {BRAND_NAME} - {messages.publicPrivacy.title}
                                    </Title>
                                    {languageOptions.length > 1 && (
                                        <PublicLocaleSwitcher
                                            ariaLabel={chooseLanguageLabel}
                                            menuLabel={chooseLanguageLabel}
                                            currentValue={requestedLanguage}
                                            options={languageOptions}
                                        />
                                    )}
                                </Group>

                                {showingFallback && (
                                    <Alert
                                        icon={<IconInfoCircle size={16} />}
                                        color="blue"
                                        variant="light"
                                    >
                                        {messages.publicPrivacy.fallbackNotice}
                                    </Alert>
                                )}

                                {policy ? (
                                    <div dir={isContentRtl ? "rtl" : "ltr"}>
                                        <TypographyStylesProvider>
                                            <div
                                                dangerouslySetInnerHTML={{
                                                    __html: markdownToHtml(policy.content),
                                                }}
                                            />
                                        </TypographyStylesProvider>

                                        <Text size="sm" c="dimmed" mt="xl">
                                            {messages.publicPrivacy.lastUpdated}:{" "}
                                            {formatDate(policy.updatedAt)}
                                        </Text>
                                    </div>
                                ) : (
                                    <Text c="dimmed">
                                        {formatNoPolicy(messages.publicPrivacy.noPolicy)}
                                    </Text>
                                )}
                            </Stack>
                        </Paper>
                    </Stack>
                </Container>
            </div>
        </MantineProvider>
    );
}
