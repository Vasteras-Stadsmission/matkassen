"use client";

import { useState, useEffect } from "react";
import {
    Box,
    Popover,
    Group,
    ActionIcon,
    Text,
    Table,
    Paper,
    TextInput,
    Transition,
    LoadingOverlay,
} from "@mantine/core";
import { useTranslations } from "next-intl";
import { IconCalendar, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { getWeekDateRange, getISOWeekNumber } from "@/app/utils/schedule/schedule-validation";
import { WeekSelection } from "../../types";
import { format, startOfWeek, addDays, isSameMonth, isSameDay, getISOWeekYear } from "date-fns";

interface WeekPickerProps {
    label?: string;
    value: WeekSelection | null;
    onChange: (selection: WeekSelection | null) => void;
    minDate?: Date;
    maxDate?: Date;
    // Controls how the selected value is displayed in the input
    // - 'range': shows start and end date (default)
    // - 'start': shows only the Monday date
    // - 'end': shows only the Sunday date
    displayMode?: "range" | "start" | "end";
}

// Helper to generate days for a month calendar
const generateCalendarDays = (year: number, month: number) => {
    const firstDayOfMonth = new Date(year, month, 1);
    const firstDayOfCalendar = startOfWeek(firstDayOfMonth, { weekStartsOn: 1 }); // Start on Monday

    // Generate 6 weeks (42 days) to ensure we cover the full month
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
        days.push(addDays(firstDayOfCalendar, i));
    }

    return days;
};

// Group days into weeks
const groupDaysIntoWeeks = (days: Date[]): Date[][] => {
    const weeks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
        weeks.push(days.slice(i, i + 7));
    }
    return weeks;
};

