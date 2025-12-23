import { getPublicPrivacyPolicy } from "@/app/utils/public-privacy-policy";
import { markdownToHtml } from "@/app/utils/markdown-to-html";
import { isRtlLocale, type SupportedLocale } from "@/app/utils/locale-detection";
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
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";

interface PrivacyPageProps {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// UI strings for privacy page - keyed by language code
const UI_STRINGS: Record<
    string,
    { title: string; lastUpdated: string; noPolicy: string; fallbackNotice: string }
> = {
    sv: {
        title: "Integritetspolicy",
        lastUpdated: "Senast uppdaterad",
        noPolicy: `Ingen integritetspolicy har konfigurerats ännu. Kontakta ${BRAND_NAME} för mer information.`,
        fallbackNotice:
            "Denna policy visas på svenska eftersom den inte finns tillgänglig på ditt valda språk.",
    },
    en: {
        title: "Privacy Policy",
        lastUpdated: "Last updated",
        noPolicy: `No privacy policy has been configured yet. Contact ${BRAND_NAME} for more information.`,
        fallbackNotice:
            "This policy is shown in Swedish as it is not available in your selected language.",
    },
    ar: {
        title: "سياسة الخصوصية",
        lastUpdated: "آخر تحديث",
        noPolicy: `لم يتم تكوين سياسة الخصوصية بعد. اتصل بـ ${BRAND_NAME} لمزيد من المعلومات.`,
        fallbackNotice: "يتم عرض هذه السياسة باللغة السويدية لأنها غير متوفرة بلغتك المختارة.",
    },
    fa: {
        title: "سیاست حفظ حریم خصوصی",
        lastUpdated: "آخرین به‌روزرسانی",
        noPolicy: `هنوز سیاست حفظ حریم خصوصی پیکربندی نشده است. برای اطلاعات بیشتر با ${BRAND_NAME} تماس بگیرید.`,
        fallbackNotice:
            "این سیاست به زبان سوئدی نمایش داده می‌شود زیرا به زبان انتخابی شما موجود نیست.",
    },
    ku: {
        title: "Siyaseta Nepenîtiyê",
        lastUpdated: "Dawî rojanekirî",
        noPolicy: `Hîn siyaseta nepenîtiyê nehatiye danîn. Ji bo bêtir agahdarî bi ${BRAND_NAME} re têkilî daynin.`,
        fallbackNotice:
            "Ev siyaset bi Swêdî tê xuyang kirin ji ber ku bi zimanê we yê bijartî tune ye.",
    },
};

// Get UI strings for a language, falling back to English then Swedish
function getUIStrings(language: string) {
    return UI_STRINGS[language] || UI_STRINGS["en"] || UI_STRINGS["sv"];
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

    // Get UI strings based on requested language (user's preference)
    const ui = getUIStrings(requestedLanguage);

    // Check if the content language is RTL
    const isRtl = isRtlLocale(contentLanguage as SupportedLocale);

    // Format the date nicely using the content language
    const formatDate = (date: Date) => {
        const localeMap: Record<string, string> = {
            sv: "sv-SE",
            en: "en-GB",
            ar: "ar-SA",
            fa: "fa-IR",
            de: "de-DE",
            es: "es-ES",
            fr: "fr-FR",
        };
        return date.toLocaleDateString(localeMap[contentLanguage] || "en-GB", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

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
                                <Title order={1}>{ui.title}</Title>

                                {showingFallback && (
                                    <Alert
                                        icon={<IconInfoCircle size={16} />}
                                        color="blue"
                                        variant="light"
                                    >
                                        {ui.fallbackNotice}
                                    </Alert>
                                )}

                                {policy ? (
                                    <>
                                        <TypographyStylesProvider>
                                            <div
                                                dangerouslySetInnerHTML={{
                                                    __html: markdownToHtml(policy.content),
                                                }}
                                            />
                                        </TypographyStylesProvider>

                                        <Text size="sm" c="dimmed" mt="xl">
                                            {ui.lastUpdated}: {formatDate(policy.updatedAt)}
                                        </Text>
                                    </>
                                ) : (
                                    <Text c="dimmed">{ui.noPolicy}</Text>
                                )}
                            </Stack>
                        </Paper>
                    </Stack>
                </Container>
            </div>
        </MantineProvider>
    );
}
