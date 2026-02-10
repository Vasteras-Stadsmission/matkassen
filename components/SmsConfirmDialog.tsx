"use client";

import { useState, useEffect } from "react";
import {
    Modal,
    Stack,
    Text,
    Group,
    Button,
    Badge,
    Loader,
    Alert,
    Divider,
    Paper,
} from "@mantine/core";
import { IconSend, IconAlertTriangle, IconPhone, IconCheck } from "@tabler/icons-react";
import { useTranslations, useLocale } from "next-intl";
import type { TranslationFunction } from "@/app/[locale]/types";
import { formatPhoneForDisplay } from "@/app/utils/validation/phone-validation";
import { adminFetch } from "@/app/utils/auth/redirect-on-auth-error";

interface SmsRecord {
    id: string;
    status: "queued" | "sending" | "sent" | "retrying" | "failed" | "cancelled";
    intent: string;
    providerStatus?: "delivered" | "failed" | "not delivered" | null;
    sentAt?: string;
    createdAt: string;
}

interface SmsConfirmDialogProps {
    opened: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    parcelId: string;
    householdName: string;
    phoneNumber: string;
    smsRecords?: SmsRecord[];
}

const ONE_HOUR_MS = 60 * 60 * 1000;

export function SmsConfirmDialog({
    opened,
    onClose,
    onConfirm,
    parcelId,
    householdName,
    phoneNumber,
    smsRecords: initialRecords,
}: SmsConfirmDialogProps) {
    const t = useTranslations() as TranslationFunction;
    const locale = useLocale();

    const [loading, setLoading] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [smsRecords, setSmsRecords] = useState<SmsRecord[]>(initialRecords || []);

    // Fetch SMS records if not provided
    useEffect(() => {
        if (!opened) return;

        // If records are provided, use them
        if (initialRecords !== undefined) {
            setSmsRecords(initialRecords);
            return;
        }

        // Clear previous records when fetching for a new parcel
        setSmsRecords([]);

        const fetchRecords = async () => {
            setLoading(true);
            try {
                const response = await adminFetch(`/api/admin/sms/parcel/${parcelId}`);
                if (response.ok) {
                    const data = await response.json();
                    setSmsRecords(data.smsRecords || []);
                }
            } catch {
                // Non-critical - just won't show history
            } finally {
                setLoading(false);
            }
        };

        fetchRecords();
    }, [opened, parcelId, initialRecords]);

    const handleConfirm = async () => {
        setConfirming(true);
        try {
            await onConfirm();
            onClose();
        } catch {
            // Error is handled by the caller
        } finally {
            setConfirming(false);
        }
    };

    const formatDateTime = (dateString: string) => {
        const date = new Date(dateString);
        const localeString = locale === "sv" ? "sv-SE" : "en-GB";
        return date.toLocaleString(localeString, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    };

    // Check if any SMS was sent recently (within 1 hour)
    const recentSms = smsRecords.find(sms => {
        const sentTime = sms.sentAt ? new Date(sms.sentAt).getTime() : 0;
        const createdTime = new Date(sms.createdAt).getTime();
        const referenceTime = sentTime || createdTime;
        return Date.now() - referenceTime < ONE_HOUR_MS;
    });

    const getStatusBadge = (sms: SmsRecord) => {
        if (sms.status === "sent" && sms.providerStatus) {
            const color =
                sms.providerStatus === "delivered"
                    ? "green"
                    : sms.providerStatus === "failed"
                      ? "red"
                      : "orange";
            const label =
                sms.providerStatus === "delivered"
                    ? t("admin.parcelDialog.smsStatus.provider.delivered")
                    : sms.providerStatus === "failed"
                      ? t("admin.parcelDialog.smsStatus.provider.failed")
                      : t("admin.parcelDialog.smsStatus.provider.notDelivered");
            return (
                <Badge color={color} size="sm">
                    {label}
                </Badge>
            );
        }

        const color =
            sms.status === "sent"
                ? "green"
                : sms.status === "failed"
                  ? "red"
                  : sms.status === "queued"
                    ? "blue"
                    : "gray";

        return (
            <Badge color={color} size="sm">
                {t(`admin.smsDashboard.status.${sms.status}`)}
            </Badge>
        );
    };

    const getIntentLabel = (intent: string) => {
        const knownIntents: Record<string, string> = {
            pickup_reminder: t("admin.smsDashboard.intent.pickup_reminder"),
            pickup_updated: t("admin.smsDashboard.intent.pickup_updated"),
            pickup_cancelled: t("admin.smsDashboard.intent.pickup_cancelled"),
        };
        return knownIntents[intent] || intent;
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            closeOnClickOutside={!confirming}
            closeOnEscape={!confirming}
            title={
                <Group gap="sm">
                    <IconSend size="1.2rem" />
                    <Text fw={700} size="lg">
                        {t("smsConfirm.title")}
                    </Text>
                </Group>
            }
            size="md"
            centered
        >
            <Stack gap="md">
                {/* Recipient info */}
                <Paper p="md" withBorder>
                    <Stack gap="xs">
                        <Text fw={600} size="lg">
                            {householdName}
                        </Text>
                        <Group gap="xs">
                            <IconPhone size={16} color="gray" />
                            <Text size="sm" c="dimmed">
                                {formatPhoneForDisplay(phoneNumber)}
                            </Text>
                        </Group>
                    </Stack>
                </Paper>

                {/* Recent send warning */}
                {recentSms && (
                    <Alert
                        icon={<IconAlertTriangle size={16} />}
                        title={t("smsConfirm.recentWarning")}
                        color="orange"
                    >
                        {t("smsConfirm.recentWarningMessage", {
                            time: formatDateTime(recentSms.sentAt || recentSms.createdAt),
                        })}
                    </Alert>
                )}

                {/* SMS History */}
                {loading ? (
                    <Group justify="center" p="md">
                        <Loader size="sm" />
                    </Group>
                ) : smsRecords.length > 0 ? (
                    <Stack gap="xs">
                        <Text size="sm" fw={500} c="dimmed">
                            {t("smsConfirm.previousSms")}
                        </Text>
                        <Divider />
                        {smsRecords.slice(0, 3).map(sms => (
                            <Group key={sms.id} justify="space-between" py="xs">
                                <Group gap="sm">
                                    {getStatusBadge(sms)}
                                    <Text size="sm" c="dimmed">
                                        {getIntentLabel(sms.intent)}
                                    </Text>
                                </Group>
                                <Text size="xs" c="dimmed">
                                    {formatDateTime(sms.sentAt || sms.createdAt)}
                                </Text>
                            </Group>
                        ))}
                        {smsRecords.length > 3 && (
                            <Text size="xs" c="dimmed" ta="center">
                                {t("smsConfirm.moreHistory", { count: smsRecords.length - 3 })}
                            </Text>
                        )}
                    </Stack>
                ) : null}

                {/* Confirm/Cancel buttons */}
                <Group justify="flex-end" mt="md">
                    <Button variant="subtle" onClick={onClose} disabled={confirming}>
                        {t("smsConfirm.cancel")}
                    </Button>
                    <Button
                        leftSection={<IconCheck size={16} />}
                        onClick={handleConfirm}
                        loading={confirming}
                    >
                        {t("smsConfirm.confirm")}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
