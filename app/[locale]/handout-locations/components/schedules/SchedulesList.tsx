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
    Alert,
} from "@mantine/core";
import { useTranslations } from "next-intl";
import { useDisclosure } from "@mantine/hooks";
import { IconCalendarStats, IconEdit, IconTrash, IconDots, IconPlus } from "@tabler/icons-react";
import { format } from "date-fns";
import { PickupLocationScheduleWithDays, ScheduleInput } from "../../types";
import { ScheduleForm } from "./ScheduleForm";
import { getISOWeekNumber } from "@/app/utils/date-utils";
import { checkParcelsAffectedByScheduleDeletionAction } from "@/app/[locale]/schedule/client-actions";

interface SchedulesListProps {
    schedules: PickupLocationScheduleWithDays[];
    onCreateSchedule: (schedule: ScheduleInput) => Promise<void>;
    onUpdateSchedule: (id: string, schedule: ScheduleInput) => Promise<void>;
    onDeleteSchedule: (id: string) => Promise<void>;
    locationId: string; // Required to pass to ScheduleForm
}

export function SchedulesList({
    schedules,
    onCreateSchedule,
    onUpdateSchedule,
    onDeleteSchedule,
    locationId,
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

    // State for delete confirmation modal
    const [affectedParcelsCount, setAffectedParcelsCount] = useState<number>(0);
    const [isCheckingAffectedParcels, setIsCheckingAffectedParcels] = useState<boolean>(false);

    // Check if a schedule is currently active
    const isActiveSchedule = (schedule: PickupLocationScheduleWithDays) => {
        const now = new Date();
        const startDate = new Date(schedule.start_date);
        const endDate = new Date(schedule.end_date);

        // Compare dates without time components to avoid timezone issues
        const startDateOnly = new Date(
            startDate.getFullYear(),
            startDate.getMonth(),
            startDate.getDate(),
        );
        const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        return nowDateOnly >= startDateOnly && nowDateOnly <= endDateOnly;
    };

    // Check if a schedule is in the future
    const isFutureSchedule = (schedule: PickupLocationScheduleWithDays) => {
        const now = new Date();
        const startDate = new Date(schedule.start_date);

        // Compare dates without time components to avoid timezone issues
        const startDateOnly = new Date(
            startDate.getFullYear(),
            startDate.getMonth(),
            startDate.getDate(),
        );
        const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        return startDateOnly > nowDateOnly;
    };

    // Check if a schedule is in the past
    const isPastSchedule = (schedule: PickupLocationScheduleWithDays) => {
        const now = new Date();
        const endDate = new Date(schedule.end_date);

        // Compare dates without time components to avoid timezone issues
        const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        return endDateOnly < nowDateOnly;
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

        // Dispatch event to refresh schedule grid
        window.dispatchEvent(new CustomEvent("refreshScheduleGrid"));
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

            // Dispatch event to refresh schedule grid
            window.dispatchEvent(new CustomEvent("refreshScheduleGrid"));
        }
    };

    // Handle delete confirmation dialog
    const handleConfirmDelete = async (schedule: PickupLocationScheduleWithDays) => {
        setCurrentSchedule(schedule);
        setAffectedParcelsCount(0);
        setIsCheckingAffectedParcels(true);

        try {
            // Check how many parcels would be affected by this deletion
            const count = await checkParcelsAffectedByScheduleDeletionAction(locationId, {
                id: schedule.id,
                start_date: new Date(schedule.start_date),
                end_date: new Date(schedule.end_date),
                days: schedule.days.map(day => ({
                    weekday: day.weekday,
                    is_open: day.is_open,
                    opening_time: day.opening_time || undefined,
                    closing_time: day.closing_time || undefined,
                })),
            });
            setAffectedParcelsCount(count);
        } catch (error) {
            console.error("Error checking affected parcels:", error);
            setAffectedParcelsCount(0);
        } finally {
            setIsCheckingAffectedParcels(false);
        }

        openDeleteModal();
    };

    // Handle executing the delete after confirmation
    const handleDelete = async () => {
        if (currentSchedule) {
            await onDeleteSchedule(currentSchedule.id);
            closeDeleteModal();

            // Dispatch event to refresh the navbar badge
            window.dispatchEvent(new CustomEvent("refreshOutsideHoursCount"));
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
                filteredSchedules.map(schedule => (
                    <Card key={schedule.id} shadow="sm" padding="md" radius="md" withBorder>
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
                    locationId={locationId}
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
                        locationId={locationId}
                    />
                )}
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                opened={deleteModalOpened}
                onClose={closeDeleteModal}
                title={t("confirmDeletion")}
                size="md"
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

                    {isCheckingAffectedParcels && (
                        <Alert color="blue" title={t("checking")}>
                            {t("checkingAffectedParcels")}
                        </Alert>
                    )}

                    {!isCheckingAffectedParcels && affectedParcelsCount > 0 && (
                        <Alert color="orange" title={t("scheduleChangeWarning")}>
                            <Text>{t("parcelsWillBeAffected")}</Text>
                            <Text mt="xs">
                                {t("parcelsAffectedMessage", { count: affectedParcelsCount })}
                            </Text>
                            <Text size="sm" c="dimmed" mt="xs">
                                {t("parcelsAffectedExplanation")}
                            </Text>
                        </Alert>
                    )}

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={closeDeleteModal}>
                            {t("cancel")}
                        </Button>
                        <Button
                            color="red"
                            onClick={handleDelete}
                            loading={isCheckingAffectedParcels}
                        >
                            {t("delete")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
