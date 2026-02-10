import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { requeueBalanceFailures } from "@/app/utils/sms/sms-service";
import { logError, logger } from "@/app/utils/logger";

/**
 * POST /api/admin/sms/retry-balance-failures
 *
 * Re-queues all undismissed SMS that failed due to insufficient balance.
 * Should be called after the organisation has topped up SMS credits.
 *
 * Rate limited to prevent accidental double-clicks from queuing duplicates.
 */
export async function POST() {
    try {
        const authResult = await authenticateAdminRequest({
            endpoint: "retry-balance-failures",
            config: { maxRequests: 3, windowMs: 5 * 60 * 1000 },
        });
        if (!authResult.success) {
            return authResult.response!;
        }

        const requeuedCount = await requeueBalanceFailures();

        const admin = authResult.session?.user?.name || "unknown";
        logger.info({ requeuedCount, admin }, "Admin triggered balance-failure SMS retry");

        return NextResponse.json({ requeuedCount });
    } catch (error) {
        logError("Error retrying balance failures", error);
        return NextResponse.json(
            { error: "Failed to retry balance failures" },
            { status: 500 },
        );
    }
}
