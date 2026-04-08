"use client";

import { Container, Grid, Paper, Title, Box, useMantineTheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useTranslations } from "next-intl";
import { SettingsNav } from "./SettingsNav";

export function SettingsShell({ children }: { children: React.ReactNode }) {
    const t = useTranslations("settings");
    const theme = useMantineTheme();
    const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.md})`, false, {
        getInitialValueInEffect: true,
    });

    if (isMobile) {
        return (
            <Container size="xl" py="md">
                <Title order={1} mb="md">
                    {t("settings")}
                </Title>

                <Paper withBorder p="md" mb="lg">
                    <SettingsNav />
                </Paper>

                <Box>{children}</Box>
            </Container>
        );
    }

    return (
        <Container size="xl" py="xl">
            <Title order={1} mb="xl">
                {t("settings")}
            </Title>

            <Grid gutter="xl">
                <Grid.Col span={3}>
                    <Paper
                        withBorder
                        p="md"
                        style={{
                            position: "sticky",
                            top: "80px",
                        }}
                    >
                        <SettingsNav />
                    </Paper>
                </Grid.Col>

                <Grid.Col span={9}>
                    <Box>{children}</Box>
                </Grid.Col>
            </Grid>
        </Container>
    );
}
