"use client";

import { useState, useEffect } from "react";
import { Group, Title, Text, Chip, Loader, Stack } from "@mantine/core";
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

    const visibleNeeds = availableNeeds.filter(n => n.isActive !== false || isSelected(n.id));

    const toggleNeed = (need: AdditionalNeed) => {
        if (isSelected(need.id)) {
            updateData(data.filter(item => item.id !== need.id));
        } else {
            updateData([...data, need]);
        }
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
                {visibleNeeds.map(item => {
                    const selected = isSelected(item.id);

                    return (
                        <Chip
                            key={item.id}
                            checked={selected}
                            onChange={() => toggleNeed(item)}
                            variant={selected ? "filled" : "outline"}
                            color={selected ? "cyan" : "gray"}
                            radius="sm"
                            size="sm"
                        >
                            {item.need}
                        </Chip>
                    );
                })}
            </Group>
        </Stack>
    );
}
