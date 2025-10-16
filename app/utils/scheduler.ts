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

// Scheduler state
let isRunning = false;
let smsEnqueueInterval: NodeJS.Timeout | null = null;
let smsSendInterval: NodeJS.Timeout | null = null;
let anonymizationTask: ScheduledTask | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
let lastHealthLog = 0;
let hasEverStarted = false;
let lastAnonymizationRun: Date | null = null;
let lastAnonymizationStatus: "success" | "error" | null = null;

// SMS Configuration
const SMS_ENQUEUE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const SMS_SEND_INTERVAL = process.env.SMS_SEND_INTERVAL || "5 minutes";
const SMS_SEND_INTERVAL_MS = parseDuration(SMS_SEND_INTERVAL);
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

            await createSmsRecord({
                intent: "pickup_reminder",
                parcelId: parcel.parcelId,
                householdId: parcel.householdId,
                toE164: parcel.phone,
                text: smsText,
            });

            enqueuedCount++;
            console.log(`[SMS] Enqueued reminder for parcel ${parcel.parcelId}`);
        } catch (error) {
            console.error("[SMS] Failed to enqueue for parcel %s:", parcel.parcelId, error);
        }
    }

    if (enqueuedCount > 0) {
        console.log(`[SMS] Enqueued ${enqueuedCount} reminder messages`);
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
            console.log(`[SMS] 📤 Processing ${records.length} records ready for sending`);
        }

        let sentCount = 0;

        for (const record of records) {
            try {
                await sendSmsRecord(record);
                sentCount++;
                console.log(
                    `[SMS] ✅ Sent: ${record.intent} to household ${record.householdId} (${record.id})`,
                );

                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(
                    `[SMS] ❌ Failed: ${record.intent} to household ${record.householdId} (${record.id}):`,
                    error,
                );
            }
        }

        if (sentCount > 0) {
            console.log(`[SMS] 🎉 Sent ${sentCount} messages`);
        }

        return sentCount;
    });

    if (!result.lockAcquired) {
        console.log("[SMS] ⏸️  Skipped queue processing - already running elsewhere");
    }

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
    console.log(`[Anonymization] 🔄 Starting scheduled anonymization run...`);
    lastAnonymizationRun = new Date();

    try {
        // Parse duration to milliseconds
        const durationMs = parseDuration(ANONYMIZATION_INACTIVE_DURATION);

        console.log(
            `[Anonymization] Threshold: ${ANONYMIZATION_INACTIVE_DURATION} (${durationMs}ms)`,
        );

        const result = await anonymizeInactiveHouseholds(durationMs);

        // Set status based on whether any errors occurred
        // Any failure is critical for GDPR compliance and requires investigation
        if (result.errors.length > 0) {
            console.log(
                `[Anonymization] ⚠️  Completed with errors: ${result.anonymized} anonymized, ${result.errors.length} failed`,
            );
            lastAnonymizationStatus = "error";
            await notifyAnonymizationError(result);
        } else {
            console.log(
                `[Anonymization] ✅ Completed successfully: ${result.anonymized} anonymized`,
            );
            lastAnonymizationStatus = "success";
        }

        return result;
    } catch (error) {
        console.error("[Anonymization] ❌ Failed to run scheduled anonymization:", error);
        lastAnonymizationStatus = "error";

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
        console.log("[Anonymization] Skipping Slack notification (not in production)");
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

        console.log("[Anonymization] ✅ Slack notification sent");
    } catch (error) {
        console.error("[Anonymization] ❌ Failed to send Slack notification:", error);
    }
}

/**
 * Start the unified scheduler
 */
