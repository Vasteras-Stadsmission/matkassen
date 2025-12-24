import { NextResponse } from "next/server";
import { triggerSmsProcessQueue } from "@/app/utils/scheduler";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { SMS_RATE_LIMITS } from "@/app/utils/rate-limit";
import { logError } from "@/app/utils/logger";

export async function POST() {
    try {
        // Validate authentication with rate limiting
        const authResult = await authenticateAdminRequest({
            endpoint: "queue-processing",
            config: SMS_RATE_LIMITS.QUEUE_PROCESSING,
        });
        if (!authResult.success) {
            return authResult.response!;
        }

        // Manually trigger SMS queue processing via unified scheduler
        const result = await triggerSmsProcessQueue();

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || "Failed to process SMS queue" },
                { status: 500 },
            );
        }

        // Report if lock wasn't acquired (another process is already processing)
        if (!result.lockAcquired) {
            return NextResponse.json({
                success: true,
                message: "Queue processing already in progress by another process",
                processedCount: 0,
                lockAcquired: false,
            });
        }

        return NextResponse.json({
            success: true,
            message: `Processed ${result.processedCount} SMS messages from queue`,
            processedCount: result.processedCount,
            lockAcquired: true,
        });
    } catch (error) {
        logError("Error processing SMS queue", error, {
            method: "POST",
            path: "/api/admin/sms/process-queue",
        });
        return NextResponse.json({ error: "Failed to process SMS queue" }, { status: 500 });
    }
}
