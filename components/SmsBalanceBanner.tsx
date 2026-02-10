"use client";

import { useEffect, useState, useCallback } from "react";
import { Alert, Button, Group, Text } from "@mantine/core";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { adminFetch } from "@/app/utils/auth/redirect-on-auth-error";
import type { TranslationFunction } from "@/app/[locale]/types";

interface BalanceStatus {
    hasInsufficientBalance: boolean;
    credits: number | null;
    failedCount: number;
}

// Poll interval: check every 5 minutes
const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Persistent warning banner shown at the top of the admin UI when
 * SMS credits are depleted. Polls /api/admin/sms/balance-status
 * and auto-hides when balance is restored.
 *
 * Includes a "Retry" button that re-queues all balance-failed SMS
 * so they get sent once credits are available.
 */
export function SmsBalanceBanner() {
    const t = useTranslations() as TranslationFunction;
    const [status, setStatus] = useState<BalanceStatus | null>(null);
    const [retrying, setRetrying] = useState(false);
    const [retryResult, setRetryResult] = useState<{ count: number } | null>(null);

    const checkStatus = useCallback(async () => {
        try {
            const response = await adminFetch("/api/admin/sms/balance-status");
            if (response.ok) {
                const data = await response.json();
                setStatus(data);
                // Clear retry result if balance issues are resolved
                if (!data.hasInsufficientBalance) {
                    setRetryResult(null);
                }
            }
        } catch {
            // Silently fail - banner just won't show
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        const check = async () => {
            if (mounted) await checkStatus();
        };

        check();
        const interval = setInterval(check, POLL_INTERVAL_MS);

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, [checkStatus]);

    const handleRetry = async () => {
        setRetrying(true);
        setRetryResult(null);
        try {
            const response = await adminFetch("/api/admin/sms/retry-balance-failures", {
                method: "POST",
            });
            if (response.ok) {
                const data = await response.json();
                setRetryResult({ count: data.requeuedCount });
                // Refresh status after retry
                await checkStatus();
            }
        } catch {
            // Will show error via status refresh
        } finally {
            setRetrying(false);
        }
    };

    if (!status?.hasInsufficientBalance) {
        return null;
    }

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
            <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div>
                    <Text fw={600} size="sm">
                        {t("smsBanner.title")}
                    </Text>
                    <Text size="sm">
                        {t("smsBanner.description")}
                        {status.failedCount > 0 && (
                            <>
                                {" "}
                                {t("smsBanner.affectedCount", { count: status.failedCount })}
                            </>
                        )}
                        {retryResult && retryResult.count > 0 && (
                            <>
                                {" "}
                                {t("smsBanner.retrySuccess", { count: retryResult.count })}
                            </>
                        )}
                    </Text>
                </div>
                {status.failedCount > 0 && (
                    <Button
                        variant="white"
                        color="orange"
                        size="xs"
                        leftSection={<IconRefresh size={14} />}
                        loading={retrying}
                        onClick={handleRetry}
                        style={{ flexShrink: 0 }}
                    >
                        {t("smsBanner.retryButton")}
                    </Button>
                )}
            </Group>
        </Alert>
    );
}
