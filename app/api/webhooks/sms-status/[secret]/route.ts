/**
 * Secure SMS Status Callback Webhook for HelloSMS
 *
 * HelloSMS calls this endpoint when the delivery status of an SMS changes.
 * The callback URL must be configured by contacting HelloSMS support.
 *
 * Security: The URL includes a secret token that acts as authentication.
 * Only HelloSMS (and our server) should know the full URL.
 * Generate a secret with: npx nanoid --size 32
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { logger } from "@/app/utils/logger";
import { handleSmsStatusCallback } from "../handler";

// Minimum required length for the webhook secret
const MIN_SECRET_LENGTH = 32;

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

    return handleSmsStatusCallback(request, "/api/webhooks/sms-status/[secret]");
}
