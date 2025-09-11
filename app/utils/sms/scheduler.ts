/**
 * SMS Scheduler and Worker
 * Periodically enqueues reminder SMS and processes the send queue
 */

import {
    getParcelsNeedingReminder,
    createSmsRecord,
    getSmsRecordsReadyForSending,
    sendSmsRecord,
} from "@/app/utils/sms/sms-service";
import { formatPickupSms } from "@/app/utils/sms/templates";
import { getHelloSmsConfig } from "@/app/utils/sms/hello-sms";
import type { SupportedLocale } from "@/app/utils/locale-detection";

// Import type only when needed
// eslint-disable-next-line @typescript-eslint/no-unused-vars

let isRunning = false;
let enqueueInterval: NodeJS.Timeout | null = null;
let sendInterval: NodeJS.Timeout | null = null;

// Configuration
const ENQUEUE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const SEND_INTERVAL_MS = 30 * 1000; // 30 seconds
const SEND_BATCH_SIZE = 5;

/**
 * Enqueue SMS for parcels needing reminders
 */
export async function enqueueReminderSms(): Promise<number> {
    const parcels = await getParcelsNeedingReminder();
    let enqueuedCount = 0;

    for (const parcel of parcels) {
        try {
            // Generate public URL for the parcel
            const baseUrl =
                process.env.NEXT_PUBLIC_BASE_URL ||
                (process.env.NODE_ENV === "production"
                    ? "https://matkassen.org"
                    : "http://localhost:3000");
            const publicUrl = `${baseUrl}/p/${parcel.parcelId}`;

            // Generate SMS text with Date object (formatting handled inside template function)
            const smsText = formatPickupSms(
                {
                    householdName: parcel.householdName,
                    pickupDate: parcel.pickupDate, // Pass Date object directly
                    locationName: parcel.locationName,
                    publicUrl,
                },
                parcel.locale as SupportedLocale,
            );

            // Create SMS record
            await createSmsRecord({
                intent: "pickup_reminder",
                parcelId: parcel.parcelId,
                householdId: parcel.householdId,
                toE164: parcel.phone,
                text: smsText,
            });

            enqueuedCount++;
            console.log(`Enqueued reminder SMS for parcel ${parcel.parcelId}`);
        } catch (error) {
            console.error(`Failed to enqueue SMS for parcel ${parcel.parcelId}:`, error);
        }
    }

    if (enqueuedCount > 0) {
        console.log(`Enqueued ${enqueuedCount} reminder SMS messages`);
    }

    return enqueuedCount;
}

/**
 * Process SMS send queue
 */
export async function processSendQueue(): Promise<number> {
    console.log("🔄 Processing SMS send queue...");
    const records = await getSmsRecordsReadyForSending(SEND_BATCH_SIZE);
    console.log(`📨 Found ${records.length} SMS records ready for sending`);

    let sentCount = 0;

    for (const record of records) {
        try {
            console.log(`📤 Sending SMS ${record.id} to ${record.toE164}`);
            await sendSmsRecord(record);
            sentCount++;
            console.log(`✅ Sent SMS ${record.id} to ${record.toE164}`);

            // Small delay between sends to be respectful to the API
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error(`❌ Failed to send SMS ${record.id}:`, error);
        }
    }

    if (sentCount > 0) {
        console.log(`🎉 Sent ${sentCount} SMS messages`);
    } else {
        console.log("📭 No SMS messages sent");
    }

    return sentCount;
}

/**
 * Start the SMS scheduler (enqueue and send loops)
 */
export function startSmsScheduler(): void {
    if (isRunning) {
        console.log("SMS scheduler is already running");
        return;
    }

    isRunning = true;
    const testMode = getHelloSmsConfig().testMode;
    if (testMode) {
        console.log("🚦 HelloSMS is running in TEST MODE (no real SMS will be sent)");
    } else {
        console.log("✅ HelloSMS is running in LIVE mode (real SMS will be sent)");
    }

    // Start enqueue loop
    enqueueInterval = setInterval(async () => {
        try {
            await enqueueReminderSms();
        } catch (error) {
            console.error("Error in SMS enqueue loop:", error);
        }
    }, ENQUEUE_INTERVAL_MS);

    // Start send loop
    sendInterval = setInterval(async () => {
        try {
            await processSendQueue();
        } catch (error) {
            console.error("Error in SMS send loop:", error);
        }
    }, SEND_INTERVAL_MS);

    // Run once immediately
    enqueueReminderSms().catch(console.error);
    processSendQueue().catch(console.error);

    console.log(
        `SMS scheduler started (enqueue: ${ENQUEUE_INTERVAL_MS}ms, send: ${SEND_INTERVAL_MS}ms)`,
    );
}

/**
 * Stop the SMS scheduler
 */
export function stopSmsScheduler(): void {
    if (!isRunning) {
        console.log("SMS scheduler is not running");
        return;
    }

    isRunning = false;

    if (enqueueInterval) {
        clearInterval(enqueueInterval);
        enqueueInterval = null;
    }

    if (sendInterval) {
        clearInterval(sendInterval);
        sendInterval = null;
    }

    console.log("SMS scheduler stopped");
}

/**
 * Check if scheduler is running
 */
export function isSmsSchedulerRunning(): boolean {
    return isRunning;
}

/**
 * Manual trigger for enqueue (for testing/admin)
 */
export async function triggerEnqueue(): Promise<{
    success: boolean;
    count?: number;
    error?: string;
}> {
    try {
        const count = await enqueueReminderSms();
        return { success: true, count };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

/**
 * Manual trigger for send queue processing (for testing/admin)
 */
export async function triggerSendQueue(): Promise<{
    success: boolean;
    count?: number;
    error?: string;
}> {
    try {
        const count = await processSendQueue();
        return { success: true, count };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