export function startScheduler(): void {
    if (isRunning) {
        console.log("[Scheduler] Already running");
        return;
    }

    const isFirstStartup = !hasEverStarted;
    isRunning = true;
    hasEverStarted = true;

    const testMode = getHelloSmsConfig().testMode;

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[Scheduler] 🚀 Starting unified background scheduler");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // SMS Configuration
    console.log(`[SMS] Test Mode: ${testMode ? "ENABLED (no real SMS)" : "DISABLED (live SMS)"}`);
    console.log(`[SMS] Enqueue Interval: ${SMS_ENQUEUE_INTERVAL_MS / 60000} minutes`);
    console.log(`[SMS] Send Interval: ${SMS_SEND_INTERVAL}`);

    // Anonymization Configuration
    console.log(`[Anonymization] Schedule: ${ANONYMIZATION_SCHEDULE}`);
    console.log(`[Anonymization] Inactive Duration: ${ANONYMIZATION_INACTIVE_DURATION}`);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Start SMS enqueue loop
    smsEnqueueInterval = setInterval(async () => {
        try {
            await enqueueReminderSms();
        } catch (error) {
            console.error("[SMS] Error in enqueue loop:", error);
        }
    }, SMS_ENQUEUE_INTERVAL_MS);

    // Start SMS send loop (kept separate for backward compatibility)
    smsSendInterval = setInterval(async () => {
        try {
            await processSendQueue();
        } catch (error) {
            console.error("[SMS] Error in send loop:", error);
        }
    }, SMS_SEND_INTERVAL_MS);

    // Start anonymization cron job
    try {
        anonymizationTask = cron.schedule(ANONYMIZATION_SCHEDULE, async () => {
            await runAnonymizationSchedule();
        });
        console.log(`[Anonymization] ✅ Cron job scheduled: ${ANONYMIZATION_SCHEDULE}`);
    } catch (error) {
        console.error(
            `[Anonymization] ❌ Failed to schedule cron job (invalid schedule: "${ANONYMIZATION_SCHEDULE}"):`,
            error,
        );
        console.error(
            `[Anonymization] ⚠️  Health checks will report UNHEALTHY until cron is fixed!`,
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
                    console.error(
                        "[Anonymization] ❌ Failed to send Slack alert about cron error:",
                        notifyError,
                    );
                });
        }
    }

    // Start health check loop
    healthCheckInterval = setInterval(async () => {
        const now = Date.now();
        // Only log every 12 hours to reduce noise
        if (now - lastHealthLog > HEALTH_CHECK_INTERVAL_MS) {
            try {
                const health = await schedulerHealthCheck();
                if (health.status === "healthy") {
                    console.log(
                        `[Scheduler] ❤️  Alive - SMS: ${health.details.smsSchedulerRunning ? "✓" : "✗"}, ` +
                            `Anonymization: ${health.details.anonymizationSchedulerRunning ? "✓" : "✗"}`,
                    );
                } else {
                    console.error(`[Scheduler] 💔 Unhealthy:`, health.details);
                }
                lastHealthLog = now;
            } catch (error) {
                console.error("[Scheduler] ❌ Health check failed:", error);
            }
        }
    }, HEALTH_CHECK_INTERVAL_MS);

    // Run SMS tasks once immediately
    enqueueReminderSms().catch(console.error);
    processSendQueue().catch(console.error);

    console.log("[Scheduler] ✅ Started successfully");

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
                    console.log("[Scheduler] ✅ Slack startup notification sent");
                } else {
                    console.warn("[Scheduler] ⚠️  Failed to send Slack startup notification");
                }
            })
            .catch(error => {
                console.error("[Scheduler] ❌ Error sending Slack notification:", error);
            });
    }
}

/**
 * Stop the unified scheduler
 */
export function stopScheduler(): void {
    if (!isRunning) {
        console.log("[Scheduler] Not running");
        return;
    }

    isRunning = false;

    if (smsEnqueueInterval) {
        clearInterval(smsEnqueueInterval);
        smsEnqueueInterval = null;
    }

    if (smsSendInterval) {
        clearInterval(smsSendInterval);
        smsSendInterval = null;
    }

    if (anonymizationTask) {
        anonymizationTask.stop();
        anonymizationTask = null;
    }

    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
    }

    console.log("[Scheduler] Stopped");
}

/**
 * Check if scheduler is running
 */
export function isSchedulerRunning(): boolean {
    return isRunning;
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
        const anonymizationSchedulerRunning = anonymizationTask !== null;
        const isHealthy = isRunning && anonymizationSchedulerRunning;

        return {
            status: isHealthy ? "healthy" : "unhealthy",
            details: {
                schedulerRunning: isRunning,
                smsSchedulerRunning: smsEnqueueInterval !== null && smsSendInterval !== null,
                anonymizationSchedulerRunning,
                smsTestMode: getHelloSmsConfig().testMode,
                smsPendingCount: pendingCount.length,
                lastAnonymizationRun: lastAnonymizationRun?.toISOString() || "Never",
                lastAnonymizationStatus,
                timestamp: new Date().toISOString(),
                ...((!isRunning || !anonymizationSchedulerRunning) && {
                    healthCheckFailure: !isRunning
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