export function WeekPicker({
    label,
    value,
    onChange,
    minDate,
    maxDate,
    displayMode = "range",
}: WeekPickerProps) {
    const t = useTranslations("handoutLocations");
    const [opened, setOpened] = useState(false);
    const [selectedRow, setSelectedRow] = useState<number | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);

    // Current year and month for navigation
    const today = new Date();

    // By default, don't allow selecting dates in the past
    // If minDate is not explicitly provided, use today's date
    const effectiveMinDate = minDate || today;

    // State for year, month, and week selection
    const [selectedYear, setSelectedYear] = useState<number>(() => {
        if (value) {
            const { startDate } = getWeekDateRange(value.year, value.week);
            return startDate.getFullYear();
        }
        return today.getFullYear();
    });
    const [selectedMonth, setSelectedMonth] = useState<number>(() => {
        if (value) {
            const { startDate } = getWeekDateRange(value.year, value.week);
            return startDate.getMonth();
        }
        return today.getMonth();
    });
    const [selectedWeek, setSelectedWeek] = useState<number | undefined>(value?.week);

    // Generate calendar days and weeks
    const daysInCalendar = generateCalendarDays(selectedYear, selectedMonth);
    const weeksInCalendar = groupDaysIntoWeeks(daysInCalendar);

    // Format date range as a string
    const formatDateRange = (year: number, week: number) => {
        const { startDate, endDate } = getWeekDateRange(year, week);

        // Normalize to the UTC date-only to avoid timezone rollover (e.g., Sunday 23:59:59Z -> Monday local)
        const normalizeToUtcDateOnly = (date: Date) => new Date(date.toISOString().slice(0, 10));

        // Format dates with week numbers for clarity using normalized dates
        const formatDate = (date: Date) => {
            const normalized = normalizeToUtcDateOnly(date);
            const weekNum = getISOWeekNumber(normalized);
            return `${format(normalized, "yyyy-MM-dd")} (${t("week")} ${weekNum})`;
        };

        return `${formatDate(startDate)} — ${formatDate(endDate)}`;
    };

    // Get display value for input
    const getDisplayValue = () => {
        if (!value) return "";
        const { startDate, endDate } = getWeekDateRange(value.year, value.week);
        const normalizeToUtcDateOnly = (date: Date) => new Date(date.toISOString().slice(0, 10));
        const formatOne = (date: Date) => {
            const normalized = normalizeToUtcDateOnly(date);
            const weekNum = getISOWeekNumber(normalized);
            return `${format(normalized, "yyyy-MM-dd")} (${t("week")} ${weekNum})`;
        };

        if (displayMode === "start") {
            return `${t("week")} ${value.week}, ${value.year} (${formatOne(startDate)})`;
        }
        if (displayMode === "end") {
            return `${t("week")} ${value.week}, ${value.year} (${formatOne(endDate)})`;
        }
        // Default: show full range
        return `${t("week")} ${value.week}, ${value.year} (${formatDateRange(value.year, value.week)})`;
    };

    // Get week number for a given date
    const getWeekOfDate = (date: Date) => {
        return getISOWeekNumber(date);
    };

    // Handle week selection
    const handleWeekSelect = (week: Date[], rowIndex: number) => {
        if (isSelecting) return; // Prevent multiple clicks

        setIsSelecting(true);
        setSelectedRow(rowIndex);

        // Use the first day of the week to determine the week number and year
        const firstDayOfWeek = week[0];
        const weekNumber = getWeekOfDate(firstDayOfWeek);
        const year = getISOWeekYear(firstDayOfWeek);

        const newSelection = { year, week: weekNumber };

        // Brief delay to show the highlight effect before closing the popover
        setTimeout(() => {
            onChange(newSelection);
            setSelectedWeek(weekNumber);
            setOpened(false);

            // Reset selection state after popover closes
            setTimeout(() => {
                setIsSelecting(false);
                setSelectedRow(null);
            }, 300);
        }, 200);
    };

    // Handle month navigation
    const navigateMonth = (delta: number) => {
        let newMonth = selectedMonth + delta;
        let newYear = selectedYear;

        // Handle year change when navigating months
        if (newMonth > 11) {
            newMonth = 0;
            newYear += 1;
        } else if (newMonth < 0) {
            newMonth = 11;
            newYear -= 1;
        }

        setSelectedMonth(newMonth);
        setSelectedYear(newYear);
    };

    // Check if a week is disabled (outside min/max date range)
    const isWeekDisabled = (week: Date[]) => {
        if (!effectiveMinDate && !maxDate) return false;

        // Use first and last day of the week for comparison
        const firstDay = week[0];
        const lastDay = week[6];

        // If the entire week is in the past (the last day of the week is before min date)
        if (effectiveMinDate && lastDay < effectiveMinDate) return true;

        // If the week is after max date
        if (maxDate && firstDay > maxDate) return true;

        return false;
    };

    // Highlight current week
    const isCurrentWeek = (week: Date[]) => {
        const firstDay = week[0];
        const weekNum = getWeekOfDate(firstDay);
        return (
            getISOWeekYear(firstDay) === getISOWeekYear(today) && weekNum === getWeekOfDate(today)
        );
    };

    // Highlight selected week
    const isSelectedWeek = (week: Date[]) => {
        if (!value) return false;
        const firstDay = week[0];
        const weekNum = getWeekOfDate(firstDay);
        return getISOWeekYear(firstDay) === value.year && weekNum === value.week;
    };

    // Check if a day is within the current month
    const isCurrentMonth = (date: Date) => {
        return isSameMonth(date, new Date(selectedYear, selectedMonth, 1));
    };

    // Check if a day is today
    const isToday = (date: Date) => {
        return isSameDay(date, today);
    };

    // Get the name of the month for display
    const getMonthName = (month: number) => {
        return format(new Date(2023, month, 1), "MMMM");
    };

    // Update internal state when value changes externally
    useEffect(() => {
        if (value) {
            setSelectedWeek(value.week);
            // Derive calendar month/year from the actual week date range
            const { startDate } = getWeekDateRange(value.year, value.week);
            setSelectedYear(startDate.getFullYear());
            setSelectedMonth(startDate.getMonth());
        } else {
            setSelectedWeek(undefined);
        }
    }, [value]);

    return (
        <Box>
            {label && (
                <Text size="sm" fw={500} mb={4}>
                    {label}
                </Text>
            )}

            <Popover opened={opened} onChange={setOpened} position="bottom" width={400}>
                <Popover.Target>
                    <TextInput
                        placeholder={t("selectWeek")}
                        value={getDisplayValue()}
                        readOnly
                        onClick={() => setOpened(true)}
                        rightSection={
                            <Box
                                style={{
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    height: "100%",
                                }}
                                onClick={() => setOpened(true)}
                            >
                                <IconCalendar size={20} />
                            </Box>
                        }
                    />
                </Popover.Target>

                <Popover.Dropdown>
                    <Paper>
                        {/* Month and year navigation */}
                        <Group justify="space-between" mb="md">
                            <ActionIcon
                                variant="default"
                                onClick={() => navigateMonth(-1)}
                                aria-label={t("previousMonth")}
                            >
                                <IconChevronLeft size={16} />
                            </ActionIcon>

                            <Text fw={500}>
                                {getMonthName(selectedMonth)} {selectedYear}
                            </Text>

                            <ActionIcon
                                variant="default"
                                onClick={() => navigateMonth(1)}
                                aria-label={t("nextMonth")}
                            >
                                <IconChevronRight size={16} />
                            </ActionIcon>
                        </Group>

                        {/* Calendar with week selection */}
                        <Box pos="relative">
                            <LoadingOverlay
                                visible={isSelecting}
                                overlayProps={{ blur: 2, opacity: 0.2 }}
                                loaderProps={{ size: "sm", color: "blue" }}
                            />

                            <Table withTableBorder>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th ta="center" fw="bold">
                                            {t("week")}
                                        </Table.Th>
                                        {[
                                            "monday",
                                            "tuesday",
                                            "wednesday",
                                            "thursday",
                                            "friday",
                                            "saturday",
                                            "sunday",
                                        ].map(day => (
                                            <Table.Th
                                                key={day}
                                                ta="center"
                                                style={{ fontSize: "0.8rem" }}
                                            >
                                                {day.charAt(0).toUpperCase()}
                                            </Table.Th>
                                        ))}
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {weeksInCalendar.map((week, i) => {
                                        // Only show weeks that have at least one day in the current month
                                        if (!week.some(day => isCurrentMonth(day))) return null;

                                        const weekNum = getWeekOfDate(week[0]);
                                        const weekDisabled = isWeekDisabled(week);
                                        const isSelected = isSelectedWeek(week);
                                        const isCurrent = isCurrentWeek(week);
                                        const isHighlighted = selectedRow === i;

                                        return (
                                            <Transition
                                                key={i}
                                                mounted={true}
                                                transition="fade"
                                                duration={150}
                                            >
                                                {styles => (
                                                    <Table.Tr
                                                        style={{
                                                            ...styles,
                                                            cursor: weekDisabled
                                                                ? "not-allowed"
                                                                : isSelecting
                                                                  ? "wait"
                                                                  : "pointer",
                                                            backgroundColor: isHighlighted
                                                                ? "var(--mantine-color-blue-2)"
                                                                : isSelected
                                                                  ? "var(--mantine-color-blue-1)"
                                                                  : isCurrent
                                                                    ? "var(--mantine-color-green-0)"
                                                                    : undefined,
                                                            opacity: weekDisabled ? 0.5 : 1,
                                                            transition:
                                                                "background-color 0.2s ease",
                                                        }}
                                                        onClick={() =>
                                                            !weekDisabled &&
                                                            !isSelecting &&
                                                            handleWeekSelect(week, i)
                                                        }
                                                    >
                                                        <Table.Td ta="center" fw="bold">
                                                            {weekNum}
                                                        </Table.Td>
                                                        {week.map((day, j) => (
                                                            <Table.Td
                                                                key={j}
                                                                ta="center"
                                                                style={{
                                                                    color: !isCurrentMonth(day)
                                                                        ? "var(--mantine-color-gray-5)"
                                                                        : isToday(day)
                                                                          ? "var(--mantine-color-blue-6)"
                                                                          : undefined,
                                                                    fontWeight: isToday(day)
                                                                        ? "bold"
                                                                        : undefined,
                                                                }}
                                                            >
                                                                {format(day, "d")}
                                                            </Table.Td>
                                                        ))}
                                                    </Table.Tr>
                                                )}
                                            </Transition>
                                        );
                                    })}
                                </Table.Tbody>
                            </Table>
                        </Box>

                        {/* Selected week details */}
                        {selectedWeek && (
                            <Text size="sm" mt="md" ta="center">
                                {t("week")} {selectedWeek}, {selectedYear}:<br />
                                {formatDateRange(selectedYear, selectedWeek)}
                            </Text>
                        )}
                    </Paper>
                </Popover.Dropdown>
            </Popover>
        </Box>
    );
}
