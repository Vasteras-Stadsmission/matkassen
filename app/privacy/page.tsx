import {
    getPublicPrivacyPolicy,
    getAvailablePrivacyPolicyLanguages,
} from "@/app/utils/public-privacy-policy";
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
    Group,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { PublicLocaleSwitcher } from "@/app/components/PublicLocaleSwitcher";
import type { Metadata } from "next";

interface PrivacyPageProps {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// UI strings for privacy page - keyed by language code
// All 21 supported languages with proper translations
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
    es: {
        title: "Política de Privacidad",
        lastUpdated: "Última actualización",
        noPolicy: `Aún no se ha configurado una política de privacidad. Contacta con ${BRAND_NAME} para más información.`,
        fallbackNotice:
            "Esta política se muestra en sueco porque no está disponible en tu idioma seleccionado.",
    },
    fr: {
        title: "Politique de Confidentialité",
        lastUpdated: "Dernière mise à jour",
        noPolicy: `Aucune politique de confidentialité n'a encore été configurée. Contactez ${BRAND_NAME} pour plus d'informations.`,
        fallbackNotice:
            "Cette politique est affichée en suédois car elle n'est pas disponible dans votre langue.",
    },
    de: {
        title: "Datenschutzerklärung",
        lastUpdated: "Zuletzt aktualisiert",
        noPolicy: `Es wurde noch keine Datenschutzerklärung konfiguriert. Kontaktieren Sie ${BRAND_NAME} für weitere Informationen.`,
        fallbackNotice:
            "Diese Richtlinie wird auf Schwedisch angezeigt, da sie in Ihrer Sprache nicht verfügbar ist.",
    },
    el: {
        title: "Πολιτική Απορρήτου",
        lastUpdated: "Τελευταία ενημέρωση",
        noPolicy: `Δεν έχει διαμορφωθεί ακόμη πολιτική απορρήτου. Επικοινωνήστε με ${BRAND_NAME} για περισσότερες πληροφορίες.`,
        fallbackNotice:
            "Αυτή η πολιτική εμφανίζεται στα σουηδικά επειδή δεν είναι διαθέσιμη στη γλώσσα σας.",
    },
    sw: {
        title: "Sera ya Faragha",
        lastUpdated: "Imesasishwa mwisho",
        noPolicy: `Sera ya faragha bado haijawekwa. Wasiliana na ${BRAND_NAME} kwa maelezo zaidi.`,
        fallbackNotice: "Sera hii inaonyeshwa kwa Kiswidi kwa sababu haipatikani kwa lugha yako.",
    },
    so: {
        title: "Siyaasadda Arrimaha Gaarka ah",
        lastUpdated: "Markii ugu dambeysay la cusboonaysiiyay",
        noPolicy: `Siyaasadda arrimaha gaarka ah weli lama habeynin. La xiriir ${BRAND_NAME} si aad u hesho macluumaad dheeraad ah.`,
        fallbackNotice:
            "Siyaasaddani waxay ku muuqataa Iswiidhish maxaa yeelay laguma heli karo luqaddaada.",
    },
    so_so: {
        title: "Siyaasadda Arrimaha Gaarka ah",
        lastUpdated: "Markii ugu dambeysay la cusboonaysiiyay",
        noPolicy: `Siyaasadda arrimaha gaarka ah weli lama habeynin. La xiriir ${BRAND_NAME} si aad u hesho macluumaad dheeraad ah.`,
        fallbackNotice:
            "Siyaasaddani waxay ku muuqataa Iswiidhish maxaa yeelay laguma heli karo luqaddaada.",
    },
    uk: {
        title: "Політика конфіденційності",
        lastUpdated: "Останнє оновлення",
        noPolicy: `Політику конфіденційності ще не налаштовано. Зверніться до ${BRAND_NAME} для отримання додаткової інформації.`,
        fallbackNotice:
            "Ця політика відображається шведською мовою, оскільки вона недоступна вашою мовою.",
    },
    ru: {
        title: "Политика конфиденциальности",
        lastUpdated: "Последнее обновление",
        noPolicy: `Политика конфиденциальности еще не настроена. Свяжитесь с ${BRAND_NAME} для получения дополнительной информации.`,
        fallbackNotice:
            "Эта политика отображается на шведском языке, так как она недоступна на вашем языке.",
    },
    ka: {
        title: "კონფიდენციალურობის პოლიტიკა",
        lastUpdated: "ბოლო განახლება",
        noPolicy: `კონფიდენციალურობის პოლიტიკა ჯერ არ არის კონფიგურირებული. დაუკავშირდით ${BRAND_NAME}-ს მეტი ინფორმაციისთვის.`,
        fallbackNotice:
            "ეს პოლიტიკა ნაჩვენებია შვედურად, რადგან თქვენს ენაზე არ არის ხელმისაწვდომი.",
    },
    fi: {
        title: "Tietosuojakäytäntö",
        lastUpdated: "Viimeksi päivitetty",
        noPolicy: `Tietosuojakäytäntöä ei ole vielä määritetty. Ota yhteyttä ${BRAND_NAME} saadaksesi lisätietoja.`,
        fallbackNotice:
            "Tämä käytäntö näytetään ruotsiksi, koska sitä ei ole saatavilla valitsemallasi kielellä.",
    },
    it: {
        title: "Informativa sulla Privacy",
        lastUpdated: "Ultimo aggiornamento",
        noPolicy: `Nessuna informativa sulla privacy è stata ancora configurata. Contatta ${BRAND_NAME} per maggiori informazioni.`,
        fallbackNotice:
            "Questa informativa è mostrata in svedese perché non è disponibile nella tua lingua.",
    },
    th: {
        title: "นโยบายความเป็นส่วนตัว",
        lastUpdated: "อัปเดตล่าสุด",
        noPolicy: `ยังไม่ได้กำหนดนโยบายความเป็นส่วนตัว ติดต่อ ${BRAND_NAME} สำหรับข้อมูลเพิ่มเติม`,
        fallbackNotice: "นโยบายนี้แสดงเป็นภาษาสวีเดนเนื่องจากไม่มีในภาษาของคุณ",
    },
    vi: {
        title: "Chính sách Bảo mật",
        lastUpdated: "Cập nhật lần cuối",
        noPolicy: `Chính sách bảo mật chưa được cấu hình. Liên hệ ${BRAND_NAME} để biết thêm thông tin.`,
        fallbackNotice:
            "Chính sách này được hiển thị bằng tiếng Thụy Điển vì không có sẵn bằng ngôn ngữ của bạn.",
    },
    pl: {
        title: "Polityka Prywatności",
        lastUpdated: "Ostatnia aktualizacja",
        noPolicy: `Polityka prywatności nie została jeszcze skonfigurowana. Skontaktuj się z ${BRAND_NAME} po więcej informacji.`,
        fallbackNotice:
            "Ta polityka jest wyświetlana po szwedzku, ponieważ nie jest dostępna w Twoim języku.",
    },
    // Armenian uses English fallback (consistent with SMS templates)
    hy: {
        title: "Privacy Policy",
        lastUpdated: "Last updated",
        noPolicy: `No privacy policy has been configured yet. Contact ${BRAND_NAME} for more information.`,
        fallbackNotice:
            "This policy is shown in Swedish as it is not available in your selected language.",
    },
};

