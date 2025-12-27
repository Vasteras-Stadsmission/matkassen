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
import { updateSmsProviderStatus } from "@/app/utils/sms/sms-service";
import { logger, logError } from "@/app/utils/logger";

// CORS headers to allow HelloSMS to call this endpoint
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

// Get the webhook secret from environment
function getWebhookSecret(): string | null {
    return process.env.SMS_CALLBACK_SECRET || null;
}

// Validate the secret from the URL
function isValidSecret(providedSecret: string): boolean {
    const expectedSecret = getWebhookSecret();

    if (!expectedSecret) {
        // If no secret is configured, log error and reject all requests
        logger.error("SMS_CALLBACK_SECRET environment variable is not set");
        return false;
    }

    // Use timing-safe comparison to prevent timing attacks
    if (providedSecret.length !== expectedSecret.length) {
        return false;
    }

    // Simple constant-time comparison
    let mismatch = 0;
    for (let i = 0; i < providedSecret.length; i++) {
        mismatch |= providedSecret.charCodeAt(i) ^ expectedSecret.charCodeAt(i);
    }
    return mismatch === 0;
}

// Handle CORS preflight requests
export async function OPTIONS() {
    return new NextResponse("", {
        status: 200,
        headers: corsHeaders,
    });
}

// HelloSMS API callback payload structure
interface HelloSmsCallbackPayload {
    apiMessageId?: string;
    status?: string; // "delivered" | "failed" | "not delivered"
    timestamp?: number; // UNIX timestamp
    callbackRef?: string; // Custom reference from original request
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

        // Extract the message ID and status from the callback
        const messageId = body.apiMessageId;
        const status = body.status;

        // Validate required fields
        if (!messageId) {
            logger.warn({ body }, "SMS status callback missing apiMessageId");
            return NextResponse.json(
                { error: "Missing apiMessageId" },
                { status: 400, headers: corsHeaders },
            );
        }

        if (!status) {
            logger.warn({ messageId, body }, "SMS status callback missing status");
            return NextResponse.json(
                { error: "Missing status" },
                { status: 400, headers: corsHeaders },
            );
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

        // Always return success to HelloSMS to prevent retries
        // Even if we don't find the message, we don't want HelloSMS to keep retrying
        return NextResponse.json({ received: true }, { status: 200, headers: corsHeaders });
    } catch (error) {
        logError("Error processing SMS status callback", error, {
            method: "POST",
            path: "/api/webhooks/sms-status/[secret]",
        });

        // Return 200 even on errors to prevent HelloSMS from retrying
        // We log the error for investigation but don't want to cause retry loops
        return NextResponse.json(
            { received: true, error: "Processing failed but acknowledged" },
            { status: 200, headers: corsHeaders },
        );
    }
}
