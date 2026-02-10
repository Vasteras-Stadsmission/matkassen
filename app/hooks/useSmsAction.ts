"use client";

import { useState, useCallback } from "react";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import type { TranslationFunction } from "@/app/[locale]/types";
import { adminFetch } from "@/app/utils/auth/redirect-on-auth-error";

export type SmsActionType = "send" | "resend";

export interface UseSmsActionResult {
    sendSms: (parcelId: string, action?: SmsActionType) => Promise<void>;
    isLoading: boolean;
    error: string | null;
}

/**
 * Shared hook for SMS send/resend actions
 * Used in both SMS Dashboard and ParcelAdminDialog
 */
export function useSmsAction(): UseSmsActionResult {
    const t = useTranslations() as TranslationFunction;
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sendSms = useCallback(
        async (parcelId: string, action: SmsActionType = "send") => {
            setIsLoading(true);
            setError(null);

            try {
                const response = await adminFetch(`/api/admin/sms/parcel/${parcelId}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        action,
                    }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || "Failed to send SMS");
                }

                // Success notification
                notifications.show({
                    title: t("admin.smsDashboard.notifications.sendSuccess"),
                    message: "",
                    color: "green",
                });
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : "Unknown error";
                setError(errorMessage);

                notifications.show({
                    title: t("admin.smsDashboard.notifications.sendError"),
                    message: t("admin.smsDashboard.notifications.sendErrorDetail", {
                        error: errorMessage,
                    }),
                    color: "red",
                });

                throw err;
            } finally {
                setIsLoading(false);
            }
        },
        [t],
    );

    return {
        sendSms,
        isLoading,
        error,
    };
}
