import { Grid, Group, Text } from "@mantine/core";
import { addDays, format, startOfWeek } from "date-fns";
import { useMemo } from "react";
import { LocationScheduleInfo } from "@/app/[locale]/schedule/actions";
import { isTimeAvailable, getAvailableTimeRange } from "@/app/utils/schedule/location-availability";

// Define a minimal TimeSlotCell component since the import was causing issues
interface TimeSlotCellProps {
    time: string;
    isSelected?: boolean;
    isUnavailable?: boolean;
    unavailableReason?: string;
    onClick?: () => void;
}

function TimeSlotCell({
    time,
    isSelected,
    isUnavailable,
    unavailableReason,
    onClick,
}: TimeSlotCellProps) {
    return (
        <div
            style={{
                padding: "8px",
                border: "1px solid #ddd",
                borderRadius: "4px",
                backgroundColor: isSelected ? "#e6f7ff" : isUnavailable ? "#f5f5f5" : "white",
                cursor: isUnavailable ? "not-allowed" : "pointer",
                opacity: isUnavailable ? 0.6 : 1,
            }}
            title={unavailableReason}
            onClick={isUnavailable ? undefined : onClick}
        >
            {time}
        </div>
    );
}

export interface WeeklyScheduleGridProps {
    locationSchedule: LocationScheduleInfo;
    startDate?: Date;
    timeSlots?: string[];
    onTimeSlotClick?: (date: Date, timeSlot: string, isAvailable: boolean) => void;
    selectedDate?: Date;
    selectedTimeSlot?: string;
    weekStartsOnMonday?: boolean;
}

// Time slots if not specified otherwise
const DEFAULT_TIME_SLOTS = [
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
    "18:00",
];

/**
 * Grid component for displaying a weekly schedule with time slots
 */
export default function WeeklyScheduleGrid({
    locationSchedule,
    startDate = new Date(),
    timeSlots = DEFAULT_TIME_SLOTS,
    onTimeSlotClick,
    selectedDate,
    selectedTimeSlot,
    weekStartsOnMonday = true,
}: WeeklyScheduleGridProps) {
    // Generate a grid for the week starting from the given date
    const gridData = useMemo(() => {
        // Start the week on Monday (1) if specified, otherwise Sunday (0)
        const weekStart = startOfWeek(startDate, { weekStartsOn: weekStartsOnMonday ? 1 : 0 });

        // Generate the days of the week
        const days = Array.from({ length: 7 }, (_, i) => {
            const date = addDays(weekStart, i);
            return {
                date,
                dateString: format(date, "yyyy-MM-dd"),
                dayLabel: format(date, "EEE"),
                dateLabel: format(date, "MMM d"),
                availableTimeRange: getAvailableTimeRange(date, locationSchedule),
            };
        });

        // Map time slots to availability for each day
        const timeSlotsMap = timeSlots.map(timeSlot => {
            const dayAvailability = days.map(day => {
                const availability = isTimeAvailable(day.date, timeSlot, locationSchedule);
                return {
                    ...day,
                    timeSlot,
                    isAvailable: availability.isAvailable,
                    unavailableReason: availability.reason,
                };
            });

            return {
                timeSlot,
                days: dayAvailability,
            };
        });

        return {
            days,
            timeSlots: timeSlotsMap,
        };
    }, [startDate, timeSlots, locationSchedule, weekStartsOnMonday]);

    // Render the day headers (column headers)
    const dayHeaders = gridData.days.map((day, index) => (
        <Grid.Col span={1} key={`header-${index}`}>
            <Group justify="center" style={{ flexDirection: "column" }}>
                <Text size="sm" fw={500}>
                    {day.dayLabel}
                </Text>
                <Text size="xs" c="dimmed">
                    {day.dateLabel}
                </Text>
            </Group>
        </Grid.Col>
    ));

    // Render the time slot rows
    const timeSlotRows = gridData.timeSlots.map((row, rowIndex) => {
        const cells = row.days.map((cell, colIndex) => {
            const isSelected = Boolean(
                selectedDate &&
                    selectedTimeSlot &&
                    format(selectedDate, "yyyy-MM-dd") === cell.dateString &&
                    selectedTimeSlot === cell.timeSlot,
            );

            return (
                <Grid.Col span={1} key={`cell-${rowIndex}-${colIndex}`}>
                    <TimeSlotCell
                        time={cell.timeSlot}
                        isSelected={isSelected}
                        isUnavailable={!cell.isAvailable}
                        unavailableReason={cell.unavailableReason}
                        onClick={() => {
                            if (onTimeSlotClick) {
                                onTimeSlotClick(cell.date, cell.timeSlot, cell.isAvailable);
                            }
                        }}
                    />
                </Grid.Col>
            );
        });

        return (
            <Grid key={`row-${rowIndex}`} columns={7}>
                {cells}
            </Grid>
        );
    });

    return (
        <div>
            <Grid columns={7} mb="xs">
                {dayHeaders}
            </Grid>
            {timeSlotRows}
        </div>
    );
}

export interface TimeSlotGridData {
    days: {
        date: Date;
        dateString: string;
        dayLabel: string;
        dateLabel: string;
        availableTimeRange: {
            earliestTime: string | null;
            latestTime: string | null;
        };
    }[];
    timeSlots: {
        timeSlot: string;
        days: {
            date: Date;
            dateString: string;
            dayLabel: string;
            dateLabel: string;
            timeSlot: string;
            isAvailable: boolean;
            unavailableReason: string;
        }[];
    }[];
}
