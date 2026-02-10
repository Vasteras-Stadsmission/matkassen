import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { getInsufficientBalanceStatus } from "@/app/utils/sms/sms-service";
import { checkBalance } from "@/app/utils/sms/hello-sms";
import { logError } from "@/app/utils/logger";

/**
 * GET /api/admin/sms/balance-status
 *
 * Returns the current SMS balance status including:
 * - Current credit balance from HelloSMS (live check)
 * - Whether there are recent balance-related failures in the database
 *
 * Used by the admin UI to show a warning banner when SMS credits are depleted.
 */
export async function GET() {
    try {
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        // Run balance check and failure status check in parallel
        const [balanceResult, failureStatus] = await Promise.all([
            checkBalance(),
            getInsufficientBalanceStatus(),
        ]);

        const hasInsufficientBalance =
            (balanceResult.success && balanceResult.credits !== undefined && balanceResult.credits <= 0) ||
            failureStatus.hasBalanceFailures;

        return NextResponse.json(
            {
                hasInsufficientBalance,
                credits: balanceResult.success ? balanceResult.credits : null,
                balanceCheckError: balanceResult.success ? null : balanceResult.error,
                recentFailures: {
                    failed: failureStatus.failureCount,
                    retrying: failureStatus.retryingCount,
                },
            },
            {
                headers: {
                    // Cache for 60 seconds to avoid hammering the HelloSMS API
                    "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
                },
            },
        );
    } catch (error) {
        logError("Error checking SMS balance status", error);
        return NextResponse.json(
            { error: "Failed to check SMS balance status" },
            { status: 500 },
        );
    }
}
