"use client";

import { Container, Paper, Stack, Title, Text, Button } from "@mantine/core";
import { IconArchive } from "@tabler/icons-react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/app/i18n/navigation";

interface AnonymizedHouseholdPageProps {
    anonymizedAt: Date;
}

export function AnonymizedHouseholdPage({ anonymizedAt }: AnonymizedHouseholdPageProps) {
    const t = useTranslations("householdDetail.removal");
    const locale = useLocale();

    const formattedDate = new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
    }).format(new Date(anonymizedAt));

    return (
        <Container size="sm" mt="xl">
            <Paper p="xl" withBorder>
                <Stack align="center" gap="md">
                    <IconArchive size={48} color="var(--mantine-color-gray-6)" />
                    <Title order={3}>{t("anonymizedTitle")}</Title>
                    <Text c="dimmed" ta="center">
                        {t("anonymizedMessage", { date: formattedDate })}
                    </Text>
                    <Text c="dimmed" ta="center" size="sm">
                        {t("anonymizedSubtext")}
                    </Text>
                    <Button component={Link} href="/households" mt="md">
                        {t("backToList")}
                    </Button>
                </Stack>
            </Paper>
        </Container>
    );
}
