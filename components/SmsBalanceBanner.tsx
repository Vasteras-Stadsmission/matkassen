"use client";

import { useEffect, useState } from "react";
import { Alert, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { adminFetch } from "@/app/utils/auth/redirect-on-auth-error";
import type { TranslationFunction } from "@/app/[locale]/types";

interface BalanceStatus {
    hasInsufficientBalance: boolean;
    credits: number | null;
    recentFailures: {
        failed: number;
        retrying: number;
    };
}

// Poll interval: check every 5 minutes
const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Persistent warning banner shown at the top of the admin UI when
 * SMS credits are depleted. Polls /api/admin/sms/balance-status
 * and auto-hides when balance is restored.
 */
export function SmsBalanceBanner() {
    const t = useTranslations() as TranslationFunction;
    const [status, setStatus] = useState<BalanceStatus | null>(null);

    useEffect(() => {
        let mounted = true;

        const checkStatus = async () => {
            try {
                const response = await adminFetch("/api/admin/sms/balance-status");
                if (response.ok && mounted) {
                    const data = await response.json();
                    setStatus(data);
                }
            } catch {
                // Silently fail - banner just won't show
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, POLL_INTERVAL_MS);

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    if (!status?.hasInsufficientBalance) {
        return null;
    }

    const affectedCount = status.recentFailures.failed + status.recentFailures.retrying;

    return (
        <Alert
            variant="filled"
            color="orange"
            icon={<IconAlertTriangle size={20} />}
            mb="md"
            styles={{
                root: {
                    borderRadius: 0,
                    marginLeft: "calc(-1 * var(--mantine-spacing-md))",
                    marginRight: "calc(-1 * var(--mantine-spacing-md))",
                    marginTop: "calc(-1 * var(--mantine-spacing-md))",
                },
            }}
        >
            <Text fw={600} size="sm">
                {t("smsBanner.title")}
            </Text>
            <Text size="sm">
                {t("smsBanner.description")}
                {affectedCount > 0 && (
                    <>
                        {" "}
                        {t("smsBanner.affectedCount", { count: affectedCount })}
                    </>
                )}
            </Text>
        </Alert>
    );
}
