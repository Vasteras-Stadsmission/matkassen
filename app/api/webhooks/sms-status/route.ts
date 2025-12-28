/**
 * Legacy SMS Status Callback Webhook (no authentication)
 *
 * DEPRECATED: This endpoint exists for backwards compatibility with HelloSMS's
 * current configuration. Once HelloSMS is updated to use the secret-based URL,
 * delete this file.
 *
 * New URL format: /api/webhooks/sms-status/[secret]
 */
import { NextRequest } from "next/server";
import { logger } from "@/app/utils/logger";
import { handleSmsStatusCallback } from "./handler";

export async function POST(request: NextRequest) {
    logger.warn(
        "SMS status callback received on legacy endpoint (no secret) - update HelloSMS config",
    );
    return handleSmsStatusCallback(request, "/api/webhooks/sms-status");
}
