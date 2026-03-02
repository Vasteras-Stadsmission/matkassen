"use client";

import { Badge, Collapse, Group, Paper, Stack, Text, ActionIcon } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { IconChevronDown, IconChevronUp, IconCircleCheck } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { severityToColor } from "@/app/utils/dietary-severity";
import type { TodaySummaryStats } from "../../../types";
import type { TranslationFunction } from "../../../../types";

interface TodaySummaryCardProps {
    stats: TodaySummaryStats;
}

export function TodaySummaryCard({ stats }: TodaySummaryCardProps) {
    const t = useTranslations("schedule.todayHandouts.summary") as TranslationFunction;
    const [expanded, setExpanded] = useLocalStorage({
        key: "today-summary-expanded",
        defaultValue: false,
    });

    const hasExtendedStats =
        stats.memberCount > 0 || stats.pets.length > 0 || stats.additionalNeeds.length > 0;

    return (
        <Paper withBorder p={{ base: "xs", sm: "sm" }} radius="md">
            {/* Header row: title + toggle */}
            <Group justify="space-between" align="center" wrap="nowrap">
                <Text fw={500} size="sm">
                    {expanded ? t("title") : t("restrictionsTitle")}
                </Text>
                {hasExtendedStats && (
                    <ActionIcon
                        variant="subtle"
                        size="sm"
                        onClick={() => setExpanded(v => !v)}
                        aria-label={expanded ? t("collapse") : t("expand")}
                    >
                        {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                    </ActionIcon>
                )}
            </Group>

            {/* Dietary restrictions — always visible */}
            <Group gap={6} mt={6} wrap="wrap">
                {stats.dietaryRestrictions.length === 0 ? (
                    <Group gap={4} align="center">
                        <IconCircleCheck size={14} color="var(--mantine-color-green-6)" />
                        <Text size="xs" c="dimmed">
                            {t("noDietaryRestrictions")}
                        </Text>
                    </Group>
                ) : (
                    stats.dietaryRestrictions.map(r => (
                        <Badge
                            key={r.name}
                            color={severityToColor(r.color)}
                            variant="light"
                            size="sm"
                        >
                            {r.name} ×{r.count}
                        </Badge>
                    ))
                )}
            </Group>

            {/* Expanded section */}
            <Collapse in={expanded} transitionDuration={200}>
                <Stack gap={4} mt={8}>
                    {/* Divider */}
                    <div
                        style={{
                            borderTop: "1px dashed var(--mantine-color-default-border)",
                            marginBottom: 4,
                        }}
                    />

                    {/* Households & members */}
                    <Text size="xs" c="dimmed">
                        {t("householdsAndMembers", {
                            households: stats.householdCount,
                            members: stats.memberCount,
                        })}
                    </Text>

                    {/* Pets */}
                    {stats.pets.length > 0 && (
                        <Group gap={4} align="center" wrap="wrap">
                            <Text size="xs" c="dimmed">
                                {t("pets")}:
                            </Text>
                            {stats.pets.map((p, i) => (
                                <Text key={p.species} size="xs" c="dimmed">
                                    {p.species} ×{p.count}
                                    {i < stats.pets.length - 1 ? " ·" : ""}
                                </Text>
                            ))}
                        </Group>
                    )}

                    {/* Additional needs */}
                    {stats.additionalNeeds.length > 0 && (
                        <Group gap={4} align="center" wrap="wrap">
                            <Text size="xs" c="dimmed">
                                {t("additionalRequests")}:
                            </Text>
                            {stats.additionalNeeds.map((n, i) => (
                                <Text key={n.need} size="xs" c="dimmed">
                                    {n.need} ×{n.count}
                                    {i < stats.additionalNeeds.length - 1 ? " ·" : ""}
                                </Text>
                            ))}
                        </Group>
                    )}
                </Stack>
            </Collapse>
        </Paper>
    );
}
