/**
 * SMS Status Callback Webhook for HelloSMS
 *
 * HelloSMS calls this endpoint when the delivery status of an SMS changes.
 * The callback contains the message ID and a status text in English.
 *
 * Expected payload format from HelloSMS:
 * {
 *   "apiMessageId": "abc123...",
 *   "status": "Delivered" | "Failed" | "Sent" | etc.
 *   "to": "+46701234567" (optional)
 *   "statusText": "Additional details" (optional)
 * }
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

// Handle CORS preflight requests
export async function OPTIONS() {
    return new NextResponse("", {
        status: 200,
        headers: corsHeaders,
    });
}

// HelloSMS callback payload structure
interface HelloSmsCallbackPayload {
    apiMessageId?: string;
    status?: string;
    to?: string;
    statusText?: string;
    // HelloSMS may send additional fields
    [key: string]: unknown;
}

export async function POST(request: NextRequest) {
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

        // Combine status and statusText if both present
        const fullStatus = body.statusText ? `${status}: ${body.statusText}` : status;

        // Update the SMS record with the provider status
        const updated = await updateSmsProviderStatus(messageId, fullStatus);

        if (updated) {
            logger.info(
                { messageId, status: fullStatus },
                "SMS provider status updated via callback",
            );
        } else {
            // This is not necessarily an error - the message might be old or already processed
            logger.debug(
                { messageId, status: fullStatus },
                "SMS status callback for unknown or already processed message",
            );
        }

        // Always return success to HelloSMS to prevent retries
        // Even if we don't find the message, we don't want HelloSMS to keep retrying
        return NextResponse.json(
            { received: true },
            { status: 200, headers: corsHeaders },
        );
    } catch (error) {
        logError("Error processing SMS status callback", error, {
            method: "POST",
            path: "/api/webhooks/sms-status",
        });

        // Return 200 even on errors to prevent HelloSMS from retrying
        // We log the error for investigation but don't want to cause retry loops
        return NextResponse.json(
            { received: true, error: "Processing failed but acknowledged" },
            { status: 200, headers: corsHeaders },
        );
    }
}
