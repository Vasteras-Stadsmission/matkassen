/**
 * SMS Status Callback Webhook for HelloSMS
 *
 * HelloSMS calls this endpoint when the delivery status of an SMS changes.
 * The callback URL must be configured by contacting HelloSMS support.
 *
 * Security: The URL includes a secret token that acts as authentication.
 * Only HelloSMS (and our server) should know the full URL.
 * Generate a secret with: npx nanoid --size 32
 *
 * Expected payload format from HelloSMS:
 * {
 *   "apiMessageId": "12345",
 *   "status": "delivered" | "failed" | "not delivered",
 *   "timestamp": 1672531199,
 *   "callbackRef": "someReference"
 * }
 *
 * Status values:
 * - "delivered": Message successfully delivered to recipient's phone
 * - "failed": Permanent failure (invalid/inactive phone number)
 * - "not delivered": Temporary failure (phone off/offline)
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { updateSmsProviderStatus } from "@/app/utils/sms/sms-service";
import { logger, logError } from "@/app/utils/logger";

// Minimum required length for the webhook secret
const MIN_SECRET_LENGTH = 32;

// Valid status values from HelloSMS
const VALID_STATUSES = ["delivered", "failed", "not delivered"] as const;

// Get the webhook secret from environment
function getWebhookSecret(): string | null {
    const secret = process.env.SMS_CALLBACK_SECRET?.trim() || null;

    // Reject secrets that are too short or contain only whitespace
    if (secret && secret.length < MIN_SECRET_LENGTH) {
        logger.error(
            { length: secret.length, required: MIN_SECRET_LENGTH },
            "SMS_CALLBACK_SECRET is too short",
        );
        return null;
    }

    return secret;
}

// Validate the secret from the URL using timing-safe comparison
function isValidSecret(providedSecret: string): boolean {
    const expectedSecret = getWebhookSecret();

    if (!expectedSecret) {
        logger.error("SMS_CALLBACK_SECRET environment variable is not set or invalid");
        return false;
    }

    // Reject obviously invalid secrets without timing info leak
    if (!providedSecret || providedSecret.length < MIN_SECRET_LENGTH) {
        return false;
    }

    // Use Node's crypto.timingSafeEqual for constant-time comparison
    // Pad to same length to prevent length-based timing attacks
    const maxLength = Math.max(providedSecret.length, expectedSecret.length);
    const providedBuffer = Buffer.alloc(maxLength);
    const expectedBuffer = Buffer.alloc(maxLength);

    Buffer.from(providedSecret).copy(providedBuffer);
    Buffer.from(expectedSecret).copy(expectedBuffer);

    // Both buffers same length, and we also check actual lengths match
    return (
        providedSecret.length === expectedSecret.length &&
        timingSafeEqual(providedBuffer, expectedBuffer)
    );
}

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

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ secret: string }> },
) {
    const { secret } = await params;

    // Validate the secret first
    if (!isValidSecret(secret)) {
        // Don't reveal whether the secret was wrong or missing
        // Use 404 to make it look like the endpoint doesn't exist
        logger.warn("SMS status callback received with invalid secret");
        return new NextResponse("Not Found", { status: 404 });
    }

    try {
        const body = (await request.json()) as HelloSmsCallbackPayload;

        // Extract and validate the message ID (must be a non-empty string)
        const messageId = body.apiMessageId;
        if (typeof messageId !== "string" || !messageId.trim()) {
            // Return 400 for malformed payloads - HelloSMS should fix their request
            // This is different from "message not found" which returns 200
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
            path: "/api/webhooks/sms-status/[secret]",
        });

        // Return 200 even on errors to prevent HelloSMS from retrying
        // We log the error for investigation but don't want to cause retry loops
        return NextResponse.json(
            { received: true, error: "Processing failed but acknowledged" },
            { status: 200 },
        );
    }
}
