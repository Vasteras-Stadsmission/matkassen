"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Divider,
    Drawer,
    Group,
    Loader,
    Modal,
    NumberInput,
    Paper,
    ScrollArea,
    SimpleGrid,
    Stack,
    Text,
    Title,
} from "@mantine/core";
import { DatePicker } from "@mantine/dates";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconCalendarStats, IconListCheck } from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";
import {
    applyDailyParcelLimits,
    getDailyLimitMonthData,
    resetDailyParcelLimits,
    updateLocationLimits,
} from "../../actions";
import type {
    DailyLimitConflict,
    LocationLimitsInput,
    PickupLocationWithAllData,
} from "../../types";
import type { DailyLimitMonthData } from "@/app/utils/capacity/daily-limits";
import { getDailyCapacityState } from "@/app/utils/capacity/daily-capacity";

interface LimitsTabProps {
    location: PickupLocationWithAllData;
    onLocationUpdated?: (id: string, updated: Partial<PickupLocationWithAllData>) => void;
}

type PendingConfirmation =
    | { kind: "defaults"; conflicts: DailyLimitConflict[] }
    | { kind: "apply"; conflicts: DailyLimitConflict[]; limit: number }
    | { kind: "reset"; conflicts: DailyLimitConflict[] }
    | null;

function dateKeysForMonth(monthKey: string): string[] {
    const [year, month] = monthKey.split("-").map(Number);
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length: days }, (_, index) =>
        [year, String(month).padStart(2, "0"), String(index + 1).padStart(2, "0")].join("-"),
    );
}

function currentMonthKey(): string {
    const formatter = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Stockholm",
        year: "numeric",
        month: "2-digit",
    });
    return formatter.format(new Date());
}

