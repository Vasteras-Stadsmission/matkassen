/**
 * Unified Scheduler for Background Tasks
 * Handles both SMS scheduling and household anonymization
 */

import cron, { type ScheduledTask } from "node-cron";
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
import { parseDuration } from "@/app/utils/duration-parser";
import { anonymizeInactiveHouseholds } from "@/app/utils/anonymization/anonymize-household";
import { logger, logError, logCron } from "@/app/utils/logger";

type SchedulerState = {
    isRunning: boolean;
    smsEnqueueInterval: NodeJS.Timeout | null;
    smsSendInterval: NodeJS.Timeout | null;
    anonymizationTask: ScheduledTask | null;
    healthCheckInterval: NodeJS.Timeout | null;
    lastHealthLog: number;
    hasEverStarted: boolean;
    lastAnonymizationRun: Date | null;
    lastAnonymizationStatus: "success" | "error" | null;
};

const GLOBAL_STATE_KEY = "__matkassenSchedulerState";

function getSchedulerState(): SchedulerState {
    const globalObj = globalThis as typeof globalThis & {
        __matkassenSchedulerState?: SchedulerState;
    };

    if (!globalObj[GLOBAL_STATE_KEY]) {
        globalObj[GLOBAL_STATE_KEY] = {
            isRunning: false,
            smsEnqueueInterval: null,
            smsSendInterval: null,
            anonymizationTask: null,
            healthCheckInterval: null,
            lastHealthLog: 0,
            hasEverStarted: false,
            lastAnonymizationRun: null,
            lastAnonymizationStatus: null,
        };
    }

    return globalObj[GLOBAL_STATE_KEY]!;
}

const schedulerState = getSchedulerState();

// SMS Configuration
const SMS_ENQUEUE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const SMS_SEND_INTERVAL = process.env.SMS_SEND_INTERVAL || "5 minutes";

