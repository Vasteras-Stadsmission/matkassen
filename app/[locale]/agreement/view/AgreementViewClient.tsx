"use client";

import { useState, useEffect } from "react";
import {
    Container,
    Title,
    Text,
    Stack,
    Card,
    LoadingOverlay,
    Alert,
    TypographyStylesProvider,
    Badge,
    Group,
    Button,
} from "@mantine/core";
import { IconAlertCircle, IconArrowLeft } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/app/i18n/navigation";
import { getAgreementForAcceptance, type AgreementForAcceptance } from "../actions";
import { markdownToHtml } from "@/app/utils/markdown-to-html";

export function AgreementViewClient() {
    const t = useTranslations("agreement");
    const router = useRouter();

    const [agreement, setAgreement] = useState<AgreementForAcceptance | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadAgreement() {
            try {
                const result = await getAgreementForAcceptance();
                if (result.success) {
                    setAgreement(result.data);
                } else {
                    setError(result.error?.message || t("errors.loadFailed"));
                }
            } catch {
                setError(t("errors.loadFailed"));
            } finally {
                setLoading(false);
            }
        }

        loadAgreement();
    }, [t]);

    if (loading) {
        return (
            <Container size="md" py="xl">
                <div style={{ position: "relative", minHeight: 400 }}>
                    <LoadingOverlay visible={true} />
                </div>
            </Container>
        );
    }

    if (error) {
        return (
            <Container size="md" py="xl">
                <Alert icon={<IconAlertCircle size={16} />} color="red" title={t("errors.title")}>
                    {error}
                </Alert>
            </Container>
        );
    }

    if (!agreement) {
        return (
            <Container size="md" py="xl">
                <Text c="dimmed">{t("noAgreement")}</Text>
            </Container>
        );
    }

    return (
        <Container size="md" py="xl">
            <Stack gap="lg">
                <Button
                    variant="subtle"
                    leftSection={<IconArrowLeft size={16} />}
                    onClick={() => router.back()}
                    w="fit-content"
                >
                    {t("back")}
                </Button>

                <div>
                    <Title order={1}>{t("viewTitle")}</Title>
                    <Text c="dimmed" mt="xs">
                        {t("viewSubtitle")}
                    </Text>
                </div>

                <Group gap="xs">
                    <Badge variant="light" color="blue">
                        {t("version", { version: String(agreement.version) })}
                    </Badge>
                    <Badge variant="light" color="gray">
                        {t("effectiveFrom", {
                            date: new Date(agreement.effectiveFrom).toLocaleDateString("sv-SE"),
                        })}
                    </Badge>
                </Group>

                <Card withBorder padding="lg" style={{ maxHeight: "70vh", overflow: "auto" }}>
                    <TypographyStylesProvider>
                        <div
                            dangerouslySetInnerHTML={{
                                __html: markdownToHtml(agreement.content),
                            }}
                        />
                    </TypographyStylesProvider>
                </Card>
            </Stack>
        </Container>
    );
}
