"use client";

import { Paper, Title, Text, Group, ThemeIcon } from "@mantine/core";
import { IconMars, IconVenus, IconGenderBigender } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

interface HouseholdMember {
    id?: string;
    age: number;
    sex: string;
}

interface HouseholdMembersCardProps {
    members: HouseholdMember[];
}

export function HouseholdMembersCard({ members }: HouseholdMembersCardProps) {
    const t = useTranslations("householdDetail");

    return (
        <Paper withBorder p="lg" radius="md">
            <Title order={3} size="h4" mb="md">
                {t("members", { count: String(members.length) })}
            </Title>
            {members.length > 0 ? (
                <Group gap="sm">
                    {members.map((member, index) => {
                        let iconColor = "gray";
                        let genderIcon;

                        if (member.sex === "male") {
                            iconColor = "blue";
                            genderIcon = <IconMars size={20} />;
                        } else if (member.sex === "female") {
                            iconColor = "pink";
                            genderIcon = <IconVenus size={20} />;
                        } else {
                            iconColor = "grape";
                            genderIcon = <IconGenderBigender size={20} />;
                        }

                        return (
                            <Paper key={member.id || index} radius="md" p="sm" withBorder>
                                <Group gap="xs">
                                    <ThemeIcon size="md" variant="light" color={iconColor}>
                                        {genderIcon}
                                    </ThemeIcon>
                                    <Text size="sm">
                                        {member.age} {t("ageUnit")}
                                    </Text>
                                </Group>
                            </Paper>
                        );
                    })}
                </Group>
            ) : (
                <Text c="dimmed" size="sm">
                    {t("noMembers")}
                </Text>
            )}
        </Paper>
    );
}
