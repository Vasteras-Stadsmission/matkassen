"use client";

import { Container, Title, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import { ReactNode } from "react";

interface Props {
    children: ReactNode;
}

export function HandoutLocationsPageLayout({ children }: Props) {
    const t = useTranslations("handoutLocations");

    return (
        <Container size="xl">
            <Title mb="md">{t("pageTitle")}</Title>
            <Text color="dimmed" mb="xl">
                {t("pageDescription")}
            </Text>
            {children}
        </Container>
    );
}
