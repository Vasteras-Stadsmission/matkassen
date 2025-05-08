"use client";

import { Box, Text, Title, Paper, Alert } from "@mantine/core";
import { useTranslations } from "next-intl";
import { IconAlertCircle, IconInfoCircle } from "@tabler/icons-react";
import { TranslationFunction } from "../../types";

export default function SpecialOpeningDaysTab() {
    // Using the default namespace with type assertion to avoid namespace type errors
    const t = useTranslations() as TranslationFunction;

    return (
        <Box>
            <Paper p="lg" withBorder mb="xl" radius="md">
                <Title order={3} mb="md">
                    {t("special.title", {})}
                </Title>

                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title={t("special.deprecated.title", {})}
                    color="yellow"
                    mb="lg"
                >
                    {t("special.deprecated.message", {})}
                </Alert>

                <Text mb="lg">{t("special.description", {})}</Text>

                <Alert icon={<IconInfoCircle size="1rem" />} color="blue">
                    {t("special.useSchedules", {})}
                </Alert>
            </Paper>
        </Box>
    );
}
