"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useForm } from "@mantine/form";
import {
    Box,
    Button,
    Group,
    Stack,
    TextInput,
    Paper,
    Title,
    Text,
    Divider,
    Alert,
    Checkbox,
    SimpleGrid,
} from "@mantine/core";
import { TimePicker } from "@mantine/dates";
import { useTranslations } from "next-intl";
import { IconAlertCircle } from "@tabler/icons-react";
import {
    PickupLocationScheduleWithDays,
    ScheduleDateRange,
    ScheduleDayInput,
    ScheduleInput,
    Weekday,
    WeekSelection,
} from "../../types";
import {
    findOverlappingSchedule,
    getWeekDateRange,
    getISOWeekNumber,
} from "@/app/utils/schedule/schedule-validation";
import { format } from "date-fns";
import { WeekPicker } from "./WeekPicker";

interface ScheduleFormProps {
    onSubmit: (data: ScheduleInput) => Promise<void>;
    existingSchedules: PickupLocationScheduleWithDays[];
    initialValues?: ScheduleInput;
    scheduleId?: string;
    onCancel: () => void;
}

// Default values for a new schedule
const getDefaultValues = (): ScheduleInput => {
    // Initialize with default dates
    const today = new Date();
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + ((8 - today.getDay()) % 7));

    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);

    const weekdays: Weekday[] = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    ];
    const days: ScheduleDayInput[] = weekdays.map(weekday => ({
        weekday,
        is_open: false,
        opening_time: "09:00",
        closing_time: "17:00",
    }));

    return {
        name: "",
        start_date: nextMonday,
        end_date: nextSunday,
        days,
    };
};

