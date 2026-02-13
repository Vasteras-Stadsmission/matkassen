"use client";

import { useState, useEffect } from "react";
import { Group, Title, Text, Card, Chip, Loader, Badge } from "@mantine/core";
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
            <Card withBorder p="md" radius="md">
                <Group justify="center" py="xl">
                    <Loader size="md" />
                    <Text>{t("loading")}</Text>
                </Group>
            </Card>
        );
    }

    return (
        <Card withBorder p="md" radius="md">
            <Title order={3} mb="md">
                {t("title")}
            </Title>
            <Text c="dimmed" size="sm" mb="lg">
                {t("description")}
            </Text>

            <Group mt="md">
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
                        >
                            {item.need}
                            {item.isActive === false && (
                                <Badge ml={8} color="orange" variant="light" size="xs">
                                    {/* @ts-expect-error next-intl type depth limit - key exists in en.json */}
                                    {t("disabledLabel")}
                                </Badge>
                            )}
                        </Chip>
                    );
                })}
            </Group>
        </Card>
    );
}
