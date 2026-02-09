"use client";

import { useState, useEffect } from "react";
import {
    Container,
    Title,
    Text,
    Button,
    Stack,
    Card,
    Checkbox,
    LoadingOverlay,
    Alert,
    TypographyStylesProvider,
    Badge,
    Group,
} from "@mantine/core";
import { IconAlertCircle, IconCheck } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { useRouter } from "@/app/i18n/navigation";
import { getAgreementForAcceptance, acceptAgreement, type AgreementForAcceptance } from "./actions";
import { markdownToHtml } from "@/app/utils/markdown-to-html";

interface AgreementClientProps {
    callbackUrl?: string;
}

export function AgreementClient({ callbackUrl = "/" }: AgreementClientProps) {
    const t = useTranslations("agreement");
    const router = useRouter();

    const [agreement, setAgreement] = useState<AgreementForAcceptance | null>(null);
    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [accepted, setAccepted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadAgreement() {
            try {
                const result = await getAgreementForAcceptance();
                if (result.success) {
                    setAgreement(result.data);
                    // If already accepted or no agreement exists, redirect
                    if (result.data?.hasAccepted || result.data === null) {
                        router.push(callbackUrl);
                    }
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
    }, [callbackUrl, router, t]);

    const handleAccept = async () => {
        if (!agreement || !accepted) return;

        setAccepting(true);
        try {
            const result = await acceptAgreement(agreement.id);
            if (result.success) {
                notifications.show({
                    title: t("notifications.success"),
                    message: t("notifications.accepted"),
                    color: "green",
                    icon: <IconCheck size={16} />,
                });
                router.push(callbackUrl);
            } else if (result.error?.code === "INVALID_AGREEMENT") {
                // A newer version was published while viewing — re-fetch
                setAccepted(false);
                const refreshed = await getAgreementForAcceptance();
                if (refreshed.success && refreshed.data) {
                    setAgreement(refreshed.data);
                    notifications.show({
                        title: t("notifications.error"),
                        message: t("errors.newerVersion"),
                        color: "orange",
                    });
                }
            } else {
                notifications.show({
                    title: t("notifications.error"),
                    message: result.error?.message || t("errors.acceptFailed"),
                    color: "red",
                });
            }
        } catch {
            notifications.show({
                title: t("notifications.error"),
                message: t("errors.acceptFailed"),
                color: "red",
            });
        } finally {
            setAccepting(false);
        }
    };

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
        // No agreement configured yet - allow access
        router.push(callbackUrl);
        return null;
    }

    return (
        <Container size="md" py="xl">
            <Stack gap="lg">
                <div>
                    <Title order={1}>{t("title")}</Title>
                    <Text c="dimmed" mt="xs">
                        {t("subtitle")}
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

                <Card withBorder padding="lg" style={{ maxHeight: "60vh", overflow: "auto" }}>
                    <TypographyStylesProvider>
                        <div
                            dangerouslySetInnerHTML={{
                                __html: markdownToHtml(agreement.content),
                            }}
                        />
                    </TypographyStylesProvider>
                </Card>

                <Card withBorder padding="md" bg="gray.0">
                    <Checkbox
                        checked={accepted}
                        onChange={e => setAccepted(e.currentTarget.checked)}
                        label={t("checkbox")}
                        styles={{
                            label: { fontWeight: 500 },
                        }}
                    />
                </Card>

                <Button
                    size="lg"
                    onClick={handleAccept}
                    loading={accepting}
                    disabled={!accepted}
                    fullWidth
                >
                    {t("accept")}
                </Button>
            </Stack>
        </Container>
    );
}
