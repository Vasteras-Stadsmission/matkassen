"use client";

import { useState, useCallback } from "react";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { SmsRecord } from "@/app/utils/sms/sms-service";

export function useSmsManagement() {
    const [isLoading, setIsLoading] = useState(false);
    const t = useTranslations("schedule.sms");

    const sendSms = useCallback(
        async (parcelId: string, intent: "initial" | "reminder" | "manual"): Promise<boolean> => {
            setIsLoading(true);
            try {
                const response = await fetch(`/api/admin/sms/parcel/${parcelId}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ action: "send", intent }),
                });

                const data = await response.json();

                if (response.ok) {
                    notifications.show({
                        title: t("notifications.sendSuccess"),
                        message: t(`notifications.${intent}SendSuccess`),
                        color: "green",
                    });
                    return true;
                } else if (response.status === 429) {
                    // Handle rate limiting gracefully with a warning notification
                    notifications.show({
                        title: "Rate Limited",
                        message: data.error || "Please wait before sending another SMS",
                        color: "yellow",
                        autoClose: 7000, // Show longer for rate limit messages
                    });
                    return false;
                } else {
                    throw new Error(data.error || "Failed to send SMS");
                }
            } catch (error) {
                console.error("Error sending SMS:", error);
                notifications.show({
                    title: t("notifications.sendError"),
                    message:
                        error instanceof Error ? error.message : t("notifications.genericError"),
                    color: "red",
                });
                return false;
            } finally {
                setIsLoading(false);
            }
        },
        [t],
    );

    const resendSms = useCallback(
        async (parcelId: string): Promise<boolean> => {
            setIsLoading(true);
            try {
                const response = await fetch(`/api/admin/sms/parcel/${parcelId}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ action: "resend" }),
                });

                const data = await response.json();

                if (response.ok) {
                    notifications.show({
                        title: t("notifications.resendSuccess"),
                        message: t("notifications.smsQueued"),
                        color: "green",
                    });
                    return true;
                } else if (response.status === 429) {
                    // Handle rate limiting gracefully with a warning notification
                    notifications.show({
                        title: "Rate Limited",
                        message: data.error || "Please wait before resending SMS",
                        color: "yellow",
                        autoClose: 7000, // Show longer for rate limit messages
                    });
                    return false;
                } else {
                    throw new Error(data.error || "Failed to resend SMS");
                }
            } catch (error) {
                console.error("Error resending SMS:", error);
                notifications.show({
                    title: t("notifications.resendError"),
                    message:
                        error instanceof Error ? error.message : t("notifications.genericError"),
                    color: "red",
                });
                return false;
            } finally {
                setIsLoading(false);
            }
        },
        [t],
    );

    const fetchSmsHistory = useCallback(async (parcelId: string): Promise<SmsRecord[]> => {
        try {
            const response = await fetch(`/api/admin/sms/parcel/${parcelId}`);
            const contentType = response.headers.get("content-type") || "";

            if (!response.ok) {
                // Try to parse JSON error safely, otherwise use status text
                let serverError = `${response.status} ${response.statusText}`;
                if (contentType.includes("application/json")) {
                    try {
                        const err = await response.json();
                        serverError = err.error || serverError;
                    } catch {}
                }
                console.error("Error fetching SMS history:", serverError);

                // If it's a 401, the user might need to sign in again
                if (response.status === 401) {
                    console.warn(
                        "Authentication required for SMS history. User may need to sign in again.",
                    );
                }

                return [];
            }

            if (!contentType.includes("application/json")) {
                // Likely got HTML (e.g., redirect page) -> avoid JSON parse error
                console.error("Expected JSON but received:", contentType);
                return [];
            }

            const data = await response.json();
            if (response.ok && data.smsRecords) {
                return data.smsRecords.map(
                    (sms: {
                        id: string;
                        intent: string;
                        status: string;
                        sentAt?: string;
                        deliveredAt?: string;
                        lastErrorMessage?: string;
                        attemptCount: number;
                    }) => ({
                        id: sms.id,
                        intent: sms.intent as "initial" | "reminder" | "manual",
                        status: sms.status as
                            | "pending"
                            | "sent"
                            | "delivered"
                            | "failed"
                            | "cancelled",
                        sentAt: sms.sentAt ? new Date(sms.sentAt) : undefined,
                        deliveredAt: sms.deliveredAt ? new Date(sms.deliveredAt) : undefined,
                        failureReason: sms.lastErrorMessage,
                        retryCount: sms.attemptCount,
                    }),
                );
            }
            return [];
        } catch (error) {
            console.error("Error fetching SMS history:", error);
            return [];
        }
    }, []);

    return {
        sendSms,
        resendSms,
        fetchSmsHistory,
        isLoading,
    };
}
