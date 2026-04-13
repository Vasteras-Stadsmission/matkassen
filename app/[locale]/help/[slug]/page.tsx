import { Suspense } from "react";
import { getTranslations, getLocale } from "next-intl/server";
import {
    Container,
    Stack,
    Title,
    Group,
    Button,
    Paper,
    TypographyStylesProvider,
} from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { auth } from "@/auth";
import { redirect } from "@/app/i18n/navigation";
import { AgreementProtection } from "@/components/AgreementProtection";
import { markdownToHtml } from "@/app/utils/markdown-to-html";
import { getManualBySlug, canRoleReadManual, loadManualContent } from "../manual-registry";
import { getManualTitle } from "../manual-labels";
import { MermaidRenderer } from "./MermaidRenderer";
import { HashScroller } from "./HashScroller";
import classes from "./ManualContent.module.css";

/**
 * Manual detail page — renders a single markdown manual from /docs.
 *
 * Authorization:
 *   - Unknown slug → 404 (notFound)
 *   - Slug exists but the user's role isn't allowed → redirect to /help
 *     (avoids leaking which manuals exist via 403 vs 404 divergence)
 */
export default function ManualPage({
    params,
}: {
    params: Promise<{ slug: string; locale: string }>;
}) {
    return (
        <AgreementProtection>
            <Suspense fallback={null}>
                <ManualContent params={params} />
            </Suspense>
        </AgreementProtection>
    );
}

async function ManualContent({ params }: { params: Promise<{ slug: string; locale: string }> }) {
    const { slug } = await params;

    // Auth first, THEN check slug existence. This prevents a timing
    // side-channel where an attacker could distinguish valid admin-only
    // slugs (302 redirect) from non-existent ones (404). Both cases
    // produce the same redirect to /help so no slug information leaks.
    const session = await auth();
    const role = session?.user?.role;
    const manual = getManualBySlug(slug);

    if (!manual) {
        const locale = await getLocale();
        return redirect({ href: "/help", locale });
    }

    if (!canRoleReadManual(role, manual)) {
        const locale = await getLocale();
        return redirect({ href: "/help", locale });
    }

    const t = await getTranslations("help");
    const locale = await getLocale();
    const rawMarkdown = loadManualContent(manual);
    const html = markdownToHtml(rawMarkdown);

    return (
        <Container size="md" py="xl">
            <Stack gap="lg">
                <Group justify="space-between" align="center" wrap="nowrap">
                    <Title order={1} size="h2">
                        {getManualTitle(t, manual.slug)}
                    </Title>
                    {/* Plain <a> with a locale-prefixed href — server components
                        cannot pass the next-intl Link component through as a
                        prop (React serialization across server/client boundary
                        rejects component references). */}
                    <Button
                        component="a"
                        href={`/${locale}/help`}
                        variant="subtle"
                        leftSection={<IconArrowLeft size={16} />}
                        size="sm"
                    >
                        {t("backToIndex")}
                    </Button>
                </Group>

                <Paper withBorder p="xl">
                    <TypographyStylesProvider>
                        {/* Content is generated from trusted repo markdown and
                            sanitized by DOMPurify in markdownToHtml. */}
                        <div
                            className={classes.content}
                            dangerouslySetInnerHTML={{ __html: html }}
                        />
                    </TypographyStylesProvider>
                </Paper>
                <MermaidRenderer />
                <HashScroller />
            </Stack>
        </Container>
    );
}
