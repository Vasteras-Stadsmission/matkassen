import { Suspense } from "react";
import { auth } from "@/auth";
import { getTranslations } from "next-intl/server";
import { Container, Stack, Title, Text, Card, Group, Paper } from "@mantine/core";
import { IconBook2, IconInfoCircle } from "@tabler/icons-react";
import { AgreementProtection } from "@/components/AgreementProtection";
import { Link } from "@/app/i18n/navigation";
import { getManualsForRole, type ManualMeta } from "./manual-registry";
import { getManualTitle, getManualDescription } from "./manual-labels";
import { filterSectionsForRole, loadAllHelpSections } from "./help-sections";
import { HelpSearch, type HelpSearchSection } from "./HelpSearch";

/**
 * Help index page — lists the staff manuals the current user is allowed
 * to read. The manuals themselves live as Swedish markdown files in /docs;
 * this page is the discovery surface so non-technical staff can find them
 * without navigating GitHub.
 */
export default function HelpPage() {
    return (
        <AgreementProtection>
            <Suspense fallback={null}>
                <HelpIndex />
            </Suspense>
        </AgreementProtection>
    );
}

async function HelpIndex() {
    const session = await auth();
    const role = session?.user?.role;
    const manuals = getManualsForRole(role);
    const t = await getTranslations("help");

    // Filter sections by role on the server so admin-only content never
    // reaches a handout_staff browser. The manual title is resolved here
    // (not on the client) because translations require a server context.
    const searchSections: HelpSearchSection[] = filterSectionsForRole(
        loadAllHelpSections(),
        role,
    ).map(s => ({
        id: s.id,
        manualSlug: s.manualSlug,
        anchor: s.anchor,
        sectionTitle: s.sectionTitle,
        manualTitle: getManualTitle(t, s.manualSlug),
        body: s.body,
    }));

    return (
        <Container size="md" py="xl">
            <Stack gap="lg">
                <div>
                    <Title order={1} size="h2">
                        {t("title")}
                    </Title>
                    <Text size="sm" c="dimmed" mt="xs">
                        {t("subtitle")}
                    </Text>
                </div>

                {searchSections.length > 0 && (
                    <HelpSearch
                        sections={searchSections}
                        placeholder={t("search.placeholder")}
                        noResultsLabel={t("search.noResults")}
                    />
                )}

                <Paper withBorder p="md" bg="blue.0">
                    <Group gap="sm" align="flex-start" wrap="nowrap">
                        <IconInfoCircle size={20} style={{ marginTop: 2, flexShrink: 0 }} />
                        <Text size="sm">{t("languageNote")}</Text>
                    </Group>
                </Paper>

                {manuals.length === 0 ? (
                    <Paper withBorder p="xl">
                        <Text ta="center" c="dimmed">
                            {t("empty")}
                        </Text>
                    </Paper>
                ) : (
                    <Stack gap="sm">
                        {manuals.map(manual => (
                            <ManualCard key={manual.slug} manual={manual} t={t} />
                        ))}
                    </Stack>
                )}
            </Stack>
        </Container>
    );
}

function ManualCard({
    manual,
    t,
}: {
    manual: ManualMeta;
    t: Awaited<ReturnType<typeof getTranslations<"help">>>;
}) {
    // We wrap Card in Link rather than using `component={Link}` because
    // this file is a server component and passing a component reference
    // as a prop to a Mantine client component fails serialization
    // ("Only plain objects can be passed to Client Components").
    return (
        <Link href={`/help/${manual.slug}`} style={{ textDecoration: "none", display: "block" }}>
            <Card withBorder shadow="sm">
                <Group align="flex-start" wrap="nowrap" gap="md">
                    <IconBook2 size={28} color="var(--mantine-color-blue-6)" />
                    <Stack gap={4} style={{ flex: 1 }}>
                        <Title order={3} size="h4">
                            {getManualTitle(t, manual.slug)}
                        </Title>
                        <Text size="sm" c="dimmed">
                            {getManualDescription(t, manual.slug)}
                        </Text>
                    </Stack>
                </Group>
            </Card>
        </Link>
    );
}
