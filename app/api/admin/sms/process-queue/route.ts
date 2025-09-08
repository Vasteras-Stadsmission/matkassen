import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { processSendQueue } from "@/app/utils/sms/scheduler";

export async function POST() {
    try {
        // Check authentication
        const session = await auth();
        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        // Manually trigger SMS queue processing
        const result = await processSendQueue();

        return NextResponse.json({
            success: true,
            message: `Processed ${result} SMS messages from queue`,
            processedCount: result,
        });
    } catch (error) {
        console.error("Error processing SMS queue:", error);
        return NextResponse.json({ error: "Failed to process SMS queue" }, { status: 500 });
    }
}
