/**
 * Unified Scheduler for Background Tasks
 * Handles both SMS scheduling and household anonymization
 */

import cron, { type ScheduledTask } from "node-cron";
import {
    processRemindersJIT,
    processFoodParcelsEndedJIT,
    getSmsRecordsReadyForSending,
    sendSmsRecord,
    processQueuedSms,
    getSmsHealthStats,
    checkBalanceBeforeBatch,
} from "@/app/utils/sms/sms-service";
import { getHelloSmsConfig } from "@/app/utils/sms/hello-sms";
import { parseDuration } from "@/app/utils/duration-parser";
import { anonymizeInactiveHouseholds } from "@/app/utils/anonymization/anonymize-household";
import { logger, logError, logCron } from "@/app/utils/logger";

type SchedulerState = {
    isRunning: boolean;
    smsInterval: NodeJS.Timeout | null; // Single interval for pure JIT
    anonymizationTask: ScheduledTask | null;
    smsReportTask: ScheduledTask | null; // Daily SMS health report
    healthCheckInterval: NodeJS.Timeout | null;
    lastHealthLog: number;
    hasEverStarted: boolean;
    lastAnonymizationRun: Date | null;
    lastAnonymizationStatus: "success" | "error" | null;
    lastSmsReportRun: Date | null;
    lastSmsReportStatus: "success" | "skipped" | "error" | null;
    smsProcessingInFlight: boolean; // Prevents concurrent SMS processing
};

const GLOBAL_STATE_KEY = "__matkassenSchedulerState";

function getSchedulerState(): SchedulerState {
    const globalObj = globalThis as typeof globalThis & {
        __matkassenSchedulerState?: SchedulerState;
    };

    if (!globalObj[GLOBAL_STATE_KEY]) {
        globalObj[GLOBAL_STATE_KEY] = {
            isRunning: false,
            smsInterval: null,
            anonymizationTask: null,
            smsReportTask: null,
            healthCheckInterval: null,
            lastHealthLog: 0,
            hasEverStarted: false,
            lastAnonymizationRun: null,
            lastAnonymizationStatus: null,
            lastSmsReportRun: null,
            lastSmsReportStatus: null,
            smsProcessingInFlight: false,
        };
    }

    return globalObj[GLOBAL_STATE_KEY]!;
}

const schedulerState = getSchedulerState();

// SMS Configuration - Pure JIT uses single interval
const SMS_INTERVAL = process.env.SMS_SEND_INTERVAL || "5 minutes";

