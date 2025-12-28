/**
 * Legacy SMS Status Callback Webhook for HelloSMS (no authentication)
 *
 * DEPRECATED: This endpoint exists for backwards compatibility with HelloSMS's
 * current configuration. Once HelloSMS is updated to use the secret-based URL,
 * this endpoint should be removed.
 *
 * New URL format: /api/webhooks/sms-status/[secret]
 *
 * Expected payload format from HelloSMS:
 * {
 *   "apiMessageId": "12345",
 *   "status": "delivered" | "failed" | "not delivered",
 *   "timestamp": 1672531199,
 *   "callbackRef": "someReference"
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { updateSmsProviderStatus } from "@/app/utils/sms/sms-service";
import { logger, logError } from "@/app/utils/logger";

// Valid status values from HelloSMS
const VALID_STATUSES = ["delivered", "failed", "not delivered"] as const;

// Validate that status is a known HelloSMS status value
function isValidStatus(status: unknown): status is (typeof VALID_STATUSES)[number] {
    return (
        typeof status === "string" &&
        VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])
    );
}

// HelloSMS API callback payload structure
interface HelloSmsCallbackPayload {
    apiMessageId?: unknown;
    status?: unknown;
    timestamp?: unknown;
    callbackRef?: unknown;
}

export async function POST(request: NextRequest) {
    // Log that the legacy endpoint is being used
    logger.warn(
        "SMS status callback received on legacy endpoint (no secret) - consider updating HelloSMS config",
    );

    try {
        const body = (await request.json()) as HelloSmsCallbackPayload;

        // Extract and validate the message ID (must be a non-empty string)
        const messageId = body.apiMessageId;
        if (typeof messageId !== "string" || !messageId.trim()) {
            logger.warn("SMS status callback missing or invalid apiMessageId");
            return NextResponse.json({ error: "Missing apiMessageId" }, { status: 400 });
        }

        // Extract and validate the status
        const status = body.status;
        if (!isValidStatus(status)) {
            logger.warn(
                { messageId, statusType: typeof status },
                "SMS status callback has invalid status",
            );
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        // Update the SMS record with the provider status
        const updated = await updateSmsProviderStatus(messageId, status);

        if (updated) {
            logger.info(
                { messageId, status, callbackRef: body.callbackRef },
                "SMS provider status updated via legacy callback",
            );
        } else {
            logger.debug(
                { messageId, status },
                "SMS status callback for unknown or already processed message",
            );
        }

        // Always return 200 for valid payloads to prevent HelloSMS retries
        return NextResponse.json({ received: true }, { status: 200 });
    } catch (error) {
        logError("Error processing SMS status callback (legacy)", error, {
            method: "POST",
            path: "/api/webhooks/sms-status",
        });

        // Return 200 even on errors to prevent HelloSMS from retrying
        return NextResponse.json(
            { received: true, error: "Processing failed but acknowledged" },
            { status: 200 },
        );
    }
}
