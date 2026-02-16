"use client";

import { useState, useEffect } from "react";
import { Group, Title, Text, Chip, Loader, Badge, Stack } from "@mantine/core";
import { getAdditionalNeeds } from "../actions";
import { AdditionalNeed } from "../types";
import { useTranslations } from "next-intl";

interface AdditionalNeedsFormProps {
    data: AdditionalNeed[];
    updateData: (data: AdditionalNeed[]) => void;
}

export default function AdditionalNeedsForm({ data, updateData }: AdditionalNeedsFormProps) {
    const t = useTranslations("additionalNeeds");

    const [availableNeeds, setAvailableNeeds] = useState<AdditionalNeed[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchData() {
            try {
                const dbNeeds = await getAdditionalNeeds();
                setAvailableNeeds(dbNeeds);
            } catch {
                setAvailableNeeds([]);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    const isSelected = (id: string) => data.some(item => item.id === id);

    const toggleNeed = (need: AdditionalNeed) => {
        if (isSelected(need.id)) {
            updateData(data.filter(item => item.id !== need.id));
            return;
        }

        if (need.isActive === false) {
            return;
        }

        updateData([...data, need]);
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
                {availableNeeds.map(item => {
                    const selected = isSelected(item.id);
                    const disabledForSelection = item.isActive === false && !selected;

                    return (
                        <Chip
                            key={item.id}
                            checked={selected}
                            onChange={() => toggleNeed(item)}
                            disabled={disabledForSelection}
                            variant={selected ? "filled" : "outline"}
                            color={selected ? "blue" : "gray"}
                            radius="sm"
                            size="sm"
                        >
                            {item.need}
                            {item.isActive === false && (
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