export function ScheduleForm({
    onSubmit,
    existingSchedules,
    initialValues,
    scheduleId,
    onCancel,
}: ScheduleFormProps) {
    const t = useTranslations("handoutLocations");
    const [saving, setSaving] = useState(false);
    const [showOverlapWarning, setShowOverlapWarning] = useState(false);
    const [overlappingSchedule, setOverlappingSchedule] =
        useState<PickupLocationScheduleWithDays | null>(null);

    // Add local state for the schedule name input to prevent typing lag
    const [localScheduleName, setLocalScheduleName] = useState<string>(initialValues?.name || "");

    // State for week selection
    const [startWeek, setStartWeek] = useState<WeekSelection | null>(() => {
        if (initialValues?.start_date) {
            const date = new Date(initialValues.start_date);
            return {
                year: date.getFullYear(),
                week: getISOWeekNumber(date),
            };
        }
        return null;
    });

    const [endWeek, setEndWeek] = useState<WeekSelection | null>(() => {
        if (initialValues?.end_date) {
            const date = new Date(initialValues.end_date);
            return {
                year: date.getFullYear(),
                week: getISOWeekNumber(date),
            };
        }
        return null;
    });

    // Initialize form with default or provided values
    const form = useForm<ScheduleInput>({
        initialValues: initialValues || getDefaultValues(),
        validate: {
            name: value => (!value.trim() ? t("scheduleName.required") : null),
            start_date: value => (!value ? t("startDate.required") : null),
            end_date: (value, values) => {
                if (!value) return t("endDate.required");

                // When the dates are from the same week, they're already valid
                // (start date is Monday, end date is Sunday of the same week)
                if (
                    startWeek &&
                    endWeek &&
                    startWeek.year === endWeek.year &&
                    startWeek.week === endWeek.week
                ) {
                    return null;
                }

                // Otherwise, normal validation applies
                if (value < values.start_date) return t("endDate.afterStartDate");
                return null;
            },
            days: value => {
                // Check if at least one day is open
                const hasOpenDay = value.some(day => day.is_open);
                if (!hasOpenDay) {
                    return t("days.atLeastOneRequired");
                }
                return null;
            },
        },
        validateInputOnBlur: true, // Validate inputs on blur instead of on every change
        validateInputOnChange: ["days", "start_date", "end_date"], // Remove 'name' from validation on change
    });

    // Update the form name value when local name changes, but only on blur
    const handleScheduleNameBlur = () => {
        form.setFieldValue("name", localScheduleName);
    };

    // Update form dates when week selection changes - memoize handlers
    const handleStartWeekChange = useCallback(
        (value: WeekSelection | null): void => {
            setStartWeek(value);
            if (value) {
                const { startDate } = getWeekDateRange(value.year, value.week);
                form.setFieldValue("start_date", startDate);

                // If end week exists and is now earlier than this new start week,
                // update the end week to match the start week
                if (
                    endWeek &&
                    (value.year > endWeek.year ||
                        (value.year === endWeek.year && value.week > endWeek.week))
                ) {
                    const { endDate } = getWeekDateRange(value.year, value.week);
                    form.setFieldValue("end_date", endDate);
                    setEndWeek(value);
                }
            }
        },
        [form, endWeek],
    );

    const handleEndWeekChange = useCallback(
        (value: WeekSelection | null): void => {
            setEndWeek(value);
            if (value) {
                // Compare with start week to prevent selecting a week earlier than the start week
                if (
                    startWeek &&
                    (value.year < startWeek.year ||
                        (value.year === startWeek.year && value.week < startWeek.week))
                ) {
                    // If the selected end week is earlier than start week, use the start week
                    const { endDate } = getWeekDateRange(startWeek.year, startWeek.week);
                    form.setFieldValue("end_date", endDate);
                    // Also update the end week state to reflect the valid selection
                    setEndWeek(startWeek);
                    return;
                }

                const { endDate } = getWeekDateRange(value.year, value.week);
                form.setFieldValue("end_date", endDate);
            }
        },
        [form, startWeek],
    );

    // Helper text to explain the impact on food parcel scheduling
    // Using a string directly to avoid type errors with translation keys not yet in type definitions
    const scheduleImpactText =
        "The schedule you set here will determine when users can pick up food parcels. Only dates and times within your schedule will be available for scheduling on the food parcel page.";

    // Memoize the check for overlapping schedules with a separate state to avoid re-renders
    const checkOverlap = useCallback(() => {
        const { start_date, end_date } = form.values;

        // Only check for overlaps when both dates are selected (not null)
        // and when startWeek and endWeek are explicitly set by the user
        if (!start_date || !end_date || !startWeek || !endWeek) {
            // Clear any previous warnings if dates are not yet selected
            setOverlappingSchedule(null);
            setShowOverlapWarning(false);
            return;
        }

        const newSchedule: ScheduleDateRange = {
            id: scheduleId, // Include ID if editing to exclude current schedule
            start_date,
            end_date,
        };

        // Convert existing schedules to the format expected by overlap check
        const existingDateRanges: ScheduleDateRange[] = existingSchedules.map(schedule => ({
            id: schedule.id,
            start_date: new Date(schedule.start_date),
            end_date: new Date(schedule.end_date),
        }));

        const overlap = findOverlappingSchedule(newSchedule, existingDateRanges);

        if (overlap) {
            const overlappingScheduleObj = existingSchedules.find(s => s.id === overlap.id) || null;
            setOverlappingSchedule(overlappingScheduleObj);
            setShowOverlapWarning(true);
        } else {
            setOverlappingSchedule(null);
            setShowOverlapWarning(false);
        }
    }, [form.values, existingSchedules, scheduleId, startWeek, endWeek]);

    // Use a ref to track if we should perform date validation
    const dateFieldsChanged = useRef(false);

    // Check for overlapping schedules with debounce only when date fields change
    useEffect(() => {
        dateFieldsChanged.current = true;
        const timer = setTimeout(() => {
            if (dateFieldsChanged.current) {
                checkOverlap();
                dateFieldsChanged.current = false;
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [form.values.start_date, form.values.end_date, checkOverlap]);

    // Handle form submission
    const handleSubmit = async (values: ScheduleInput) => {
        setSaving(true);
        try {
            // Perform explicit date validation check before submitting
            if (values.start_date && values.end_date && values.start_date > values.end_date) {
                form.setFieldError("end_date", t("endDate.afterStartDate"));
                setSaving(false);
                return;
            }

            // Convert Date objects to ISO strings for safe processing
            const formattedValues: ScheduleInput = {
                ...values,
                name: values.name,
                days: values.days,
                start_date: values.start_date, // Keep start_date as a Date for the API
                end_date: values.end_date, // Keep end_date as a Date for the API
            };
            await onSubmit(formattedValues);
        } finally {
            setSaving(false);
        }
    };

    // Helper to format date for display
    const formatDate = (date: Date) => {
        return format(date, "yyyy-MM-dd");
    };

    return (
        <Box>
            <form
                onSubmit={form.onSubmit(
                    handleSubmit as (values: typeof form.values) => Promise<void>,
                )}
            >
                <Stack gap="md">
                    <TextInput
                        label={t("scheduleName.label")}
                        placeholder={t("scheduleNamePlaceholder")}
                        required
                        value={localScheduleName} // Use local state value
                        onChange={event => setLocalScheduleName(event.currentTarget.value)} // Update local state immediately
                        onBlur={handleScheduleNameBlur} // Update form value on blur
                    />

                    {/* Week-based date selection */}
                    <Group grow>
                        <WeekPicker
                            label={t("startWeek")}
                            value={startWeek}
                            onChange={
                                handleStartWeekChange as (selection: WeekSelection | null) => void
                            }
                            // Default behavior now prevents selecting weeks in the past
                        />
                        <WeekPicker
                            label={t("endWeek")}
                            value={endWeek}
                            onChange={
                                handleEndWeekChange as (selection: WeekSelection | null) => void
                            }
                            // Allow selecting the same week as the start week by using the start of that week
                            // instead of using the start date directly, which would disable the week itself
                            minDate={
                                startWeek
                                    ? new Date(startWeek.year, 0, 1 + (startWeek.week - 1) * 7)
                                    : undefined
                            }
                        />
                    </Group>

                    {showOverlapWarning && overlappingSchedule && (
                        <Alert
                            icon={<IconAlertCircle size={16} />}
                            title={t("scheduleOverlapWarning")}
                            color="orange"
                        >
                            <Text size="sm">
                                {t("scheduleOverlapMessage", {
                                    scheduleName: overlappingSchedule.name,
                                    startDate: formatDate(new Date(overlappingSchedule.start_date)),
                                    endDate: formatDate(new Date(overlappingSchedule.end_date)),
                                })}
                            </Text>
                        </Alert>
                    )}

                    <Paper p="md" withBorder>
                        <Title order={4} mb="md">
                            {t("weekdaySchedule")}
                        </Title>
                        <Text size="sm" mb="lg">
                            {t("configureEachWeekday")}
                        </Text>

                        {/* Column headers for the time inputs */}
                        <SimpleGrid cols={3} mb="md">
                            <Text fw={500}>{t("weekday")}</Text>
                            <Text fw={500}>{t("openingTime")}</Text>
                            <Text fw={500}>{t("closingTime")}</Text>
                        </SimpleGrid>

                        {/* Weekday rows with time inputs */}
                        {form.values.days.map((day, index) => (
                            <Box key={day.weekday} mb="md">
                                <SimpleGrid cols={3}>
                                    <Group>
                                        <Checkbox
                                            checked={day.is_open}
                                            onChange={event => {
                                                form.setFieldValue(
                                                    `days.${index}.is_open`,
                                                    event.currentTarget.checked,
                                                );
                                            }}
                                            label={t(`weekdays.${day.weekday}`)}
                                        />
                                    </Group>

                                    <TimePicker
                                        disabled={!day.is_open}
                                        value={form.values.days[index].opening_time}
                                        onChange={value => {
                                            form.setFieldValue(
                                                `days.${index}.opening_time`,
                                                value || "09:00",
                                            );
                                        }}
                                        min="08:00"
                                        max="23:00"
                                        minutesStep={15}
                                        withDropdown
                                        size="sm"
                                    />

                                    <TimePicker
                                        disabled={!day.is_open}
                                        value={form.values.days[index].closing_time}
                                        onChange={value => {
                                            form.setFieldValue(
                                                `days.${index}.closing_time`,
                                                value || "17:00",
                                            );
                                        }}
                                        min="08:00"
                                        max="23:00"
                                        minutesStep={15}
                                        withDropdown
                                        size="sm"
                                    />
                                </SimpleGrid>

                                {index < form.values.days.length - 1 && <Divider my="sm" />}
                            </Box>
                        ))}
                    </Paper>

                    {/* Helper text for schedule impact */}
                    <Text size="sm" c="dimmed">
                        {scheduleImpactText}
                    </Text>

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={onCancel} disabled={saving}>
                            {t("cancel")}
                        </Button>
                        <Button
                            type="submit"
                            loading={saving}
                            disabled={
                                showOverlapWarning ||
                                !startWeek ||
                                !endWeek ||
                                !form.values.days.some(day => day.is_open)
                            }
                        >
                            {initialValues ? t("saveChanges") : t("createSchedule")}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Box>
    );
}
