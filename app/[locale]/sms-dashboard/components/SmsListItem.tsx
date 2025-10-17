"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Paper, Group, Text, Badge, Stack, Menu, ActionIcon, Box, Alert } from "@mantine/core";
import { IconDots, IconSend, IconUser, IconPackage, IconAlertCircle } from "@tabler/icons-react";
import type { SmsDashboardRecord } from "@/app/api/admin/sms/dashboard/route";
import { ParcelAdminDialog } from "@/components/ParcelAdminDialog";
import { useSmsAction } from "@/app/hooks/useSmsAction";
import { Link } from "@/app/i18n/navigation";
import type { TranslationFunction } from "@/app/[locale]/types";

// Shared date/time formatting options for SMS timestamps
const SMS_TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
};

interface SmsListItemProps {
    sms: SmsDashboardRecord;
    onUpdate: () => void;
}

export function SmsListItem({ sms, onUpdate }: SmsListItemProps) {
    const t = useTranslations() as TranslationFunction;
    const locale = useLocale();
    const [dialogOpen, setDialogOpen] = useState(false);
    const { sendSms, isLoading } = useSmsAction();

    // Combine first and last name
    const householdName = `${sms.householdFirstName} ${sms.householdLastName}`;

    // Format time range using current locale
    const formatTime = (date: string) => {
        return new Date(date).toLocaleTimeString(locale, {
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const timeRange = `${formatTime(sms.pickupDateTimeEarliest)} - ${formatTime(sms.pickupDateTimeLatest)}`;

    // Status badge color mapping
    const statusColors: Record<string, string> = {
        queued: "blue",
        sending: "cyan",
        sent: "green",
        delivered: "teal",
        retrying: "yellow",
        failed: "red",
        cancelled: "gray",
    };

    // Intent badge color mapping
    const intentColors: Record<string, string> = {
        pickup_reminder: "blue",
        pickup_updated: "orange",
        pickup_cancelled: "red",
        consent_enrolment: "violet",
    };

    return (
        <>
            <Paper
                withBorder
                p="md"
                style={{ cursor: "pointer" }}
                onClick={() => setDialogOpen(true)}
            >
                <Group justify="space-between" wrap="nowrap">
                    <Stack gap="xs" style={{ flex: 1 }}>
                        {/* Household Name */}
                        <Group gap="xs">
                            <Text fw={600} size="lg">
                                {householdName}
                            </Text>
                            <Badge
                                size="sm"
                                color={statusColors[sms.status] || "gray"}
                                variant="filled"
                            >
                                {t(`admin.smsDashboard.status.${sms.status}`)}
                            </Badge>
                            <Badge
                                size="sm"
                                color={intentColors[sms.intent] || "gray"}
                                variant="light"
                            >
                                {t(`admin.smsDashboard.intent.${sms.intent}`)}
                            </Badge>
                        </Group>

                        {/* Location and Time */}
                        <Group gap="md">
                            <Text size="sm" c="dimmed">
                                📍 {sms.locationName}
                            </Text>
                            <Text size="sm" c="dimmed">
                                🕐 {timeRange}
                            </Text>
                        </Group>

                        {/* Error Message */}
                        {sms.status === "failed" && sms.lastErrorMessage && (
                            <Alert
                                icon={<IconAlertCircle size={16} />}
                                color="red"
                                variant="light"
                                p="xs"
                            >
                                <Text size="xs">{sms.lastErrorMessage}</Text>
                            </Alert>
                        )}

                        {/* Timing Info - Status-specific */}
                        {sms.status === "queued" && sms.nextAttemptAt && (
                            <Text size="xs" c="blue">
                                {t("admin.smsDashboard.itemInfo.willSendAt", {
                                    time: new Date(sms.nextAttemptAt).toLocaleString(
                                        locale,
                                        SMS_TIMESTAMP_FORMAT,
                                    ),
                                })}
                            </Text>
                        )}

                        {/* Show actual send time for sent SMS */}
                        {(sms.status === "sent" || sms.status === "delivered") && sms.sentAt && (
                            <Text size="xs" c="green">
                                {t("admin.smsDashboard.itemInfo.sentAt", {
                                    time: new Date(sms.sentAt).toLocaleString(
                                        locale,
                                        SMS_TIMESTAMP_FORMAT,
                                    ),
                                })}
                            </Text>
                        )}
                    </Stack>

                    {/* Actions Menu */}
                    <Box
                        onClick={e => {
                            e.stopPropagation();
                        }}
                    >
                        <Menu shadow="md" width={200} position="bottom-end">
                            <Menu.Target>
                                <ActionIcon variant="subtle" color="gray">
                                    <IconDots size={18} />
                                </ActionIcon>
                            </Menu.Target>

                            <Menu.Dropdown>
                                <Menu.Label>{t("admin.smsDashboard.actions.menuLabel")}</Menu.Label>

                                {/* Send SMS Action */}
                                {sms.status !== "cancelled" && (
                                    <Menu.Item
                                        leftSection={<IconSend size={16} />}
                                        onClick={async e => {
                                            e.stopPropagation();
                                            try {
                                                await sendSms(sms.parcelId);
                                                onUpdate();
                                            } catch (error) {
                                                console.error("SMS send error:", error);
                                            }
                                        }}
                                        disabled={isLoading}
                                    >
                                        {sms.status === "failed"
                                            ? t("admin.smsDashboard.actions.tryAgain")
                                            : sms.status === "sent"
                                              ? t("admin.smsDashboard.actions.sendAgain")
                                              : t("admin.smsDashboard.actions.sendNow")}
                                    </Menu.Item>
                                )}

                                <Menu.Divider />

                                {/* View Household */}
                                <Menu.Item
                                    leftSection={<IconUser size={16} />}
                                    component={Link}
                                    href={`/households/${sms.householdId}`}
                                    onClick={e => e.stopPropagation()}
                                >
                                    {t("admin.smsDashboard.actions.viewHousehold")}
                                </Menu.Item>

                                {/* View Parcel */}
                                <Menu.Item
                                    leftSection={<IconPackage size={16} />}
                                    onClick={e => {
                                        e.stopPropagation();
                                        setDialogOpen(true);
                                    }}
                                >
                                    {t("admin.smsDashboard.actions.viewParcel")}
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    </Box>
                </Group>
            </Paper>

            {/* Parcel Dialog */}
            <ParcelAdminDialog
                parcelId={sms.parcelId}
                opened={dialogOpen}
                onClose={() => setDialogOpen(false)}
                onParcelUpdated={() => onUpdate()}
            />
        </>
    );
}
