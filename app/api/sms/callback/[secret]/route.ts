import { NextRequest, NextResponse } from "next/server";
import { updateSmsDeliveryStatus } from "@/app/utils/sms/sms-service";

// Extract secret from URL path for security
function extractSecretFromPath(pathname: string): string | null {
    const match = pathname.match(/\/api\/sms\/callback\/(.+)$/);
    return match ? match[1] : null;
}

export async function POST(request: NextRequest) {
    try {
        // Verify the secret from the URL path
        const secret = extractSecretFromPath(request.nextUrl.pathname);
        const expectedSecret = process.env.SMS_CALLBACK_SECRET;

        if (!expectedSecret || !secret || secret !== expectedSecret) {
            console.warn("SMS callback: Invalid or missing secret");
            return new NextResponse("Unauthorized", { status: 401 });
        }

        // Parse the callback payload
        const body = await request.json();
        console.log("SMS callback received:", body);

        // Extract delivery status - adapt to HelloSMS callback format
        const { message_id, status, delivered } = body;

        if (!message_id) {
            console.warn("SMS callback: Missing message_id");
            return new NextResponse("Bad Request: Missing message_id", { status: 400 });
        }

        // Determine if message was delivered
        // HelloSMS might send status like "delivered", "failed", etc.
        // or a boolean delivered field
        const isDelivered = delivered === true || status === "delivered";

        // Update the SMS record
        const updated = await updateSmsDeliveryStatus(message_id, isDelivered);

        if (updated) {
            console.log(
                `SMS delivery status updated: ${message_id} -> ${isDelivered ? "delivered" : "not_delivered"}`,
            );
        } else {
            console.warn(`SMS record not found for message_id: ${message_id}`);
        }

        // Always return 200 to prevent retries from the provider
        return new NextResponse("OK", { status: 200 });
    } catch (error) {
        console.error("SMS callback error:", error);
        // Still return 200 to prevent provider retries
        return new NextResponse("OK", { status: 200 });
    }
}
