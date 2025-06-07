"use client";

import { useState, useMemo } from "react";
import {
    Stack,
    Button,
    Paper,
    Title,
    Text,
    Card,
    Group,
    Badge,
    ActionIcon,
    Menu,
    Modal,
    Switch,
} from "@mantine/core";
import { useTranslations } from "next-intl";
import { useDisclosure } from "@mantine/hooks";
import { IconCalendarStats, IconEdit, IconTrash, IconDots, IconPlus } from "@tabler/icons-react";
import { format } from "date-fns";
import { PickupLocationScheduleWithDays, ScheduleInput } from "../../types";
import { ScheduleForm } from "./ScheduleForm";
import { getISOWeekNumber } from "@/app/utils/schedule/schedule-validation";

interface SchedulesListProps {
    schedules: PickupLocationScheduleWithDays[];
    onCreateSchedule: (schedule: ScheduleInput) => Promise<void>;
    onUpdateSchedule: (id: string, schedule: ScheduleInput) => Promise<void>;
    onDeleteSchedule: (id: string) => Promise<void>;
}

export function SchedulesList({
    schedules,
    onCreateSchedule,
    onUpdateSchedule,
    onDeleteSchedule,
}: SchedulesListProps) {
    const t = useTranslations("handoutLocations");
    const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] =
        useDisclosure(false);
    const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
    const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] =
        useDisclosure(false);
    const [currentSchedule, setCurrentSchedule] = useState<PickupLocationScheduleWithDays | null>(
        null,
    );
    const [showPastSchedules, setShowPastSchedules] = useState(false);

    // Check if a schedule is currently active
    const isActiveSchedule = (schedule: PickupLocationScheduleWithDays) => {
        const now = new Date();
        const startDate = new Date(schedule.start_date);
        const endDate = new Date(schedule.end_date);
        return now >= startDate && now <= endDate;
    };

    // Check if a schedule is in the future
    const isFutureSchedule = (schedule: PickupLocationScheduleWithDays) => {
        const now = new Date();
        const startDate = new Date(schedule.start_date);
        return startDate > now;
    };

    // Check if a schedule is in the past
    const isPastSchedule = (schedule: PickupLocationScheduleWithDays) => {
        const now = new Date();
        const endDate = new Date(schedule.end_date);
        return endDate < now;
    };

    // Memoized computed values to ensure proper re-rendering
    const sortedSchedules = useMemo(() => {
        return [...schedules].sort((a, b) => {
            return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
        });
    }, [schedules]);

    const filteredSchedules = useMemo(() => {
        return showPastSchedules
            ? sortedSchedules
            : sortedSchedules.filter(schedule => !isPastSchedule(schedule));
    }, [sortedSchedules, showPastSchedules]);

    const hiddenPastSchedulesCount = useMemo(() => {
        return sortedSchedules.filter(schedule => isPastSchedule(schedule)).length;
    }, [sortedSchedules]);

    // Format date displays with ISO week number
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const weekNum = getISOWeekNumber(date);
        return `${format(date, "yyyy-MM-dd")} (${t("week")} ${weekNum})`;
    };

    // Handle creating a new schedule
    const handleCreate = async (scheduleData: ScheduleInput) => {
        await onCreateSchedule(scheduleData);
        closeCreateModal();
    };

    // Handle editing a schedule
    const handleEdit = (schedule: PickupLocationScheduleWithDays) => {
        setCurrentSchedule(schedule);

        // Debug: Log the days to see what format opening_time and closing_time are in
        console.log("Opening schedule for editing:", schedule.name);
        schedule.days.forEach(day => {
            console.log(
                `${day.weekday}: is_open=${day.is_open}, opening_time=${day.opening_time}, closing_time=${day.closing_time}, type=${typeof day.opening_time}`,
            );
        });

        openEditModal();
    };

    // Handle saving edit changes
    const handleSaveEdit = async (scheduleData: ScheduleInput) => {
        if (currentSchedule) {
            await onUpdateSchedule(currentSchedule.id, scheduleData);
            closeEditModal();
        }
    };

    // Handle delete confirmation dialog
    const handleConfirmDelete = (schedule: PickupLocationScheduleWithDays) => {
        setCurrentSchedule(schedule);
        openDeleteModal();
    };

    // Handle executing the delete after confirmation
    const handleDelete = async () => {
        if (currentSchedule) {
            await onDeleteSchedule(currentSchedule.id);
            closeDeleteModal();
        }
    };

    return (
        <Stack>
            <Group justify="space-between" mb="md">
                <Title order={4}>{t("schedules")}</Title>
                <Button leftSection={<IconPlus size={16} />} onClick={openCreateModal}>
                    {t("addSchedule")}
                </Button>
            </Group>

            {sortedSchedules.length > 0 && hiddenPastSchedulesCount > 0 && (
                <Group justify="flex-end" mb="xs" align="center">
                    <Text size="sm" c="dimmed">
                        {showPastSchedules
                            ? t("hidePastSchedules")
                            : `${hiddenPastSchedulesCount} ${hiddenPastSchedulesCount === 1 ? t("pastScheduleHidden") : t("pastSchedulesHidden")}`}
                    </Text>
                    <Switch
                        checked={showPastSchedules}
                        onChange={event => setShowPastSchedules(event.currentTarget.checked)}
                        label={t("showPastSchedules")}
                        labelPosition="left"
                        size="sm"
                    />
                </Group>
            )}

            {filteredSchedules.length === 0 ? (
                <Paper p="md" withBorder>
                    <Text c="dimmed" ta="center">
                        {sortedSchedules.length === 0 ? t("noSchedulesYet") : t("noPastSchedules")}
                    </Text>
                </Paper>
            ) : (
                filteredSchedules.map((schedule, index) => (
                    <Card
                        key={`${schedule.id}-${schedule.name}-${index}`}
                        shadow="sm"
                        padding="md"
                        radius="md"
                        withBorder
                    >
                        <Group justify="space-between" mb="xs">
                            <Group>
                                <IconCalendarStats size={20} />
                                <Text fw={500}>{schedule.name}</Text>
                                {isActiveSchedule(schedule) && (
                                    <Badge color="green">{t("active")}</Badge>
                                )}
                                {isFutureSchedule(schedule) && (
                                    <Badge color="blue">{t("upcoming")}</Badge>
                                )}
                                {isPastSchedule(schedule) && (
                                    <Badge color="gray">{t("past")}</Badge>
                                )}
                            </Group>
                            <Menu position="bottom-end" withArrow>
                                <Menu.Target>
                                    <ActionIcon variant="subtle">
                                        <IconDots size={16} />
                                    </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Item
                                        leftSection={<IconEdit size={16} />}
                                        onClick={() => handleEdit(schedule)}
                                    >
                                        {t("edit")}
                                    </Menu.Item>
                                    <Menu.Item
                                        leftSection={<IconTrash size={16} />}
                                        color="red"
                                        onClick={() => handleConfirmDelete(schedule)}
                                    >
                                        {t("delete")}
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        </Group>

                        <Text size="sm" c="dimmed" mb="xs">
                            {formatDate(schedule.start_date)} &mdash;{" "}
                            {formatDate(schedule.end_date)}
                        </Text>

                        <Group gap="xs" mt="xs">
                            {schedule.days.map(
                                day =>
                                    day.is_open && (
                                        <Badge
                                            key={day.id}
                                            color={"blue"}
                                            variant={"outline"}
                                            size="md"
                                        >
                                            {t(`weekdays.${day.weekday}`)}
                                            {day.opening_time && day.closing_time && (
                                                <>
                                                    : {day.opening_time.slice(0, 5)} -{" "}
                                                    {day.closing_time.slice(0, 5)}
                                                </>
                                            )}
                                        </Badge>
                                    ),
                            )}
                        </Group>
                    </Card>
                ))
            )}

            {/* Create Schedule Modal */}
            <Modal
                opened={createModalOpened}
                onClose={closeCreateModal}
                title={t("addNewSchedule")}
                size="lg"
            >
                <ScheduleForm
                    onSubmit={handleCreate}
                    existingSchedules={schedules}
                    onCancel={closeCreateModal}
                />
            </Modal>

            {/* Edit Schedule Modal */}
            <Modal
                opened={editModalOpened}
                onClose={closeEditModal}
                title={t("editSchedule")}
                size="lg"
            >
                {currentSchedule && (
                    <ScheduleForm
                        onSubmit={handleSaveEdit}
                        existingSchedules={schedules}
                        initialValues={{
                            name: currentSchedule.name,
                            start_date: new Date(currentSchedule.start_date),
                            end_date: new Date(currentSchedule.end_date),
                            days: [
                                // Ensure days are in the correct order (monday to sunday)
                                // and that each day has the correct opening/closing time
                                ...[
                                    "monday",
                                    "tuesday",
                                    "wednesday",
                                    "thursday",
                                    "friday",
                                    "saturday",
                                    "sunday",
                                ].map(weekday => {
                                    // Find matching day from currentSchedule
                                    const matchingDay = currentSchedule.days.find(
                                        day => day.weekday === weekday,
                                    );

                                    if (matchingDay) {
                                        // Ensure opening_time and closing_time are correctly formatted as HH:MM strings
                                        // The database may be returning them in a different format (like HH:MM:SS)
                                        return {
                                            weekday: weekday as
                                                | "monday"
                                                | "tuesday"
                                                | "wednesday"
                                                | "thursday"
                                                | "friday"
                                                | "saturday"
                                                | "sunday",
                                            is_open: matchingDay.is_open,
                                            // Format time strings or use defaults
                                            opening_time: matchingDay.is_open
                                                ? matchingDay.opening_time
                                                    ? matchingDay.opening_time.substring(0, 5)
                                                    : "09:00"
                                                : "09:00",
                                            closing_time: matchingDay.is_open
                                                ? matchingDay.closing_time
                                                    ? matchingDay.closing_time.substring(0, 5)
                                                    : "17:00"
                                                : "17:00",
                                        };
                                    }

                                    // Fallback for any missing days (shouldn't happen)
                                    return {
                                        weekday: weekday as
                                            | "monday"
                                            | "tuesday"
                                            | "wednesday"
                                            | "thursday"
                                            | "friday"
                                            | "saturday"
                                            | "sunday",
                                        is_open: false,
                                        opening_time: "09:00",
                                        closing_time: "17:00",
                                    };
                                }),
                            ],
                        }}
                        scheduleId={currentSchedule.id}
                        onCancel={closeEditModal}
                    />
                )}
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                opened={deleteModalOpened}
                onClose={closeDeleteModal}
                title={t("confirmDeletion")}
                size="sm"
            >
                <Stack>
                    <Text>
                        {t("confirmDeleteScheduleMessage")}
                        {currentSchedule && (
                            <Text span fw={700}>
                                {currentSchedule.name}
                            </Text>
                        )}
                        ?
                    </Text>
                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={closeDeleteModal}>
                            {t("cancel")}
                        </Button>
                        <Button color="red" onClick={handleDelete}>
                            {t("delete")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
