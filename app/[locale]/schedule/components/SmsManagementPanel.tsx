"use client";

import {
    ActionIcon,
    Badge,
    Button,
    Card,
    Group,
    Stack,
    Text,
    Tooltip,
    Modal,
    Timeline,
    ThemeIcon,
    Alert,
} from "@mantine/core";
import {
    IconSend,
    IconRepeat,
    IconMessage,
    IconCheck,
    IconX,
    IconClock,
    IconInfoCircle,
} from "@tabler/icons-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { FoodParcel } from "@/app/[locale]/schedule/types";

interface SmsRecord {
    id: string;
    intent: "initial" | "reminder" | "manual";
    status: "pending" | "sent" | "delivered" | "failed" | "cancelled";
    sentAt?: Date;
    deliveredAt?: Date;
    failureReason?: string;
    retryCount: number;
}

interface SmsManagementPanelProps {
    parcel: FoodParcel;
    smsHistory?: SmsRecord[];
    onSendSms?: (parcelId: string, intent: "initial" | "reminder" | "manual") => void;
    onResendSms?: (smsId: string) => void;
    isLoading?: boolean;
}

export default function SmsManagementPanel({
    parcel,
    smsHistory = [],
    onSendSms,
    onResendSms,
    isLoading = false,
}: SmsManagementPanelProps) {
    const t = useTranslations("schedule.sms");
    const [showHistory, setShowHistory] = useState(false);

    const getStatusBadge = (status: SmsRecord["status"]) => {
        const statusConfig = {
            pending: { color: "yellow", icon: IconClock, label: t("status.pending") },
            sent: { color: "blue", icon: IconSend, label: t("status.sent") },
            delivered: { color: "green", icon: IconCheck, label: t("status.delivered") },
            failed: { color: "red", icon: IconX, label: t("status.failed") },
            cancelled: { color: "gray", icon: IconX, label: t("status.cancelled") },
        };

        const config = statusConfig[status];
        return (
            <Badge variant="light" color={config.color} leftSection={<config.icon size={12} />}>
                {config.label}
            </Badge>
        );
    };

    const getIntentLabel = (intent: SmsRecord["intent"]) => {
        const labels = {
            initial: t("intent.initial"),
            reminder: t("intent.reminder"),
            manual: t("intent.manual"),
        };
        return labels[intent];
    };

    const latestSms = smsHistory[smsHistory.length - 1];
    const hasBeenNotified = smsHistory.some(
        sms => sms.status === "delivered" && sms.intent === "initial",
    );
    const canSendInitial = !hasBeenNotified && !latestSms?.status?.includes("pending");
    const canSendReminder = hasBeenNotified && !latestSms?.status?.includes("pending");

    return (
        <Card withBorder p="sm" radius="md">
            <Stack gap="xs">
                <Group justify="space-between" align="center">
                    <Text size="sm" fw={500}>
                        {t("title")}
                    </Text>
                    <Group gap="xs">
                        {latestSms && getStatusBadge(latestSms.status)}
                        <Tooltip label={t("viewHistory")}>
                            <ActionIcon
                                variant="subtle"
                                size="sm"
                                onClick={() => setShowHistory(true)}
                            >
                                <IconMessage size={16} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>

                <Group gap="xs">
                    <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconSend size={14} />}
                        disabled={!canSendInitial || isLoading}
                        onClick={() => onSendSms?.(parcel.id, "initial")}
                        loading={isLoading}
                    >
                        {t("actions.sendInitial")}
                    </Button>

                    <Button
                        size="xs"
                        variant="light"
                        color="orange"
                        leftSection={<IconRepeat size={14} />}
                        disabled={!canSendReminder || isLoading}
                        onClick={() => onSendSms?.(parcel.id, "reminder")}
                        loading={isLoading}
                    >
                        {t("actions.sendReminder")}
                    </Button>

                    {latestSms?.status === "failed" && (
                        <Button
                            size="xs"
                            variant="light"
                            color="red"
                            leftSection={<IconRepeat size={14} />}
                            disabled={isLoading}
                            onClick={() => onResendSms?.(latestSms.id)}
                            loading={isLoading}
                        >
                            {t("actions.resend")}
                        </Button>
                    )}
                </Group>

                {!hasBeenNotified && (
                    <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                        {t("notifications.noInitialSms")}
                    </Alert>
                )}
            </Stack>

            <Modal
                opened={showHistory}
                onClose={() => setShowHistory(false)}
                title={t("historyModal.title")}
                size="md"
            >
                <Stack gap="md">
                    {smsHistory.length === 0 ? (
                        <Text c="dimmed" ta="center">
                            {t("historyModal.noHistory")}
                        </Text>
                    ) : (
                        <Timeline active={smsHistory.length} bulletSize={24} lineWidth={2}>
                            {smsHistory.map(sms => (
                                <Timeline.Item
                                    key={sms.id}
                                    bullet={
                                        <ThemeIcon
                                            size={20}
                                            variant="filled"
                                            color={
                                                sms.status === "delivered"
                                                    ? "green"
                                                    : sms.status === "failed"
                                                      ? "red"
                                                      : sms.status === "sent"
                                                        ? "blue"
                                                        : "yellow"
                                            }
                                        >
                                            {sms.status === "delivered" && <IconCheck size={12} />}
                                            {sms.status === "failed" && <IconX size={12} />}
                                            {sms.status === "sent" && <IconSend size={12} />}
                                            {sms.status === "pending" && <IconClock size={12} />}
                                        </ThemeIcon>
                                    }
                                    title={
                                        <Group gap="xs">
                                            <Text size="sm" fw={500}>
                                                {getIntentLabel(sms.intent)}
                                            </Text>
                                            {getStatusBadge(sms.status)}
                                        </Group>
                                    }
                                >
                                    <Stack gap="xs">
                                        {sms.sentAt && (
                                            <Text size="xs" c="dimmed">
                                                {t("historyModal.sentAt")}:{" "}
                                                {sms.sentAt.toLocaleString()}
                                            </Text>
                                        )}
                                        {sms.deliveredAt && (
                                            <Text size="xs" c="dimmed">
                                                {t("historyModal.deliveredAt")}:{" "}
                                                {sms.deliveredAt.toLocaleString()}
                                            </Text>
                                        )}
                                        {sms.failureReason && (
                                            <Text size="xs" c="red">
                                                {t("historyModal.error")}: {sms.failureReason}
                                            </Text>
                                        )}
                                        {sms.retryCount > 0 && (
                                            <Text size="xs" c="dimmed">
                                                {t("historyModal.retries")}: {sms.retryCount}
                                            </Text>
                                        )}
                                    </Stack>
                                </Timeline.Item>
                            ))}
                        </Timeline>
                    )}
                </Stack>
            </Modal>
        </Card>
    );
}
