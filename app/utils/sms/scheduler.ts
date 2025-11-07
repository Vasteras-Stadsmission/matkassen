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
import { generateUrl } from "@/app/config/branding";
import type { SupportedLocale } from "@/app/utils/locale-detection";
import { logger, logError } from "@/app/utils/logger";

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
            // Generate public URL for the parcel using centralized config
            const publicUrl = generateUrl(`/p/${parcel.parcelId}`);

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
        } catch (error) {
            logError(`Failed to enqueue SMS for parcel ${parcel.parcelId}`, error);
        }
    }

    if (enqueuedCount > 0) {
        logger.info({ count: enqueuedCount }, "Enqueued reminder SMS messages");
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
            logger.info({ count: records.length }, "Processing SMS records ready for sending");
        }

        let sentCount = 0;

        for (const record of records) {
            try {
                await sendSmsRecord(record);
                sentCount++;

                // Small delay between sends to be respectful to the API
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                logError(
                    `SMS failed: ${record.intent} to household ${record.householdId} (${record.id})`,
                    error,
                );
            }
        }

        if (sentCount > 0) {
            logger.debug({ count: sentCount }, "Sent SMS messages");
        }
        // Note: Removed "No SMS messages sent" log to reduce noise
        // Only log when we actually send messages

        return sentCount;
    });

    return result.processed;
}

/**
 * Start the SMS scheduler (enqueue and send loops)
 */
export function startSmsScheduler(): void {
    if (isRunning) {
        return;
    }

    const isFirstStartup = !hasEverStarted;
    isRunning = true;
    hasEverStarted = true;

    const testMode = getHelloSmsConfig().testMode;
    if (testMode) {
        logger.info({ mode: "TEST" }, "HelloSMS is running in TEST MODE");
    } else {
        logger.info({ mode: "LIVE" }, "HelloSMS is running in LIVE mode");
    }

    // Start enqueue loop
    enqueueInterval = setInterval(async () => {
        try {
            await enqueueReminderSms();
        } catch (error) {
            logError("Error in SMS enqueue loop", error);
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
                    logger.info({ pendingSms: health.details.pendingSms }, "SMS service healthy");
                    lastHealthLog = now;
                }
            } else {
                logger.error({ details: health.details }, "SMS service unhealthy");
            }
        } catch (error) {
            logError("SMS health check failed", error);
        }
    }, HEALTH_CHECK_INTERVAL_MS);

    // Run once immediately
    enqueueReminderSms().catch(err => logError("SMS operation error", err));
    processSendQueue().catch(err => logError("SMS operation error", err));

    logger.info(
        {
            enqueueMs: ENQUEUE_INTERVAL_MS,
            sendMs: SEND_INTERVAL_MS,
            healthMs: HEALTH_CHECK_INTERVAL_MS,
        },
        "SMS scheduler started",
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
                logger.info("Sending SMS scheduler startup notification to Slack");
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
                    logger.debug("SMS scheduler startup notification sent to Slack");
                } else {
                    logger.debug("Failed to send SMS scheduler startup notification to Slack");
                }
            })
            .catch(error => {
                logError("Error sending SMS scheduler startup notification", error);
            });
    }
}

/**
 * Stop the SMS scheduler
 */
export function stopSmsScheduler(): void {
    if (!isRunning) {
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

    logger.info("SMS scheduler stopped");
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
