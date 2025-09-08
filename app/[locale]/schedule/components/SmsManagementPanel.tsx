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
    IconRefresh,
    IconQuestionMark,
} from "@tabler/icons-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { FoodParcel } from "@/app/[locale]/schedule/types";
import { SmsRecord } from "@/app/utils/sms/sms-service";

interface SmsManagementPanelProps {
    parcel: FoodParcel;
    smsHistory?: SmsRecord[];
    onSendSms?: (parcelId: string, intent: "initial" | "reminder" | "manual") => void;
    onResendSms?: (smsId: string) => void;
    isLoading?: boolean;
    testMode?: boolean; // Add testMode prop
}

export default function SmsManagementPanel({
    parcel,
    smsHistory = [],
    onSendSms,
    onResendSms,
    isLoading = false,
    testMode = false,
}: SmsManagementPanelProps) {
    const t = useTranslations("schedule.sms");
    const [showHistory, setShowHistory] = useState(false);

    const getStatusBadge = (status: SmsRecord["status"]) => {
        const statusConfig = {
            queued: { color: "yellow", icon: IconClock, label: "Queued" },
            sending: { color: "blue", icon: IconSend, label: "Sending" },
            sent: { color: "blue", icon: IconSend, label: t("status.sent") },
            delivered: { color: "green", icon: IconCheck, label: t("status.delivered") },
            not_delivered: { color: "orange", icon: IconX, label: "Not Delivered" },
            retrying: { color: "yellow", icon: IconRefresh, label: "Retrying" },
            failed: { color: "red", icon: IconX, label: t("status.failed") },
        } as const;

        const config = statusConfig[status] || {
            color: "gray",
            icon: IconQuestionMark,
            label: status,
        };

        const IconComponent = config.icon;
        return (
            <Badge color={config.color} variant="light" size="sm">
                <Group gap={4}>
                    <IconComponent size={12} />
                    <Text size="xs">{config.label}</Text>
                </Group>
            </Badge>
        );
    };
    const getIntentLabel = (sms: SmsRecord, index: number, allSms: SmsRecord[]) => {
        // Determine if this is initial or reminder based on sequence and existing SMS
        const sortedSms = [...allSms].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        const smsIndex = sortedSms.findIndex(s => s.id === sms.id);

        // Count successful SMS before this one
        const successfulSmsBefore = sortedSms
            .slice(0, smsIndex)
            .filter(s => ["sent", "delivered"].includes(s.status)).length;

        if (sms.intent === "pickup_reminder") {
            if (successfulSmsBefore === 0) {
                return t("intent.initial");
            } else {
                return t("intent.reminder");
            }
        } else if (sms.intent === "consent_enrolment") {
            return "Consent Enrolment";
        }

        return sms.intent;
    };

    const latestSms = smsHistory.length > 0 ? smsHistory[smsHistory.length - 1] : null;

    // In test mode, consider "sent" as successfully notified since delivery confirmation may not happen
    const hasBeenNotified = smsHistory.some(sms => {
        const isDelivered = sms.status === "delivered";
        const isSentInTestMode = testMode && sms.status === "sent";
        // Check for "pickup_reminder" which is the actual intent used in the database for initial notifications
        const isInitial = sms.intent === "pickup_reminder";
        return (isDelivered || isSentInTestMode) && isInitial;
    });

    const canSendInitial =
        !hasBeenNotified && (!latestSms || !["queued", "sending"].includes(latestSms.status));
    const canSendReminder =
        hasBeenNotified && (!latestSms || !["queued", "sending"].includes(latestSms.status));

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
                            {smsHistory.map((sms, index) => (
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
                                            {sms.status === "queued" && <IconClock size={12} />}
                                        </ThemeIcon>
                                    }
                                    title={
                                        <Group gap="xs">
                                            <Text size="sm" fw={500}>
                                                {getIntentLabel(sms, index, smsHistory)}
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
                                        {sms.lastErrorMessage && (
                                            <Text size="xs" c="red">
                                                {t("historyModal.error")}: {sms.lastErrorMessage}
                                            </Text>
                                        )}
                                        {sms.attemptCount > 0 && (
                                            <Text size="xs" c="dimmed">
                                                {t("historyModal.retries")}: {sms.attemptCount}
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
