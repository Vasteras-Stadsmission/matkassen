import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { updateSmsDeliveryStatus } from "@/app/utils/sms/sms-service";

// POST /api/admin/sms/simulate-callback - Simulate SMS delivery callback (test mode only)
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Only allow in test mode
        const isTestMode =
            process.env.HELLO_SMS_TEST_MODE === "true" || process.env.NODE_ENV !== "production";
        if (!isTestMode) {
            return NextResponse.json(
                {
                    error: "Callback simulation only available in test mode",
                },
                { status: 403 },
            );
        }

        const { messageId, delivered } = await request.json();

        if (!messageId || typeof delivered !== "boolean") {
            return NextResponse.json(
                {
                    error: "Missing or invalid messageId or delivered flag",
                },
                { status: 400 },
            );
        }

        const updated = await updateSmsDeliveryStatus(messageId, delivered);

        if (!updated) {
            return NextResponse.json(
                {
                    error: "SMS record not found",
                },
                { status: 404 },
            );
        }

        return NextResponse.json({
            success: true,
            messageId,
            delivered,
            message: `SMS marked as ${delivered ? "delivered" : "not delivered"}`,
        });
    } catch (error) {
        console.error("Error simulating SMS callback:", error);
        return NextResponse.json({ error: "Failed to simulate callback" }, { status: 500 });
    }
}