// Validate SMS interval with descriptive error
let SMS_INTERVAL_MS: number;
try {
    SMS_INTERVAL_MS = parseDuration(SMS_INTERVAL);
    logger.info(
        { smsInterval: SMS_INTERVAL, intervalMs: SMS_INTERVAL_MS },
        "SMS interval configured",
    );
} catch (error) {
    throw new Error(
        `Invalid SMS_SEND_INTERVAL environment variable: "${SMS_INTERVAL}". ` +
            `Expected format: "5 minutes", "30s", "2h", etc. ` +
            `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
}

const HEALTH_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Anonymization Configuration (from env vars)
const ANONYMIZATION_SCHEDULE = process.env.ANONYMIZATION_SCHEDULE || "0 2 * * 0"; // Sunday 2 AM
const ANONYMIZATION_INACTIVE_DURATION = process.env.ANONYMIZATION_INACTIVE_DURATION || "1 year";

// SMS Health Report Configuration (from env vars)
// Default: 8:00 AM daily in Stockholm timezone
const SMS_REPORT_SCHEDULE = process.env.SMS_REPORT_SCHEDULE || "0 8 * * *";

// Timezone for all cron jobs - ensures consistent scheduling regardless of server timezone
const CRON_TIMEZONE = "Europe/Stockholm";

const SMS_SEND_BATCH_SIZE = 5;

/**
 * Process SMS: Pure JIT for reminders + ended notifications + queued SMS for other intents
 *
 * 1. Pure JIT for pickup_reminder: find parcels → render → send → create record
 * 2. Pure JIT for food_parcels_ended: find households → render → send → create record
 * 3. Send loop for other intents: process queued SMS (enrollment, etc.)
 */
async function processSmsJIT(): Promise<{ processed: number }> {
    // Pre-batch balance check: skip entire batch if balance is known to be zero
    const shouldProceed = await checkBalanceBeforeBatch();
    if (!shouldProceed) return { processed: 0 };

    // Process pickup reminders using pure JIT
    const jitResult = await processRemindersJIT();

    // Process "food parcels ended" notifications using pure JIT
    const endedResult = await processFoodParcelsEndedJIT();

    // Also process any queued SMS (enrollment, etc.)
    const queueResult = await processQueuedSms(async () => {
        const records = await getSmsRecordsReadyForSending(SMS_SEND_BATCH_SIZE);

        let sentCount = 0;
        for (const record of records) {
            try {
                const wasSent = await sendSmsRecord(record);
                if (wasSent) {
                    sentCount++;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                logError("Failed to send queued SMS", error, {
                    intent: record.intent,
                    householdId: record.householdId,
                    smsId: record.id,
                });
            }
        }
        return sentCount;
    });

    return {
        processed: jitResult.processed + endedResult.processed + queueResult,
    };
}

/**
 * Process SMS with concurrency guard.
 * Prevents overlapping executions from interval and manual triggers.
 */
async function processSmsJITWithLock(): Promise<{ processed: number; skipped: boolean }> {
    if (schedulerState.smsProcessingInFlight) {
        logger.debug("SMS processing already in flight, skipping this run");
        return { processed: 0, skipped: true };
    }

    schedulerState.smsProcessingInFlight = true;
    try {
        const result = await processSmsJIT();
        return { ...result, skipped: false };
    } finally {
        schedulerState.smsProcessingInFlight = false;
    }
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
 * Run SMS health report
 * Collects SMS delivery statistics and sends to Slack if there are issues
 */
async function runSmsHealthReport(): Promise<{
    sent: boolean;
    hasIssues: boolean;
}> {
    logCron("sms-health-report", "started", {});
    schedulerState.lastSmsReportRun = new Date();

    try {
        const stats = await getSmsHealthStats();

        if (!stats.hasIssues) {
            logCron("sms-health-report", "completed", { skipped: true, reason: "no issues" });
            schedulerState.lastSmsReportStatus = "skipped";
            return { sent: false, hasIssues: false };
        }

        // Send to Slack (only in production)
        if (process.env.NODE_ENV === "production") {
            const { sendSmsHealthReport } = await import("@/app/utils/notifications/slack");
            const sent = await sendSmsHealthReport(stats);

            if (sent) {
                logCron("sms-health-report", "completed", { sent: true, stats });
                schedulerState.lastSmsReportStatus = "success";
            } else {
                logCron("sms-health-report", "failed", { reason: "Slack send failed" });
                schedulerState.lastSmsReportStatus = "error";
            }

            return { sent, hasIssues: true };
        } else {
            // Non-production: just log
            logger.info({ stats }, "SMS health report (non-production mode)");
            schedulerState.lastSmsReportStatus = "success";
            return { sent: false, hasIssues: true };
        }
    } catch (error) {
        logError("Failed to run SMS health report", error);
        schedulerState.lastSmsReportStatus = "error";
        return { sent: false, hasIssues: false };
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
            smsInterval: SMS_INTERVAL,
            anonymizationSchedule: ANONYMIZATION_SCHEDULE,
            anonymizationInactiveDuration: ANONYMIZATION_INACTIVE_DURATION,
        },
        "Starting unified background scheduler (pure JIT SMS)",
    );

    // Start SMS loop (pure JIT: find parcels → render → send → create record)
    // Uses lock to prevent overlapping runs
    schedulerState.smsInterval = setInterval(async () => {
        try {
            await processSmsJITWithLock();
        } catch (error) {
            logError("Error in SMS JIT loop", error);
        }
    }, SMS_INTERVAL_MS);

    // Start anonymization cron job
    try {
        schedulerState.anonymizationTask = cron.schedule(
            ANONYMIZATION_SCHEDULE,
            async () => {
                await runAnonymizationSchedule();
            },
            { timezone: CRON_TIMEZONE },
        );
        logger.info(
            { schedule: ANONYMIZATION_SCHEDULE, timezone: CRON_TIMEZONE },
            "Anonymization cron job scheduled",
        );
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

    // Start SMS health report cron job (daily)
    try {
        schedulerState.smsReportTask = cron.schedule(
            SMS_REPORT_SCHEDULE,
            async () => {
                await runSmsHealthReport();
            },
            { timezone: CRON_TIMEZONE },
        );
        logger.info(
            { schedule: SMS_REPORT_SCHEDULE, timezone: CRON_TIMEZONE },
            "SMS health report cron job scheduled",
        );
    } catch (error) {
        logError(
            "Failed to schedule SMS health report cron job - invalid schedule format.",
            error,
            {
                invalidSchedule: SMS_REPORT_SCHEDULE,
                expectedFormat: "Cron syntax (e.g., '0 8 * * *' for 8 AM daily)",
            },
        );
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

    // Run SMS JIT once immediately on startup (uses lock)
    processSmsJITWithLock().catch(err => logError("Error in immediate SMS JIT", err));

    logger.debug("Scheduler started successfully (pure JIT SMS)");

    // Send Slack notification on startup (production only, first startup)
    if (process.env.NODE_ENV === "production" && isFirstStartup) {
        import("@/app/utils/notifications/slack")
            .then(({ sendSlackAlert }) => {
                return sendSlackAlert({
                    title: "🚀 Scheduler Started",
                    message: "Unified background scheduler started successfully (pure JIT SMS)",
                    status: "success",
                    details: {
                        "SMS Test Mode": testMode ? "Enabled (no real SMS)" : "Disabled (live SMS)",
                        "SMS Interval": SMS_INTERVAL,
                        "Anonymization Schedule": ANONYMIZATION_SCHEDULE,
                        "Anonymization Duration": ANONYMIZATION_INACTIVE_DURATION,
                        "SMS Report Schedule": SMS_REPORT_SCHEDULE,
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

    if (schedulerState.smsInterval) {
        clearInterval(schedulerState.smsInterval);
        schedulerState.smsInterval = null;
    }

    if (schedulerState.anonymizationTask) {
        schedulerState.anonymizationTask.stop();
        schedulerState.anonymizationTask = null;
    }

    if (schedulerState.smsReportTask) {
        schedulerState.smsReportTask.stop();
        schedulerState.smsReportTask = null;
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
        // CRITICAL: If anonymization cron failed to start, treat as unhealthy
        // This catches invalid ANONYMIZATION_SCHEDULE env var before Slack alerts fail
        const anonymizationSchedulerRunning = schedulerState.anonymizationTask !== null;
        const smsReportSchedulerRunning = schedulerState.smsReportTask !== null;
        // SMS report is not critical for health - it's just a reporting task, so we
        // expose smsReportSchedulerRunning in details for observability but do not
        // include it in the health determination.
        const isHealthy = schedulerState.isRunning && anonymizationSchedulerRunning;

        return {
            status: isHealthy ? "healthy" : "unhealthy",
            details: {
                schedulerRunning: schedulerState.isRunning,
                smsSchedulerRunning: schedulerState.smsInterval !== null,
                anonymizationSchedulerRunning,
                smsReportSchedulerRunning,
                smsTestMode: getHelloSmsConfig().testMode,
                lastAnonymizationRun: schedulerState.lastAnonymizationRun?.toISOString() || "Never",
                lastAnonymizationStatus: schedulerState.lastAnonymizationStatus,
                lastSmsReportRun: schedulerState.lastSmsReportRun?.toISOString() || "Never",
                lastSmsReportStatus: schedulerState.lastSmsReportStatus,
                // Configuration visibility for debugging
                anonymizationSchedule: ANONYMIZATION_SCHEDULE,
                anonymizationInactiveDuration: ANONYMIZATION_INACTIVE_DURATION,
                smsReportSchedule: SMS_REPORT_SCHEDULE,
                smsInterval: SMS_INTERVAL,
                smsMode: "pure JIT",
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
 * Manual trigger for SMS processing (for testing/admin)
 *
 * Processes both:
 * - Pure JIT reminders: finds eligible parcels → renders → sends → creates records
 * - Queued SMS: enrollment and other queued intents
 *
 * Uses concurrency lock to prevent overlapping runs with scheduled interval.
 */
export async function triggerSmsJIT(): Promise<{
    success: boolean;
    processedCount?: number;
    skipped?: boolean;
    error?: string;
}> {
    try {
        // Process both JIT reminders and queued SMS (same as scheduler interval)
        // Uses lock to prevent concurrent execution
        const result = await processSmsJITWithLock();
        return {
            success: true,
            processedCount: result.processed,
            skipped: result.skipped,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
