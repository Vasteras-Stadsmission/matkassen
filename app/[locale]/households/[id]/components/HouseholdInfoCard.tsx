"use client";

import { Paper, Title, Stack, Group, ThemeIcon, Text, Avatar, Tooltip } from "@mantine/core";
import {
    IconUser,
    IconPhone,
    IconLanguage,
    IconUserCheck,
    IconCircleCheck,
} from "@tabler/icons-react";
import { useTranslations, useLocale } from "next-intl";
import type { GithubUserData } from "@/app/[locale]/households/enroll/types";
import { formatPhoneForDisplay } from "@/app/utils/validation/phone-validation";

interface HouseholdInfoCardProps {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    locale: string;
    createdBy: string | null;
    createdAt: Date | string | null;
    creatorGithubData?: GithubUserData | null;
    enrollmentSmsDelivered?: boolean;
    getLanguageName: (locale: string) => string;
}

export function HouseholdInfoCard({
    firstName,
    lastName,
    phoneNumber,
    locale,
    createdBy,
    createdAt,
    creatorGithubData,
    enrollmentSmsDelivered,
    getLanguageName,
}: HouseholdInfoCardProps) {
    const t = useTranslations("householdDetail");
    const currentLocale = useLocale();

    const formatDate = (date: Date | string | null) => {
        if (!date) return "";
        return new Date(date).toLocaleDateString(currentLocale, {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
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
                    <Text size="md">{formatPhoneForDisplay(phoneNumber)}</Text>
                    {enrollmentSmsDelivered && (
                        <Tooltip label={t("enrollmentSmsDelivered")} withArrow>
                            <ThemeIcon
                                size="sm"
                                variant="transparent"
                                color="green"
                                aria-label={t("enrollmentSmsDelivered")}
                            >
                                <IconCircleCheck size={16} />
                            </ThemeIcon>
                        </Tooltip>
                    )}
                </Group>
                <Group gap="sm">
                    <ThemeIcon size="lg" variant="light" color="blue">
                        <IconLanguage size={20} />
                    </ThemeIcon>
                    <Text size="md">{getLanguageName(locale)}</Text>
                </Group>
                {(createdBy || createdAt) && (
                    <Group gap="sm">
                        {creatorGithubData ? (
                            <Avatar
                                src={creatorGithubData.avatar_url}
                                alt={creatorGithubData.name || createdBy || ""}
                                size="md"
                                radius="xl"
                            />
                        ) : (
                            <ThemeIcon size="lg" variant="light" color="blue">
                                <IconUserCheck size={20} />
                            </ThemeIcon>
                        )}
                        <Text size="md">
                            {createdBy
                                ? t("createdBy", {
                                      username: creatorGithubData?.name || createdBy,
                                  })
                                : t("created")}
                            {createdAt && (
                                <Text span c="dimmed" size="sm">
                                    {" · "}
                                    {formatDate(createdAt)}
                                </Text>
                            )}
                        </Text>
                    </Group>
                )}
            </Stack>
        </Paper>
    );
}
