"use client";

import { Button } from "@mantine/core";
import { IconSend } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useSmsAction } from "@/app/hooks/useSmsAction";
import type { TranslationFunction } from "@/app/[locale]/types";

export interface SmsActionButtonProps {
    parcelId: string;
    smsStatus?: "queued" | "sending" | "sent" | "retrying" | "failed" | "cancelled";
    onSuccess?: () => void;
    variant?: "filled" | "light" | "subtle";
    size?: "xs" | "sm" | "md";
    fullWidth?: boolean;
    style?: React.CSSProperties;
}

/**
 * Context-aware SMS action button
 * Label changes based on SMS status
 * Shared between SMS Dashboard and ParcelAdminDialog
 */
export function SmsActionButton({
    parcelId,
    smsStatus,
    onSuccess,
    variant = "light",
    size = "sm",
    fullWidth,
    style,
}: SmsActionButtonProps) {
    const t = useTranslations() as TranslationFunction;
    const { sendSms, isLoading } = useSmsAction();

    // Determine button label based on SMS status
    const getButtonLabel = () => {
        if (smsStatus === "failed") {
            return t("admin.smsDashboard.actions.tryAgain");
        }
        if (smsStatus === "sent") {
            return t("admin.smsDashboard.actions.sendAgain");
        }
        // Default for queued, sending, retrying, or unknown
        return t("admin.smsDashboard.actions.sendNow");
    };

    const handleClick = async () => {
        try {
            await sendSms(parcelId);
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
