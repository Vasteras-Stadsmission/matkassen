import { NextResponse } from "next/server";
import { processSendQueue } from "@/app/utils/sms/scheduler";
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

        // Manually trigger SMS queue processing
        const result = await processSendQueue();

        return NextResponse.json({
            success: true,
            message: `Processed ${result} SMS messages from queue`,
            processedCount: result,
        });
    } catch (error) {
        logError("Error processing SMS queue", error, {
            method: "POST",
            path: "/api/admin/sms/process-queue",
        });
        return NextResponse.json({ error: "Failed to process SMS queue" }, { status: 500 });
    }
}