export function LimitsTab({ location, onLocationUpdated }: LimitsTabProps) {
    const t = useTranslations("handoutLocations.limits");
    const locale = useLocale();
    const compact = useMediaQuery("(max-width: 62rem)");
    const [visibleMonth, setVisibleMonth] = useState(`${currentMonthKey()}-01`);
    const [monthData, setMonthData] = useState<DailyLimitMonthData | null>(null);
    const [loadedCapacityByDate, setLoadedCapacityByDate] = useState<
        Record<string, { booked: number; limit: number | null }>
    >({});
    const [loadingMonth, setLoadingMonth] = useState(false);
    const [selectedDates, setSelectedDates] = useState<string[]>([]);
    const [dailyLimit, setDailyLimit] = useState<number | string>("");
    const [defaultDailyLimit, setDefaultDailyLimit] = useState<number | string>(
        location.parcels_max_per_day ?? "",
    );
    const [slotLimit, setSlotLimit] = useState<number | string>(
        location.max_parcels_per_slot ?? "",
    );
    const [savingDefaults, setSavingDefaults] = useState(false);
    const [savingDates, setSavingDates] = useState(false);
    const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation>(null);
    const [reviewOpened, reviewHandlers] = useDisclosure(false);
    const monthRequestId = useRef(0);

    const monthDateKeys = useMemo(() => dateKeysForMonth(visibleMonth.slice(0, 7)), [visibleMonth]);

    const loadMonth = useCallback(async () => {
        const requestId = ++monthRequestId.current;
        setLoadingMonth(true);
        const result = await getDailyLimitMonthData(location.id, monthDateKeys);
        if (requestId !== monthRequestId.current) return;
        if (result.success) {
            setMonthData(result.data);
            setLoadedCapacityByDate(current => {
                const next = { ...current };
                for (const [dateKey, limit] of Object.entries(result.data.effectiveDailyLimits)) {
                    next[dateKey] = {
                        booked: result.data.bookedCounts[dateKey] ?? 0,
                        limit,
                    };
                }
                return next;
            });
        } else {
            setMonthData(null);
            notifications.show({
                title: t("loadErrorTitle"),
                message: t("loadErrorMessage"),
                color: "red",
            });
        }
        setLoadingMonth(false);
    }, [location.id, monthDateKeys, t]);

    useEffect(() => {
        void loadMonth();
    }, [loadMonth]);

    useEffect(() => {
        setDefaultDailyLimit(location.parcels_max_per_day ?? "");
        setSlotLimit(location.max_parcels_per_slot ?? "");
        setSelectedDates([]);
        setLoadedCapacityByDate({});
    }, [location.id, location.max_parcels_per_slot, location.parcels_max_per_day]);

    const groupedSelection = useMemo(() => {
        const formatter = new Intl.DateTimeFormat(locale === "sv" ? "sv-SE" : "en-GB", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
        });
        const groups = new Map<string, { label: string; dates: string[] }>();
        for (const dateKey of [...selectedDates].sort()) {
            const monthKey = dateKey.slice(0, 7);
            const existing = groups.get(monthKey) ?? {
                label: formatter.format(new Date(`${monthKey}-15T12:00:00Z`)),
                dates: [],
            };
            existing.dates.push(dateKey);
            groups.set(monthKey, existing);
        }
        return [...groups.values()];
    }, [locale, selectedDates]);

    const finishMutation = useCallback(
        async (messageKey: "defaultsSaved" | "datesSaved" | "datesReset") => {
            setPendingConfirmation(null);
            setSelectedDates([]);
            await loadMonth();
            notifications.show({
                title: t("successTitle"),
                message: t(messageKey),
                color: "green",
            });
        },
        [loadMonth, t],
    );

    const saveDefaults = useCallback(
        async (acknowledgedConflictDates: string[] = []) => {
            const values: LocationLimitsInput = {
                parcels_max_per_day:
                    typeof defaultDailyLimit === "number" ? defaultDailyLimit : null,
                max_parcels_per_slot: typeof slotLimit === "number" ? slotLimit : null,
            };
            setSavingDefaults(true);
            const result = await updateLocationLimits(
                location.id,
                values,
                acknowledgedConflictDates,
            );
            setSavingDefaults(false);
            if (!result.success) {
                notifications.show({
                    title: t("saveErrorTitle"),
                    message: t("saveErrorMessage"),
                    color: "red",
                });
                return;
            }
            if (result.data.status === "confirmation_required") {
                setPendingConfirmation({ kind: "defaults", conflicts: result.data.conflicts });
                return;
            }
            onLocationUpdated?.(location.id, values);
            await finishMutation("defaultsSaved");
        },
        [defaultDailyLimit, finishMutation, location.id, onLocationUpdated, slotLimit, t],
    );

    const applyLimits = useCallback(
        async (acknowledgedConflictDates: string[] = [], confirmedLimit?: number) => {
            const limit = confirmedLimit ?? (typeof dailyLimit === "number" ? dailyLimit : NaN);
            if (!Number.isInteger(limit) || limit <= 0 || selectedDates.length === 0) return;
            setSavingDates(true);
            const result = await applyDailyParcelLimits(
                location.id,
                selectedDates,
                limit,
                acknowledgedConflictDates,
            );
            setSavingDates(false);
            if (!result.success) {
                notifications.show({
                    title: t("saveErrorTitle"),
                    message: t(
                        result.error.code === "CLOSED_DATE"
                            ? "closedDateError"
                            : "saveErrorMessage",
                    ),
                    color: "red",
                });
                return;
            }
            if (result.data.status === "confirmation_required") {
                setPendingConfirmation({
                    kind: "apply",
                    conflicts: result.data.conflicts,
                    limit,
                });
                return;
            }
            await finishMutation("datesSaved");
        },
        [dailyLimit, finishMutation, location.id, selectedDates, t],
    );

    const resetLimits = useCallback(
        async (acknowledgedConflictDates: string[] = []) => {
            if (selectedDates.length === 0) return;
            setSavingDates(true);
            const result = await resetDailyParcelLimits(
                location.id,
                selectedDates,
                acknowledgedConflictDates,
            );
            setSavingDates(false);
            if (!result.success) {
                notifications.show({
                    title: t("saveErrorTitle"),
                    message: t("saveErrorMessage"),
                    color: "red",
                });
                return;
            }
            if (result.data.status === "confirmation_required") {
                setPendingConfirmation({ kind: "reset", conflicts: result.data.conflicts });
                return;
            }
            await finishMutation("datesReset");
        },
        [finishMutation, location.id, selectedDates, t],
    );

    const confirmPending = async () => {
        if (!pendingConfirmation) return;
        const acknowledgedConflictDates = pendingConfirmation.conflicts.map(
            conflict => conflict.date,
        );
        if (pendingConfirmation.kind === "defaults") {
            await saveDefaults(acknowledgedConflictDates);
        }
        if (pendingConfirmation.kind === "apply") {
            await applyLimits(acknowledgedConflictDates, pendingConfirmation.limit);
        }
        if (pendingConfirmation.kind === "reset") {
            await resetLimits(acknowledgedConflictDates);
        }
    };

    const openDateSet = useMemo(() => new Set(monthData?.openDates ?? []), [monthData]);
    const todayDateKey = useMemo(
        () =>
            new Intl.DateTimeFormat("sv-SE", {
                timeZone: "Europe/Stockholm",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
            }).format(new Date()),
        [],
    );
    return (
        <Stack gap="lg">
            <div>
                <Title order={3}>{t("title")}</Title>
                <Text c="dimmed" size="sm">
                    {t("description")}
                </Text>
            </div>

            <Paper withBorder p={{ base: "sm", sm: "md" }}>
                <Stack>
                    <div>
                        <Text fw={600}>{t("defaultsTitle")}</Text>
                        <Text c="dimmed" size="sm">
                            {t("defaultsDescription")}
                        </Text>
                    </div>
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <NumberInput
                            label={t("defaultDailyLabel")}
                            placeholder={t("defaultDailyPlaceholder")}
                            min={1}
                            allowDecimal={false}
                            allowNegative={false}
                            value={defaultDailyLimit}
                            onChange={setDefaultDailyLimit}
                        />
                        <NumberInput
                            label={t("slotLimitLabel")}
                            description={t("slotLimitDescription")}
                            placeholder={t("slotLimitPlaceholder")}
                            min={1}
                            allowDecimal={false}
                            allowNegative={false}
                            value={slotLimit}
                            onChange={setSlotLimit}
                        />
                    </SimpleGrid>
                    <Group justify="flex-end">
                        <Button
                            type="button"
                            fullWidth={compact}
                            loading={savingDefaults}
                            onClick={() => void saveDefaults()}
                        >
                            {t("saveDefaults")}
                        </Button>
                    </Group>
                </Stack>
            </Paper>

            <Paper withBorder p={{ base: "sm", sm: "md" }}>
                <Stack>
                    <div>
                        <Text fw={600}>{t("specificDatesTitle")}</Text>
                        <Text c="dimmed" size="sm">
                            {t("specificDatesDescription")}
                        </Text>
                    </div>
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                        <Box pos="relative" style={{ minHeight: 340 }}>
                            {loadingMonth && (
                                <Box
                                    pos="absolute"
                                    inset={0}
                                    style={{ zIndex: 2, display: "grid", placeItems: "center" }}
                                >
                                    <Loader />
                                </Box>
                            )}
                            <DatePicker
                                type="multiple"
                                value={selectedDates}
                                onChange={setSelectedDates}
                                date={visibleMonth}
                                onDateChange={setVisibleMonth}
                                numberOfColumns={1}
                                size="md"
                                withWeekNumbers
                                excludeDate={dateKey => {
                                    if (!monthData) return true;
                                    if (dateKey < todayDateKey) return true;
                                    return (
                                        !openDateSet.has(dateKey) &&
                                        monthData.overrides[dateKey] === undefined
                                    );
                                }}
                                renderDay={dateKey => {
                                    const override = monthData?.overrides[dateKey];
                                    const effectiveLimit = monthData?.effectiveDailyLimits[dateKey];
                                    const booked = monthData?.bookedCounts[dateKey] ?? 0;
                                    const closed = monthData ? !openDateSet.has(dateKey) : false;
                                    const overCapacity =
                                        effectiveLimit !== undefined &&
                                        getDailyCapacityState(booked, effectiveLimit)
                                            .isOverCapacity;

                                    return (
                                        <Stack gap={0} align="center">
                                            <span>{Number(dateKey.slice(-2))}</span>
                                            <Group gap={3} wrap="nowrap">
                                                {closed && (
                                                    <Text
                                                        component="span"
                                                        size="xs"
                                                        fw={700}
                                                        aria-label={t("closedAria")}
                                                    >
                                                        ×
                                                    </Text>
                                                )}
                                                {override !== undefined && (
                                                    <Text
                                                        component="span"
                                                        size="xs"
                                                        fw={600}
                                                        aria-label={t("overrideAria", {
                                                            limit: String(override),
                                                        })}
                                                    >
                                                        {override}
                                                    </Text>
                                                )}
                                                {overCapacity && (
                                                    <Text
                                                        component="span"
                                                        size="xs"
                                                        fw={700}
                                                        c="red"
                                                        aria-label={t("overCapacityAria", {
                                                            booked: String(booked),
                                                            limit: String(effectiveLimit),
                                                        })}
                                                    >
                                                        !
                                                    </Text>
                                                )}
                                            </Group>
                                        </Stack>
                                    );
                                }}
                                previousLabel={t("previousMonth")}
                                nextLabel={t("nextMonth")}
                            />
                            <Group gap="md" mt="sm">
                                <Text size="xs">● {t("legendSelected")}</Text>
                                <Text size="xs">▣ {t("legendOverride")}</Text>
                                <Text size="xs">× {t("legendClosed")}</Text>
                                <Text size="xs">! {t("legendOverCapacity")}</Text>
                            </Group>
                        </Box>

                        <Paper bg="var(--mantine-color-default-hover)" p="md">
                            <Stack>
                                <Group justify="space-between" align="center">
                                    <div>
                                        <Text fw={600}>
                                            {t("selectedCount", { count: selectedDates.length })}
                                        </Text>
                                        <Button
                                            type="button"
                                            variant="subtle"
                                            px={0}
                                            leftSection={<IconListCheck size={18} />}
                                            disabled={selectedDates.length === 0}
                                            onClick={reviewHandlers.open}
                                        >
                                            {t("reviewDates")}
                                        </Button>
                                    </div>
                                    <IconCalendarStats size={28} aria-hidden="true" />
                                </Group>
                                <NumberInput
                                    label={t("selectedLimitLabel")}
                                    placeholder={t("selectedLimitPlaceholder")}
                                    min={1}
                                    allowDecimal={false}
                                    allowNegative={false}
                                    value={dailyLimit}
                                    onChange={setDailyLimit}
                                />
                                <Button
                                    type="button"
                                    fullWidth
                                    loading={savingDates}
                                    disabled={
                                        selectedDates.length === 0 ||
                                        typeof dailyLimit !== "number" ||
                                        dailyLimit <= 0
                                    }
                                    onClick={() => void applyLimits()}
                                >
                                    {t("applySelected")}
                                </Button>
                                <Button
                                    type="button"
                                    fullWidth
                                    variant="default"
                                    disabled={selectedDates.length === 0}
                                    loading={savingDates}
                                    onClick={() => void resetLimits()}
                                >
                                    {t("resetSelected")}
                                </Button>
                                <Button
                                    type="button"
                                    fullWidth
                                    variant="subtle"
                                    disabled={selectedDates.length === 0}
                                    onClick={() => setSelectedDates([])}
                                >
                                    {t("clearSelection")}
                                </Button>
                                <Text c="dimmed" size="sm">
                                    {t("independentDatesHelp")}
                                </Text>
                            </Stack>
                        </Paper>
                    </SimpleGrid>
                </Stack>
            </Paper>

            <Drawer
                opened={reviewOpened}
                onClose={reviewHandlers.close}
                title={t("reviewDatesTitle")}
                position={compact ? "bottom" : "right"}
                size={compact ? "75%" : "md"}
            >
                <Stack>
                    <Text c="dimmed" size="sm">
                        {t("reviewDatesDescription", { count: selectedDates.length })}
                    </Text>
                    {groupedSelection.map(group => (
                        <Stack key={group.label} gap="xs">
                            <Text fw={600} tt="capitalize">
                                {group.label}
                            </Text>
                            {group.dates.map(dateKey => {
                                const loadedCapacity = loadedCapacityByDate[dateKey];
                                const formattedDate = new Intl.DateTimeFormat(
                                    locale === "sv" ? "sv-SE" : "en-GB",
                                    { dateStyle: "long", timeZone: "UTC" },
                                ).format(new Date(`${dateKey}T12:00:00Z`));
                                const capacity = loadedCapacity
                                    ? getDailyCapacityState(
                                          loadedCapacity.booked,
                                          loadedCapacity.limit,
                                      )
                                    : null;

                                return (
                                    <Group
                                        key={dateKey}
                                        justify="space-between"
                                        align="flex-start"
                                        wrap="nowrap"
                                    >
                                        <Stack gap={2}>
                                            <Text>{formattedDate}</Text>
                                            {loadedCapacity && (
                                                <Text
                                                    size="sm"
                                                    c={capacity?.isOverCapacity ? "red" : "dimmed"}
                                                    fw={capacity?.isOverCapacity ? 600 : undefined}
                                                >
                                                    {loadedCapacity.limit === null
                                                        ? t("reviewDateCapacityWithoutLimit", {
                                                              booked: String(loadedCapacity.booked),
                                                          })
                                                        : t("reviewDateCapacity", {
                                                              booked: String(loadedCapacity.booked),
                                                              limit: String(loadedCapacity.limit),
                                                          })}
                                                </Text>
                                            )}
                                        </Stack>
                                        <Button
                                            type="button"
                                            variant="subtle"
                                            aria-label={t("removeDateAria", {
                                                date: formattedDate,
                                            })}
                                            onClick={() =>
                                                setSelectedDates(current =>
                                                    current.filter(value => value !== dateKey),
                                                )
                                            }
                                        >
                                            {t("removeDate")}
                                        </Button>
                                    </Group>
                                );
                            })}
                            <Divider />
                        </Stack>
                    ))}
                </Stack>
            </Drawer>

            <Modal
                opened={pendingConfirmation !== null}
                onClose={() => setPendingConfirmation(null)}
                title={t("confirmTitle")}
                centered
            >
                <Stack>
                    <Alert icon={<IconAlertTriangle size={18} />} color="orange">
                        {t("confirmDescription")}
                    </Alert>
                    <ScrollArea.Autosize mah="45vh" type="auto">
                        <Stack gap="xs" pr="sm">
                            {pendingConfirmation?.conflicts.map(conflict => (
                                <Text key={conflict.date} size="sm">
                                    {t("conflictLine", {
                                        date: new Intl.DateTimeFormat(
                                            locale === "sv" ? "sv-SE" : "en-GB",
                                            {
                                                dateStyle: "medium",
                                                timeZone: "UTC",
                                            },
                                        ).format(new Date(`${conflict.date}T12:00:00Z`)),
                                        booked: String(conflict.booked),
                                        limit: String(conflict.resultingLimit),
                                    })}
                                </Text>
                            ))}
                        </Stack>
                    </ScrollArea.Autosize>
                    <Group justify="flex-end">
                        <Button
                            type="button"
                            variant="default"
                            onClick={() => setPendingConfirmation(null)}
                        >
                            {t("cancel")}
                        </Button>
                        <Button type="button" color="orange" onClick={() => void confirmPending()}>
                            {t("confirmApply")}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
