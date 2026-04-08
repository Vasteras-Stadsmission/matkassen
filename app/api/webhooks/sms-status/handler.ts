/**
 * Handler for SMS Status Callback Webhook
 *
 * Used by the secure endpoint: /api/webhooks/sms-status/[secret]
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
import { ALL_PROVIDER_STATUSES } from "@/app/utils/sms/sms-gateway";
import { logger, logError } from "@/app/utils/logger";

// Validate that status is a known HelloSMS status value.
// Uses ALL_PROVIDER_STATUSES as single source of truth (defined in sms-gateway.ts).
function isValidStatus(status: unknown): status is (typeof ALL_PROVIDER_STATUSES)[number] {
    return (
        typeof status === "string" &&
        ALL_PROVIDER_STATUSES.includes(status as (typeof ALL_PROVIDER_STATUSES)[number])
    );
}

// HelloSMS API callback payload structure
interface HelloSmsCallbackPayload {
    apiMessageId?: unknown;
    status?: unknown;
    timestamp?: unknown;
    callbackRef?: unknown;
}

/**
 * Process an SMS status callback from HelloSMS.
 *
 * @param request The incoming request
 * @param logPath Path to use in log messages (for distinguishing legacy vs secure)
 */
export async function handleSmsStatusCallback(
    request: NextRequest,
    logPath: string,
): Promise<NextResponse> {
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
                "SMS provider status updated via callback",
            );
        } else {
            // This is not necessarily an error - the message might be old or already processed
            logger.debug(
                { messageId, status },
                "SMS status callback for unknown or already processed message",
            );
        }

        // Always return 200 for valid payloads to prevent HelloSMS retries
        return NextResponse.json({ received: true }, { status: 200 });
    } catch (error) {
        logError("Error processing SMS status callback", error, {
            method: "POST",
            path: logPath,
        });

        // Alert to Slack so webhook processing failures are visible.
        // Uses state-transition pattern to avoid flooding Slack during a DB outage.
        import("@/app/utils/notifications/slack")
            .then(({ sendSmsHealthAlert }) =>
                sendSmsHealthAlert(false, {
                    error: error instanceof Error ? error.message : String(error),
                    component: "sms-webhook",
                }),
            )
            .catch(err => logError("Failed to send webhook error Slack alert", err));

        // Return 200 even on errors to prevent HelloSMS from retrying
        return NextResponse.json(
            { received: true, error: "Processing failed but acknowledged" },
            { status: 200 },
        );
    }
}
