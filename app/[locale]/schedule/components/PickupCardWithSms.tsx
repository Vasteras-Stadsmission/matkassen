"use client";

import { Paper, Text, Tooltip, ActionIcon, Group, Collapse, Button } from "@mantine/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FoodParcel } from "@/app/[locale]/schedule/types";
import { IconCalendarTime, IconMessage, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import styles from "./PickupCard.module.css";
import { useTranslations } from "next-intl";
import { memo, useMemo, useState, useEffect } from "react";
import SmsManagementPanel from "./SmsManagementPanel";
import { useSmsManagement } from "../hooks/useSmsManagement";
import { SmsRecord } from "@/app/utils/sms/sms-service";

interface PickupCardWithSmsProps {
    foodParcel: FoodParcel;
    isCompact?: boolean;
    onReschedule?: (foodParcel: FoodParcel) => void;
    showSmsPanel?: boolean;
}

function PickupCardWithSms({
    foodParcel,
    isCompact = false,
    onReschedule,
    showSmsPanel = false,
}: PickupCardWithSmsProps) {
    const t = useTranslations("schedule");

    const [smsExpanded, setSmsExpanded] = useState(false);
    const [smsHistory, setSmsHistory] = useState<SmsRecord[]>([]);
    const { sendSms, resendSms, fetchSmsHistory, isLoading } = useSmsManagement();

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: foodParcel.id,
        data: {
            foodParcel,
        },
    });

    // Fetch SMS history when panel is expanded
    useEffect(() => {
        if (smsExpanded && showSmsPanel) {
            fetchSmsHistory(foodParcel.id).then(setSmsHistory);
        }
    }, [smsExpanded, showSmsPanel, foodParcel.id, fetchSmsHistory]);

    // Memoize style calculation for better performance
    const style = useMemo(
        () => ({
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.5 : 1,
            willChange: "transform",
        }),
        [transform, transition, isDragging],
    );

    // Memoize color calculation
    const statusColor = useMemo(() => {
        if (foodParcel.isPickedUp) return "green.6";

        const now = new Date();
        const isInPast = foodParcel.pickupLatestTime < now;
        return isInPast ? "red.6" : "primary";
    }, [foodParcel.isPickedUp, foodParcel.pickupLatestTime]);

    // Memoize time formatting
    const timeDisplay = useMemo(() => {
        const formatTime = (date: Date) => {
            return date.toLocaleTimeString("sv-SE", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            });
        };

        return {
            earliest: formatTime(foodParcel.pickupEarliestTime),
            latest: formatTime(foodParcel.pickupLatestTime),
        };
    }, [foodParcel.pickupEarliestTime, foodParcel.pickupLatestTime]);

    // Handle click to open reschedule modal
    const handleRescheduleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onReschedule) {
            onReschedule(foodParcel);
        }
    };

    // Handle SMS panel toggle
    const handleSmsToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setSmsExpanded(!smsExpanded);
    };

    // Handle SMS actions
    const handleSendSms = async (parcelId: string, intent: "initial" | "reminder" | "manual") => {
        const success = await sendSms(parcelId, intent);
        if (success && smsExpanded) {
            // Refresh SMS history
            const newHistory = await fetchSmsHistory(parcelId);
            setSmsHistory(newHistory);
        }
    };

    const handleResendSms = async (smsId: string) => {
        const success = await resendSms(smsId);
        if (success && smsExpanded) {
            // Refresh SMS history
            const newHistory = await fetchSmsHistory(foodParcel.id);
            setSmsHistory(newHistory);
        }
    };

    const tooltipContent = (
        <div>
            <Text fw={600}>{foodParcel.householdName}</Text>
            <Text size="sm">
                {t("pickupTimeLabel")}: {timeDisplay.earliest} - {timeDisplay.latest}
            </Text>
            <Text size="sm">
                {t("statusLabel")}:{" "}
                {foodParcel.isPickedUp ? t("pickedUpStatus") : t("notPickedUpStatus")}
            </Text>
        </div>
    );

    if (isCompact) {
        return (
            <Tooltip
                label={tooltipContent}
                withArrow
                multiline
                withinPortal
                position="top"
                disabled={isDragging}
            >
                <Paper
                    ref={setNodeRef}
                    style={{
                        ...style,
                        "cursor": "grab",
                        "&:hover": { backgroundColor: "var(--mantine-color-blue-0)" },
                        "position": "relative",
                    }}
                    {...attributes}
                    {...listeners}
                    px="xs"
                    py={2}
                    radius="sm"
                    withBorder
                    bg="gray.0"
                    shadow="xs"
                    className={styles["pickup-card-compact"]}
                    data-dragging={isDragging}
                >
                    <Text size="xs" truncate fw={500}>
                        {foodParcel.householdName}
                    </Text>

                    <Group
                        gap={4}
                        style={{
                            position: "absolute",
                            top: "50%",
                            right: "4px",
                            transform: "translateY(-50%)",
                        }}
                    >
                        {showSmsPanel && (
                            <ActionIcon
                                size="xs"
                                variant="subtle"
                                color="blue"
                                onClick={handleSmsToggle}
                                className={styles["reschedule-button"]}
                                title="SMS Notifications"
                            >
                                <IconMessage size="0.8rem" />
                            </ActionIcon>
                        )}

                        {onReschedule && (
                            <ActionIcon
                                size="xs"
                                variant="subtle"
                                color="blue"
                                onClick={handleRescheduleClick}
                                className={styles["reschedule-button"]}
                                title={t("reschedule.outsideWeek")}
                            >
                                <IconCalendarTime size="0.8rem" />
                            </ActionIcon>
                        )}
                    </Group>
                </Paper>
            </Tooltip>
        );
    }

    return (
        <div>
            <Tooltip
                label={tooltipContent}
                withArrow
                multiline
                withinPortal
                position="top"
                disabled={isDragging}
            >
                <Paper
                    ref={setNodeRef}
                    style={{
                        ...style,
                        cursor: "grab",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                        position: "relative",
                    }}
                    {...attributes}
                    {...listeners}
                    p="xs"
                    radius="sm"
                    withBorder
                    bg="white"
                    shadow="xs"
                    className={styles["pickup-card"]}
                    data-dragging={isDragging}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <Text size="sm" fw={500} truncate style={{ flex: 1 }}>
                            {foodParcel.householdName}
                        </Text>

                        <div
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                backgroundColor: `var(--mantine-color-${statusColor})`,
                            }}
                        />
                    </div>

                    <Text size="xs" c="dimmed">
                        {timeDisplay.earliest}
                    </Text>

                    {showSmsPanel && (
                        <Button
                            size="xs"
                            variant="subtle"
                            leftSection={<IconMessage size={12} />}
                            rightSection={
                                smsExpanded ? (
                                    <IconChevronUp size={12} />
                                ) : (
                                    <IconChevronDown size={12} />
                                )
                            }
                            onClick={handleSmsToggle}
                            style={{ marginTop: "4px" }}
                        >
                            SMS
                        </Button>
                    )}

                    <Group gap={4} style={{ position: "absolute", top: "4px", right: "4px" }}>
                        {onReschedule && (
                            <ActionIcon
                                size="xs"
                                variant="subtle"
                                color="blue"
                                onClick={handleRescheduleClick}
                                className={styles["reschedule-button"]}
                                title={t("reschedule.outsideWeek")}
                            >
                                <IconCalendarTime size="0.8rem" />
                            </ActionIcon>
                        )}
                    </Group>
                </Paper>
            </Tooltip>

            {showSmsPanel && (
                <Collapse in={smsExpanded}>
                    <div style={{ marginTop: "8px" }}>
                        <SmsManagementPanel
                            parcel={foodParcel}
                            smsHistory={smsHistory}
                            onSendSms={handleSendSms}
                            onResendSms={handleResendSms}
                            isLoading={isLoading}
                        />
                    </div>
                </Collapse>
            )}
        </div>
    );
}

// Wrap with memo to prevent unnecessary re-renders during drag operations
export default memo(PickupCardWithSms);
