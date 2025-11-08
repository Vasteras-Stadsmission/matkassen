"use client";

import { Paper, Title, Stack, Group, ThemeIcon, Text, Avatar } from "@mantine/core";
import { IconUser, IconPhone, IconMailbox, IconLanguage, IconUserCheck } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import type { GithubUserData } from "@/app/[locale]/households/enroll/types";

interface HouseholdInfoCardProps {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    postalCode: string;
    locale: string;
    createdBy: string | null;
    creatorGithubData?: GithubUserData | null;
    getLanguageName: (locale: string) => string;
}

export function HouseholdInfoCard({
    firstName,
    lastName,
    phoneNumber,
    postalCode,
    locale,
    createdBy,
    creatorGithubData,
    getLanguageName,
}: HouseholdInfoCardProps) {
    const t = useTranslations("householdDetail");

    const formatPostalCode = (code: string) => {
        if (!code) return "";
        const digits = code.replace(/\D/g, "");
        if (digits.length === 5) {
            return `${digits.substring(0, 3)} ${digits.substring(3)}`;
        }
        return code;
    };

    return (
        <Paper withBorder p="lg" radius="md">
            <Title order={3} size="h4" mb="md">
                {t("basics")}
            </Title>
            <Stack gap="sm">
                <Group gap="sm">
                    <ThemeIcon size="lg" variant="light" color="blue">
                        <IconUser size={20} />
                    </ThemeIcon>
                    <Text size="md">
                        {firstName} {lastName}
                    </Text>
                </Group>
                <Group gap="sm">
                    <ThemeIcon size="lg" variant="light" color="blue">
                        <IconPhone size={20} />
                    </ThemeIcon>
                    <Text size="md">{phoneNumber}</Text>
                </Group>
                <Group gap="sm">
                    <ThemeIcon size="lg" variant="light" color="blue">
                        <IconMailbox size={20} />
                    </ThemeIcon>
                    <Text size="md">{formatPostalCode(postalCode)}</Text>
                </Group>
                <Group gap="sm">
                    <ThemeIcon size="lg" variant="light" color="blue">
                        <IconLanguage size={20} />
                    </ThemeIcon>
                    <Text size="md">{getLanguageName(locale)}</Text>
                </Group>
                {createdBy && (
                    <Group gap="sm">
                        {creatorGithubData ? (
                            <>
                                <Avatar
                                    src={creatorGithubData.avatar_url}
                                    alt={creatorGithubData.name || createdBy}
                                    size="md"
                                    radius="xl"
                                />
                                <Text size="md">
                                    {t("createdBy", {
                                        username: creatorGithubData.name || createdBy,
                                    })}
                                </Text>
                            </>
                        ) : (
                            <>
                                <ThemeIcon size="lg" variant="light" color="blue">
                                    <IconUserCheck size={20} />
                                </ThemeIcon>
                                <Text size="md">{t("createdBy", { username: createdBy })}</Text>
                            </>
                        )}
                    </Group>
                )}
            </Stack>
        </Paper>
    );
}
