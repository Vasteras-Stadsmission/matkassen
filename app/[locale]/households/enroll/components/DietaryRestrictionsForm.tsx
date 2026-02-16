"use client";

import { useState, useEffect } from "react";
import { Group, Title, Text, Chip, Loader, Badge, Stack } from "@mantine/core";
import { getDietaryRestrictions } from "../actions";
import { DietaryRestriction } from "../types";
import { useTranslations } from "next-intl";

interface DietaryRestrictionsFormProps {
    data: DietaryRestriction[];
    updateData: (data: DietaryRestriction[]) => void;
}

export default function DietaryRestrictionsForm({
    data,
    updateData,
}: DietaryRestrictionsFormProps) {
    const t = useTranslations("dietaryRestrictions");

    const [availableRestrictions, setAvailableRestrictions] = useState<DietaryRestriction[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const dbRestrictions = await getDietaryRestrictions();
                setAvailableRestrictions(dbRestrictions);
            } catch {
                setAvailableRestrictions([]);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    const isSelected = (id: string) => data.some(item => item.id === id);

    const toggleRestriction = (restriction: DietaryRestriction) => {
        if (isSelected(restriction.id)) {
            updateData(data.filter(item => item.id !== restriction.id));
            return;
        }

        if (restriction.isActive === false) {
            return;
        }

        updateData([...data, restriction]);
    };

    if (loading) {
        return (
            <Stack>
                <Title order={5}>{t("title")}</Title>
                <Group justify="center" py="md">
                    <Loader size="sm" />
                    <Text size="sm">{t("loading")}</Text>
                </Group>
            </Stack>
        );
    }

    return (
        <Stack gap="sm">
            <Title order={5}>{t("title")}</Title>

            <Group gap="xs">
                {availableRestrictions.map(restriction => {
                    const selected = isSelected(restriction.id);
                    const disabledForSelection = restriction.isActive === false && !selected;

                    return (
                        <Chip
                            key={restriction.id}
                            checked={selected}
                            onChange={() => toggleRestriction(restriction)}
                            disabled={disabledForSelection}
                            variant={selected ? "filled" : "outline"}
                            color={selected ? "blue" : "gray"}
                            radius="sm"
                            size="sm"
                        >
                            {restriction.name}
                            {restriction.isActive === false && (
                                <Badge ml={8} color="orange" variant="light" size="xs">
                                    {t("disabledLabel")}
                                </Badge>
                            )}
                        </Chip>
                    );
                })}
            </Group>
        </Stack>
    );
}
