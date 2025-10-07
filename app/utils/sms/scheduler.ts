/**
 * SMS Scheduler and Worker
 * Periodically enqueues reminder SMS and processes the send queue
 */

import {
    getParcelsNeedingReminder,
    createSmsRecord,
    getSmsRecordsReadyForSending,
    sendSmsRecord,
    processSendQueueWithLock,
} from "@/app/utils/sms/sms-service";
import { formatPickupSms } from "@/app/utils/sms/templates";
import { getHelloSmsConfig } from "@/app/utils/sms/hello-sms";
import type { SupportedLocale } from "@/app/utils/locale-detection";

// Import type only when needed
// eslint-disable-next-line @typescript-eslint/no-unused-vars

let isRunning = false;
let enqueueInterval: NodeJS.Timeout | null = null;
let sendInterval: NodeJS.Timeout | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
let lastHealthLog = 0; // Track when we last logged health status
let hasEverStarted = false; // Track if scheduler has ever been started

// Configuration
const ENQUEUE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const SEND_INTERVAL_MS = 30 * 1000; // 30 seconds
const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
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
                    pickupDate: parcel.pickupDate, // Pass Date object directly
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
            console.error("Failed to enqueue SMS for parcel %s:", parcel.parcelId, error);
        }
    }

    if (enqueuedCount > 0) {
        console.log(`Enqueued ${enqueuedCount} reminder SMS messages`);
    }

    return enqueuedCount;
}

/**
 * Process SMS send queue with advisory lock protection
 */
export async function processSendQueue(): Promise<number> {
    // Use the protected version that handles locking
    const result = await processSendQueueWithLock(async () => {
        const records = await getSmsRecordsReadyForSending(SEND_BATCH_SIZE);

        // Only log processing when there are records to process
        if (records.length > 0) {
            console.log(`� Processing ${records.length} SMS records ready for sending`);
        }

        let sentCount = 0;

        for (const record of records) {
            try {
                await sendSmsRecord(record);
                sentCount++;
                console.log(
                    `✅ SMS sent: ${record.intent} to household ${record.householdId} (${record.id})`,
                );

                // Small delay between sends to be respectful to the API
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(
                    `❌ SMS failed: ${record.intent} to household ${record.householdId} (${record.id}):`,
                    error,
                );
            }
        }

        if (sentCount > 0) {
            console.log(`🎉 Sent ${sentCount} SMS messages`);
        }
        // Note: Removed "No SMS messages sent" log to reduce noise
        // Only log when we actually send messages

        return sentCount;
    });

    if (!result.lockAcquired) {
        console.log("⏸️  Skipped SMS queue processing - already running elsewhere");
    }

    return result.processed;
}

/**
 * Start the SMS scheduler (enqueue and send loops)
 */
export function startSmsScheduler(): void {
    if (isRunning) {
        console.log("SMS scheduler is already running");
        return;
    }

    const isFirstStartup = !hasEverStarted;
    isRunning = true;
    hasEverStarted = true;

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

    // Start health check loop
    healthCheckInterval = setInterval(async () => {
        try {
            const health = await smsHealthCheck();
            if (health.status === "healthy") {
                // Only log health every 30 minutes to reduce noise
                const now = Date.now();
                if (now - lastHealthLog > 30 * 60 * 1000) {
                    console.log(`💚 SMS service healthy (${health.details.pendingSms} pending)`);
                    lastHealthLog = now;
                }
            } else {
                console.error(`💔 SMS service unhealthy:`, health.details);
            }
        } catch (error) {
            console.error("❌ SMS health check failed:", error);
        }
    }, HEALTH_CHECK_INTERVAL_MS);

    // Run once immediately
    enqueueReminderSms().catch(console.error);
    processSendQueue().catch(console.error);

    console.log(
        `SMS scheduler started (enqueue: ${ENQUEUE_INTERVAL_MS}ms, send: ${SEND_INTERVAL_MS}ms, health: ${HEALTH_CHECK_INTERVAL_MS}ms)`,
    );

    // Send Slack notification for successful startup (always in production mode)
    // Always notify on first startup, or when explicitly restarted
    if (
        process.env.NODE_ENV === "production" &&
        (isFirstStartup || process.env.FORCE_STARTUP_NOTIFICATION === "true")
    ) {
        // Use dynamic import to avoid module resolution issues during build
        import("../notifications/slack")
            .then(({ sendSlackAlert }) => {
                console.log("📢 Sending SMS scheduler startup notification to Slack...");
                return sendSlackAlert({
                    title: isFirstStartup ? "SMS Scheduler Started" : "SMS Scheduler Restarted",
                    message:
                        `SMS background scheduler ${isFirstStartup ? "started" : "restarted"} successfully in ${testMode ? "TEST" : "LIVE"} mode. ` +
                        `Intervals: enqueue every ${ENQUEUE_INTERVAL_MS / 60000}min, send every ${SEND_INTERVAL_MS / 1000}s`,
                    status: "success",
                    details: {
                        "Test Mode": testMode ? "Enabled (no real SMS)" : "Disabled (live SMS)",
                        "Enqueue Interval": `${ENQUEUE_INTERVAL_MS / 60000} minutes`,
                        "Health Check Interval": `${HEALTH_CHECK_INTERVAL_MS / 60000} minutes`,
                        "Startup Type": isFirstStartup ? "Initial startup" : "Restart/Recovery",
                    },
                });
            })
            .then(success => {
                if (success) {
                    console.log("✅ SMS scheduler startup notification sent to Slack");
                } else {
                    console.warn("⚠️ Failed to send SMS scheduler startup notification to Slack");
                }
            })
            .catch(error => {
                console.error("❌ Error sending SMS scheduler startup notification:", error);
            });
    }
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

    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
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
 * Simple SMS service health check
 */
export async function smsHealthCheck(): Promise<{
    status: "healthy" | "unhealthy";
    details: Record<string, unknown>;
}> {
    try {
        // Simple check: can we query pending SMS?
        const pendingCount = await getSmsRecordsReadyForSending(5);

        return {
            status: "healthy",
            details: {
                schedulerRunning: isRunning,
                testMode: getHelloSmsConfig().testMode,
                pendingSms: pendingCount.length,
                timestamp: new Date().toISOString(),
            },
        };
    } catch (error) {
        return {
            status: "unhealthy",
            details: {
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: new Date().toISOString(),
            },
        };
    }
}