// Get UI strings for a language, falling back to English then Swedish
function getUIStrings(language: string) {
    return UI_STRINGS[language] || UI_STRINGS["en"] || UI_STRINGS["sv"];
}

// Dynamic metadata based on language
export async function generateMetadata({ searchParams }: PrivacyPageProps): Promise<Metadata> {
    const resolvedSearchParams = (await searchParams) ?? {};
    const rawLang = resolvedSearchParams.lang;
    const lang = Array.isArray(rawLang) ? rawLang[0] : rawLang;
    const requestedLanguage = lang || "sv";
    const ui = getUIStrings(requestedLanguage);

    return {
        title: `${BRAND_NAME} - ${ui.title}`,
        description: "Privacy policy and data protection information",
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

    // Language switcher options - only show languages that have a privacy policy
    const availableLanguages = await getAvailablePrivacyPolicyLanguages();
    const languageOptions = availableLanguages.map(value => ({
        value,
        label: value,
    }));
    const languageAriaLabel = "Choose language";

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
                                <Group justify="space-between" align="center" wrap="nowrap">
                                    <Title order={1}>
                                        {BRAND_NAME} - {ui.title}
                                    </Title>
                                    {languageOptions.length > 1 && (
                                        <PublicLocaleSwitcher
                                            ariaLabel={languageAriaLabel}
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
