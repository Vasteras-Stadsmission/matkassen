"use client";

import { Group, Text } from "@mantine/core";
import { IconCalendarEvent } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import {
    getHandoutCapacityLevel,
    type HandoutCapacityLevel,
    type UpcomingHandout,
} from "@/app/utils/schedule/upcoming-handouts";
import styles from "./ScheduleHubPage.module.css";

const STATUS_COLOR: Partial<Record<HandoutCapacityLevel, string>> = {
    almostFull: "yellow.8",
    full: "orange.8",
    over: "red.7",
};

interface UpcomingHandoutsProps {
    /** Undefined when the look-ahead couldn't be loaded */
    handouts: UpcomingHandout[] | undefined;
    hasUpcomingSchedule: boolean;
}

/** The next handout days of a pickup location, with booked parcels out of the day's limit. */
export function UpcomingHandouts({ handouts, hasUpcomingSchedule }: UpcomingHandoutsProps) {
    const t = useTranslations("schedule.hub");
    const format = useFormatter();

    if (!handouts) return null;
    // No opening hours at all: NoUpcomingScheduleBadge already says so
    if (!hasUpcomingSchedule && handouts.length === 0) return null;

    if (handouts.length === 0) {
        return (
            <Group gap={6} className={styles.upcoming} wrap="nowrap">
                <IconCalendarEvent size={16} />
                <Text size="sm" c="dimmed">
                    {t("noUpcomingHandouts")}
                </Text>
            </Group>
        );
    }

    return (
        <div className={styles.upcoming}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={2}>
                {t("upcoming")}
            </Text>
            <div className={styles.upcomingList}>
                {handouts.map(({ date, booked, limit }) => {
                    const level = getHandoutCapacityLevel(booked, limit);
                    const status =
                        level === "over"
                            ? t("overBy", { excess: String(booked - limit!) })
                            : level === "full"
                              ? t("full")
                              : level === "almostFull"
                                ? t("almostFull")
                                : null;
                    return (
                        <div key={date} className={styles.upcomingRow}>
                            <Text size="sm">
                                {format.dateTime(new Date(`${date}T12:00:00Z`), {
                                    weekday: "short",
                                    day: "numeric",
                                    month: "short",
                                    timeZone: "Europe/Stockholm",
                                })}
                            </Text>
                            <Text size="sm" fw={500} className={styles.upcomingCount}>
                                {limit === null
                                    ? t("bookedUnlimited", { booked: String(booked) })
                                    : `${booked}/${limit}`}
                            </Text>
                            <Text size="sm" fw={600} c={STATUS_COLOR[level]}>
                                {status}
                            </Text>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
