import { getPublicPrivacyPolicy } from "@/app/utils/public-privacy-policy";
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

// Simple markdown to HTML converter
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
        .replace(
            /\[(.+?)\]\((.+?)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
        )
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
