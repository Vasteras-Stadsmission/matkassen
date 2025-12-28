"use client";

import { Button, Text } from "@mantine/core";
import { IconSend, IconClock } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useSmsAction } from "@/app/hooks/useSmsAction";
import type { TranslationFunction } from "@/app/[locale]/types";

export interface SmsActionButtonProps {
    parcelId: string;
    smsStatus?: "queued" | "sending" | "sent" | "retrying" | "failed" | "cancelled";
    /** When the next retry is scheduled (for retrying status) */
    nextRetryAt?: Date;
    onSuccess?: () => void;
    variant?: "filled" | "light" | "subtle";
    size?: "xs" | "sm" | "md";
    fullWidth?: boolean;
    style?: React.CSSProperties;
}

/**
 * Context-aware SMS action button
 * Label changes based on SMS status
 * Shows "Retry scheduled" text for retrying status (no button - system handles it)
 * Shared between SMS Dashboard and ParcelAdminDialog
 */
export function SmsActionButton({
    parcelId,
    smsStatus,
    nextRetryAt,
    onSuccess,
    variant = "light",
    size = "sm",
    fullWidth,
    style,
}: SmsActionButtonProps) {
    const t = useTranslations() as TranslationFunction;
    const { sendSms, isLoading } = useSmsAction();

    // For retrying status, show informational text instead of a button
    // The system will automatically retry - no user action needed
    if (smsStatus === "retrying") {
        const retryText = nextRetryAt
            ? t("admin.smsDashboard.status.retryScheduledAt", {
                  time: nextRetryAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              })
            : t("admin.smsDashboard.status.retryScheduled");

        return (
            <Text
                size={size}
                c="dimmed"
                style={{ display: "flex", alignItems: "center", gap: 4, ...style }}
            >
                <IconClock size={14} />
                {retryText}
            </Text>
        );
    }

    // Determine button label based on SMS status
    const getButtonLabel = () => {
        if (smsStatus === "failed") {
            return t("admin.smsDashboard.actions.tryAgain");
        }
        if (smsStatus === "sent") {
            return t("admin.smsDashboard.actions.sendAgain");
        }
        // Default for queued, sending, or unknown
        return t("admin.smsDashboard.actions.sendNow");
    };

    const handleClick = async () => {
        // Use "resend" for failed or already-sent SMS to generate unique idempotency key
        const action = smsStatus === "failed" || smsStatus === "sent" ? "resend" : "send";
        try {
            await sendSms(parcelId, action);
            onSuccess?.();
        } catch (error) {
            // Error handling done in hook
            console.error("SMS send error:", error);
        }
    };

    return (
        <Button
            variant={variant}
            size={size}
            leftSection={<IconSend size={14} />}
            onClick={handleClick}
            loading={isLoading}
            disabled={smsStatus === "cancelled"}
            fullWidth={fullWidth}
            style={style}
        >
            {getButtonLabel()}
        </Button>
    );
}
