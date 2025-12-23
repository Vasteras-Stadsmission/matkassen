import { getPublicPrivacyPolicy } from "@/app/utils/public-privacy-policy";
import { markdownToHtml } from "@/app/utils/markdown-to-html";
import { BRAND_NAME } from "@/app/config/branding";
import {
    Paper,
    Title,
    Text,
    Stack,
    MantineProvider,
    TypographyStylesProvider,
    Container,
} from "@mantine/core";

interface PrivacyPageProps {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PrivacyPage({ searchParams }: PrivacyPageProps) {
    const resolvedSearchParams = (await searchParams) ?? {};
    const rawLang = resolvedSearchParams.lang;
    const lang = Array.isArray(rawLang) ? rawLang[0] : rawLang;

    // Default to Swedish if no language specified
    const language = lang || "sv";

    const policy = await getPublicPrivacyPolicy(language);

    // Format the date nicely
    const formatDate = (date: Date) => {
        return date.toLocaleDateString(language === "sv" ? "sv-SE" : "en-GB", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    return (
        <MantineProvider defaultColorScheme="light">
            <div
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
                                <Title order={1}>
                                    {language === "sv" ? "Integritetspolicy" : "Privacy Policy"}
                                </Title>

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
                                            {language === "sv"
                                                ? `Senast uppdaterad: ${formatDate(policy.updatedAt)}`
                                                : `Last updated: ${formatDate(policy.updatedAt)}`}
                                        </Text>
                                    </>
                                ) : (
                                    <Text c="dimmed">
                                        {language === "sv"
                                            ? `Ingen integritetspolicy har konfigurerats ännu. Kontakta ${BRAND_NAME} för mer information.`
                                            : `No privacy policy has been configured yet. Contact ${BRAND_NAME} for more information.`}
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