// Validate SMS_SEND_INTERVAL with descriptive error
let SMS_SEND_INTERVAL_MS: number;
try {
    SMS_SEND_INTERVAL_MS = parseDuration(SMS_SEND_INTERVAL);
    logger.info(
        { smsSendInterval: SMS_SEND_INTERVAL, intervalMs: SMS_SEND_INTERVAL_MS },
        "SMS send interval configured",
    );
} catch (error) {
    throw new Error(
        `Invalid SMS_SEND_INTERVAL environment variable: "${SMS_SEND_INTERVAL}". ` +
            `Expected format: "5 minutes", "30s", "2h", etc. ` +
            `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
}

const HEALTH_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
const SMS_SEND_BATCH_SIZE = 5;

// Anonymization Configuration (from env vars)
const ANONYMIZATION_SCHEDULE = process.env.ANONYMIZATION_SCHEDULE || "0 2 * * 0"; // Sunday 2 AM
const ANONYMIZATION_INACTIVE_DURATION = process.env.ANONYMIZATION_INACTIVE_DURATION || "1 year";

/**
 * Enqueue SMS for parcels needing reminders
 */
async function enqueueReminderSms(): Promise<number> {
    const parcels = await getParcelsNeedingReminder();
    let enqueuedCount = 0;

    for (const parcel of parcels) {
        try {
            const publicUrl = generateUrl(`/p/${parcel.parcelId}`);
            const smsText = formatPickupSms(
                {
                    pickupDate: parcel.pickupDate,
                    publicUrl,
                },
                parcel.locale as SupportedLocale,
            );

            // Schedule SMS to be sent 48h before pickup
            // If pickup is sooner than 48h, SMS will be sent on next scheduler run
            const scheduledSendTime = new Date(parcel.pickupDate.getTime() - 48 * 60 * 60 * 1000);

            await createSmsRecord({
                intent: "pickup_reminder",
                parcelId: parcel.parcelId,
                householdId: parcel.householdId,
                toE164: parcel.phone,
                text: smsText,
                nextAttemptAt: scheduledSendTime,
            });

            enqueuedCount++;
        } catch (error) {
            logError("Failed to enqueue SMS for parcel", error, { parcelId: parcel.parcelId });
        }
    }

    if (enqueuedCount > 0) {
        logger.info({ count: enqueuedCount }, "Enqueued SMS reminder messages");
    }

    return enqueuedCount;
}

/**
 * Process SMS send queue with advisory lock protection
 */
async function processSendQueue(): Promise<number> {
    const result = await processSendQueueWithLock(async () => {
        const records = await getSmsRecordsReadyForSending(SMS_SEND_BATCH_SIZE);

        if (records.length > 0) {
            logger.info({ count: records.length }, "Processing SMS records ready for sending");
        }

        let sentCount = 0;

        for (const record of records) {
            try {
                await sendSmsRecord(record);
                sentCount++;

                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                logError("Failed to send SMS", error, {
                    intent: record.intent,
                    householdId: record.householdId,
                    smsId: record.id,
                });
            }
        }

        if (sentCount > 0) {
            logger.debug({ count: sentCount }, "SMS batch sent successfully");
        }

        return sentCount;
    });

    return result.processed;
}

/**
 * Run anonymization schedule
 * Anonymizes households that have been inactive for the configured duration
 * @returns The result of the anonymization run (anonymized count and errors)
 */
async function runAnonymizationSchedule(): Promise<{
    anonymized: number;
    errors: string[];
}> {
    logCron("anonymization", "started", { threshold: ANONYMIZATION_INACTIVE_DURATION });
    schedulerState.lastAnonymizationRun = new Date();

    try {
        // Parse duration to milliseconds
        const durationMs = parseDuration(ANONYMIZATION_INACTIVE_DURATION);

        const result = await anonymizeInactiveHouseholds(durationMs);

        // Set status based on whether any errors occurred
        // Any failure is critical for GDPR compliance and requires investigation
        if (result.errors.length > 0) {
            logCron("anonymization", "failed", {
                anonymized: result.anonymized,
                failed: result.errors.length,
                errors: result.errors,
            });
            schedulerState.lastAnonymizationStatus = "error";
            await notifyAnonymizationError(result);
        } else {
            logCron("anonymization", "completed", { anonymized: result.anonymized });
            schedulerState.lastAnonymizationStatus = "success";
        }

        return result;
    } catch (error) {
        logError("Failed to run scheduled anonymization", error);
        schedulerState.lastAnonymizationStatus = "error";

        const errorResult = {
            anonymized: 0,
            errors: [error instanceof Error ? error.message : "Unknown error"],
        };

        // Send Slack notification for critical errors
        await notifyAnonymizationError(errorResult);

        return errorResult;
    }
}

/**
 * Send Slack notification for anonymization errors
 */
async function notifyAnonymizationError(result: {
    anonymized: number;
    errors: string[];
}): Promise<void> {
    if (process.env.NODE_ENV !== "production") {
        return;
    }

    try {
        const { sendSlackAlert } = await import("@/app/utils/notifications/slack");

        const errorList = result.errors.map(e => `• ${e}`).join("\n");

        await sendSlackAlert({
            title: "🚨 Household Anonymization Error",
            message:
                `Anonymization task completed with errors.\n` +
                `Success: ${result.anonymized}, Failed: ${result.errors.length}`,
            status: "error",
            details: {
                "Success Count": result.anonymized.toString(),
                "Failure Count": result.errors.length.toString(),
                "Errors": errorList || "Unknown error",
                "Timestamp": new Date().toISOString(),
            },
        });

        logger.debug("Anonymization error notification sent to Slack");
    } catch (error) {
        logError("Failed to send anonymization Slack notification", error);
    }
}

/**
 * Start the unified scheduler
 */
export function startScheduler(): void {
    if (schedulerState.isRunning) {
        return;
    }

    const isFirstStartup = !schedulerState.hasEverStarted;
    schedulerState.isRunning = true;
    schedulerState.hasEverStarted = true;

    const testMode = getHelloSmsConfig().testMode;

    logger.info(
        {
            smsTestMode: testMode,
            smsEnqueueIntervalMinutes: SMS_ENQUEUE_INTERVAL_MS / 60000,
            smsSendInterval: SMS_SEND_INTERVAL,
            anonymizationSchedule: ANONYMIZATION_SCHEDULE,
            anonymizationInactiveDuration: ANONYMIZATION_INACTIVE_DURATION,
        },
        "Starting unified background scheduler",
    );

    // Start SMS enqueue loop
    schedulerState.smsEnqueueInterval = setInterval(async () => {
        try {
            await enqueueReminderSms();
        } catch (error) {
            logError("Error in SMS enqueue loop", error);
        }
    }, SMS_ENQUEUE_INTERVAL_MS);

    // Run enqueue immediately on first startup (don't wait 30 min for first interval)
    if (isFirstStartup) {
        setImmediate(async () => {
            try {
                logger.info("Running initial SMS enqueue on startup");
                await enqueueReminderSms();
            } catch (error) {
                logError("Error in initial SMS enqueue", error);
            }
        });
    }

    // Start SMS send loop (kept separate for backward compatibility)
    schedulerState.smsSendInterval = setInterval(async () => {
        try {
            await processSendQueue();
        } catch (error) {
            logError("Error in SMS send loop", error);
        }
    }, SMS_SEND_INTERVAL_MS);

    // Start anonymization cron job
    try {
        schedulerState.anonymizationTask = cron.schedule(ANONYMIZATION_SCHEDULE, async () => {
            await runAnonymizationSchedule();
        });
        logger.info({ schedule: ANONYMIZATION_SCHEDULE }, "Anonymization cron job scheduled");
    } catch (error) {
        logError(
            "Failed to schedule anonymization cron job - invalid schedule format. Health checks will report unhealthy until fixed.",
            error,
            {
                invalidSchedule: ANONYMIZATION_SCHEDULE,
                expectedFormat: "Cron syntax (e.g., '0 2 * * 0')",
            },
        );

        // Send Slack alert in production about configuration error
        if (process.env.NODE_ENV === "production") {
            import("@/app/utils/notifications/slack")
                .then(({ sendSlackAlert }) => {
                    return sendSlackAlert({
                        title: "🚨 Anonymization Cron Failed to Start",
                        message:
                            `Invalid ANONYMIZATION_SCHEDULE: "${ANONYMIZATION_SCHEDULE}"\n` +
                            `Health checks will report unhealthy until fixed.`,
                        status: "error",
                        details: {
                            "Invalid Schedule": ANONYMIZATION_SCHEDULE,
                            "Error": error instanceof Error ? error.message : "Unknown error",
                            "Expected Format": "Cron syntax (e.g., '0 2 * * 0' for Sunday 2 AM)",
                            "Timestamp": new Date().toISOString(),
                        },
                    });
                })
                .catch(notifyError => {
                    logError("Failed to send Slack alert about cron error", notifyError);
                });
        }
    }

    // Start health check loop
    schedulerState.healthCheckInterval = setInterval(async () => {
        const now = Date.now();
        // Only log every 12 hours to reduce noise
        if (now - schedulerState.lastHealthLog > HEALTH_CHECK_INTERVAL_MS) {
            try {
                const health = await schedulerHealthCheck();
                // Only log unhealthy status to reduce noise
                if (health.status !== "healthy") {
                    logger.error({ details: health.details }, "Scheduler health check failed");
                }
                schedulerState.lastHealthLog = now;
            } catch (error) {
                logError("Scheduler health check failed", error);
            }
        }
    }, HEALTH_CHECK_INTERVAL_MS);

    // Run SMS tasks once immediately
    enqueueReminderSms().catch(err => logError("Error in immediate SMS enqueue", err));
    processSendQueue().catch(err => logError("Error in immediate SMS send", err));

    logger.debug("Scheduler started successfully");

    // Send Slack notification on startup (production only, first startup)
    if (process.env.NODE_ENV === "production" && isFirstStartup) {
        import("@/app/utils/notifications/slack")
            .then(({ sendSlackAlert }) => {
                return sendSlackAlert({
                    title: "🚀 Scheduler Started",
                    message: "Unified background scheduler started successfully",
                    status: "success",
                    details: {
                        "SMS Test Mode": testMode ? "Enabled (no real SMS)" : "Disabled (live SMS)",
                        "SMS Enqueue Interval": `${SMS_ENQUEUE_INTERVAL_MS / 60000} minutes`,
                        "Anonymization Schedule": ANONYMIZATION_SCHEDULE,
                        "Anonymization Duration": ANONYMIZATION_INACTIVE_DURATION,
                        "Environment": process.env.NODE_ENV || "development",
                    },
                });
            })
            .then(success => {
                if (success) {
                    logger.debug("Scheduler startup notification sent to Slack");
                } else {
                    logger.debug("Failed to send Slack startup notification");
                }
            })
            .catch(error => {
                logError("Error sending Slack startup notification", error);
            });
    }
}

/**
 * Stop the unified scheduler
 */
export function stopScheduler(): void {
    if (!schedulerState.isRunning) {
        return;
    }

    schedulerState.isRunning = false;

    if (schedulerState.smsEnqueueInterval) {
        clearInterval(schedulerState.smsEnqueueInterval);
        schedulerState.smsEnqueueInterval = null;
    }

    if (schedulerState.smsSendInterval) {
        clearInterval(schedulerState.smsSendInterval);
        schedulerState.smsSendInterval = null;
    }

    if (schedulerState.anonymizationTask) {
        schedulerState.anonymizationTask.stop();
        schedulerState.anonymizationTask = null;
    }

    if (schedulerState.healthCheckInterval) {
        clearInterval(schedulerState.healthCheckInterval);
        schedulerState.healthCheckInterval = null;
    }

    logger.debug("Scheduler stopped");
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning(): boolean {
    return schedulerState.isRunning;
}

/**
 * Get scheduler health status (for /api/health endpoint)
 */
export async function schedulerHealthCheck(): Promise<{
    status: "healthy" | "unhealthy";
    details: Record<string, unknown>;
}> {
    try {
        const pendingCount = await getSmsRecordsReadyForSending(5);

        // CRITICAL: If anonymization cron failed to start, treat as unhealthy
        // This catches invalid ANONYMIZATION_SCHEDULE env var before Slack alerts fail
        const anonymizationSchedulerRunning = schedulerState.anonymizationTask !== null;
        const isHealthy = schedulerState.isRunning && anonymizationSchedulerRunning;

        return {
            status: isHealthy ? "healthy" : "unhealthy",
            details: {
                schedulerRunning: schedulerState.isRunning,
                smsSchedulerRunning:
                    schedulerState.smsEnqueueInterval !== null &&
                    schedulerState.smsSendInterval !== null,
                anonymizationSchedulerRunning,
                smsTestMode: getHelloSmsConfig().testMode,
                smsPendingCount: pendingCount.length,
                lastAnonymizationRun: schedulerState.lastAnonymizationRun?.toISOString() || "Never",
                lastAnonymizationStatus: schedulerState.lastAnonymizationStatus,
                // Configuration visibility for debugging
                anonymizationSchedule: ANONYMIZATION_SCHEDULE,
                anonymizationInactiveDuration: ANONYMIZATION_INACTIVE_DURATION,
                smsSendInterval: SMS_SEND_INTERVAL,
                timestamp: new Date().toISOString(),
                ...((!schedulerState.isRunning || !anonymizationSchedulerRunning) && {
                    healthCheckFailure: !schedulerState.isRunning
                        ? "Scheduler not running"
                        : "Anonymization cron not scheduled (check ANONYMIZATION_SCHEDULE env var)",
                }),
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

/**
 * Manual trigger for anonymization (for testing/admin)
 *
 * Returns actual counts from the anonymization run, not binary 0/1 values.
 * Example: 100 eligible → 95 succeed, 5 fail → { success: true, successCount: 95, failureCount: 5 }
 *
 * @returns Promise resolving to:
 *   - success: true if function completed (even with partial failures), false if exception thrown
 *   - successCount: actual number of households successfully anonymized
 *   - failureCount: actual number of households that failed to anonymize
 *   - error: error message if function threw exception
 */
export async function triggerAnonymization(): Promise<{
    success: boolean;
    successCount?: number;
    failureCount?: number;
    error?: string;
}> {
    try {
        const result = await runAnonymizationSchedule();

        // Return actual counts from the anonymization run
        // This provides actionable data for admin UI/API consumers
        return {
            success: true,
            successCount: result.anonymized,
            failureCount: result.errors.length,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

/**
 * Manual trigger for SMS enqueue (for testing/admin)
 */
export async function triggerSmsEnqueue(): Promise<{
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
 * Manual trigger for SMS queue processing (for testing/admin)
 * Processes pending SMS messages in the queue
 */
export async function triggerSmsProcessQueue(): Promise<{
    success: boolean;
    processedCount?: number;
    lockAcquired?: boolean;
    error?: string;
}> {
    try {
        const result = await processSendQueueWithLock(async () => {
            const records = await getSmsRecordsReadyForSending(SMS_SEND_BATCH_SIZE);

            let sentCount = 0;
            for (const record of records) {
                try {
                    await sendSmsRecord(record);
                    sentCount++;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    logError("Failed to send SMS", error, {
                        intent: record.intent,
                        householdId: record.householdId,
                        smsId: record.id,
                    });
                }
            }
            return sentCount;
        });

        return {
            success: true,
            processedCount: result.processed,
            lockAcquired: result.lockAcquired,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
