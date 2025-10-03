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
} from "@mantine/core";
import {
    IconSend,
    IconRepeat,
    IconMessage,
    IconCheck,
    IconX,
    IconClock,
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
    onSendSms?: (parcelId: string) => void;
    onResendSms?: (parcelId: string) => void;
    isLoading?: boolean;
    testMode?: boolean; // Add testMode prop
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
            queued: { color: "yellow", icon: IconClock, label: "Queued" },
            sending: { color: "blue", icon: IconSend, label: "Sending" },
            sent: { color: "green", icon: IconCheck, label: t("status.sent") },
            retrying: { color: "yellow", icon: IconRefresh, label: "Retrying" },
            failed: { color: "red", icon: IconX, label: t("status.failed") },
            cancelled: { color: "gray", icon: IconX, label: t("status.cancelled") },
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
    const getIntentLabel = (sms: SmsRecord) => {
        if (sms.intent === "pickup_reminder") {
            return t("intent.pickup_reminder");
        } else if (sms.intent === "consent_enrolment") {
            return "Consent Enrolment";
        }

        return sms.intent;
    };

    const latestSms = smsHistory.length > 0 ? smsHistory[smsHistory.length - 1] : null;

    const canSendSms = !latestSms || !["queued", "sending"].includes(latestSms.status);
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
                        disabled={!canSendSms || isLoading}
                        onClick={() => onSendSms?.(parcel.id)}
                        loading={isLoading}
                    >
                        {t("actions.sendSms")}
                    </Button>

                    {latestSms?.status === "failed" && (
                        <Button
                            size="xs"
                            variant="light"
                            color="red"
                            leftSection={<IconRepeat size={14} />}
                            disabled={isLoading}
                            onClick={() => onResendSms?.(parcel.id)}
                            loading={isLoading}
                        >
                            {t("actions.resend")}
                        </Button>
                    )}
                </Group>
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
                                                sms.status === "sent"
                                                    ? "green"
                                                    : sms.status === "failed"
                                                      ? "red"
                                                      : sms.status === "retrying"
                                                        ? "yellow"
                                                        : "blue"
                                            }
                                        >
                                            {sms.status === "sent" && <IconCheck size={12} />}
                                            {sms.status === "failed" && <IconX size={12} />}
                                            {sms.status === "retrying" && <IconRefresh size={12} />}
                                            {sms.status === "sending" && <IconSend size={12} />}
                                            {sms.status === "queued" && <IconClock size={12} />}
                                        </ThemeIcon>
                                    }
                                    title={
                                        <Group gap="xs">
                                            <Text size="sm" fw={500}>
                                                {getIntentLabel(sms)}
                                            </Text>
                                            {getStatusBadge(sms.status)}
                                        </Group>
                                    }
                                >
                                    <Stack gap="xs">
                                        <Text size="xs" c="dimmed">
                                            Created: {sms.createdAt.toLocaleString()}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            Phone: {sms.toE164}
                                        </Text>
                                        {sms.lastErrorMessage && (
                                            <Text size="xs" c="red">
                                                Error: {sms.lastErrorMessage}
                                            </Text>
                                        )}
                                        {sms.attemptCount > 0 && (
                                            <Text size="xs" c="dimmed">
                                                Attempts: {sms.attemptCount}
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
