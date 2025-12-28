/**
 * Slack notification utility for production alerts
 * Based on the backup service implementation with AWS-style state tracking
 */

import { logger, logError } from "@/app/utils/logger";

// AWS-style state tracking: only alert on state transitions
type HealthState = "OK" | "ALARM";
const serviceStates = new Map<string, HealthState>();

// Fallback rate limiting (backup protection against bugs)
const alertCooldowns = new Map<string, number>();
const EMERGENCY_COOLDOWN_MINUTES = 5; // Emergency protection against spam

interface SlackMessage {
    title: string;
    message: string;
    status: "success" | "warning" | "error";
    details?: Record<string, string>;
}

interface SlackConfig {
    botToken: string;
    channelId: string;
}

/**
 * Check if service state has changed and update tracking
 * Returns true if we should send an alert (state transition occurred)
 */
function checkStateTransition(
    serviceKey: string,
    isHealthy: boolean,
): {
    shouldAlert: boolean;
    isRecovery: boolean;
} {
    const currentState: HealthState = isHealthy ? "OK" : "ALARM";
    const lastState = serviceStates.get(serviceKey);

    // Update state tracking
    serviceStates.set(serviceKey, currentState);

    // No previous state recorded = treat as initial state (alert if unhealthy)
    if (!lastState) {
        return {
            shouldAlert: !isHealthy, // Alert if starting in unhealthy state
            isRecovery: false,
        };
    }

    // Check for state transitions
    const stateChanged = lastState !== currentState;
    const isRecovery = lastState === "ALARM" && currentState === "OK";

    return {
        shouldAlert: stateChanged, // Only alert on state changes
        isRecovery,
    };
}

/**
 * Emergency rate limiting (backup protection against bugs)
 */
function emergencyRateLimit(alertType: string): boolean {
    const now = Date.now();
    const lastSent = alertCooldowns.get(alertType);

    if (!lastSent || now - lastSent > EMERGENCY_COOLDOWN_MINUTES * 60 * 1000) {
        alertCooldowns.set(alertType, now);
        return true;
    }

    logger.warn({ alertType }, "Emergency rate limit hit - possible bug in state tracking");
    return false;
}

/**
 * Get Slack configuration from environment variables
 */
function getSlackConfig(): SlackConfig | null {
    const botToken = process.env.SLACK_BOT_TOKEN;
    const channelId = process.env.SLACK_CHANNEL_ID;

    if (!botToken || !channelId) {
        return null;
    }

    return { botToken, channelId };
}

/**
 * Send notification to Slack (production only)
 */
export async function sendSlackAlert(message: SlackMessage): Promise<boolean> {
    // Only send in production environment (not staging or development)
    // ENV_NAME is set by deploy scripts to distinguish staging from production
    const envName = process.env.ENV_NAME || process.env.NODE_ENV;
    if (envName !== "production") {
        logger.info(
            { env: envName || "dev", status: message.status, title: message.title },
            "Slack alert (non-production mode)",
        );
        return true;
    }

    const config = getSlackConfig();
    if (!config) {
        logger.warn("Slack configuration missing (SLACK_BOT_TOKEN or SLACK_CHANNEL_ID)");
        return false;
    }

    try {
        const emoji =
            message.status === "success" ? "✅" : message.status === "warning" ? "⚠️" : "❌";
        const timestamp = new Date().toISOString();
        const host = process.env.HOSTNAME || "unknown";

        // Create blocks for better formatting
        const blocks: Array<Record<string, unknown>> = [
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*[matkassen]* ${emoji} ${message.title}`,
                },
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: message.message,
                },
            },
        ];

        // Add details if provided
        if (message.details && Object.keys(message.details).length > 0) {
            const fields = Object.entries(message.details).map(([key, value]) => ({
                type: "mrkdwn",
                text: `*${key}*\n${value}`,
            }));

            // Add timestamp and host
            fields.push(
                {
                    type: "mrkdwn",
                    text: `*Timestamp*\n${timestamp}`,
                },
                {
                    type: "mrkdwn",
                    text: `*Host*\n${host}`,
                },
            );

            blocks.push({
                type: "section",
                fields: fields,
            });
        }

        const payload = {
            channel: config.channelId,
            text: `[matkassen] ${message.title}`, // Fallback text
            blocks: blocks,
        };

        const response = await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${config.botToken}`,
                "Content-Type": "application/json; charset=utf-8",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            logError(
                "Slack API error",
                new Error(`HTTP ${response.status}: ${response.statusText}`),
            );
            return false;
        }

        const result = await response.json();

        if (result.ok) {
            logger.debug("Slack alert sent successfully");
            return true;
        } else {
            logError("Failed to send Slack alert", new Error(result.error));
            return false;
        }
    } catch (error) {
        logError("Exception sending Slack alert", error);
        return false;
    }
}

/**
 * Send SMS service health alert
 */
export async function sendSmsHealthAlert(
    isHealthy: boolean,
    details: Record<string, unknown>,
): Promise<void> {
    const stateTransition = checkStateTransition("sms-service", isHealthy);

    if (!stateTransition.shouldAlert) {
        // No state change = no alert needed
        return;
    }

    // Emergency rate limiting (backup protection)
    if (!emergencyRateLimit("sms-health")) {
        return;
    }

    const message: SlackMessage = {
        title: stateTransition.isRecovery ? "SMS Service Recovered" : "SMS Service Health Alert",
        message: stateTransition.isRecovery
            ? "SMS service has recovered and is now functioning normally"
            : "SMS service is experiencing issues and may not be sending notifications",
        status: stateTransition.isRecovery ? "success" : "error",
        details: stateTransition.isRecovery
            ? {
                  Service: "SMS Notifications",
                  Status: "Healthy - Recovered",
              }
            : {
                  "Service": "SMS Notifications",
                  "Status": "Unhealthy",
                  "Scheduler Running": String(details.schedulerRunning ?? "unknown"),
                  "Test Mode": String(details.smsTestMode ?? "unknown"),
                  "Error": String(details.error ?? "Database connectivity issue"),
              },
    };

    await sendSlackAlert(message);
}

/**
 * Send database health alert
 */
export async function sendDatabaseHealthAlert(isHealthy: boolean, error?: string): Promise<void> {
    const stateTransition = checkStateTransition("database", isHealthy);

    if (!stateTransition.shouldAlert) {
        // No state change = no alert needed
        return;
    }

    // Emergency rate limiting (backup protection)
    if (!emergencyRateLimit("database-health")) {
        return;
    }

    const message: SlackMessage = {
        title: stateTransition.isRecovery ? "Database Service Recovered" : "Database Health Alert",
        message: stateTransition.isRecovery
            ? "Database connection has recovered and is now functioning normally"
            : "Primary database connection failed - service may be degraded",
        status: stateTransition.isRecovery ? "success" : "error",
        details: stateTransition.isRecovery
            ? {
                  Service: "PostgreSQL Database",
                  Status: "Connected - Recovered",
              }
            : {
                  Service: "PostgreSQL Database",
                  Status: "Connection Failed",
                  ...(error && { Error: error }),
              },
    };

    await sendSlackAlert(message);
}

/**
 * Send disk space health alert
 */
export async function sendDiskSpaceHealthAlert(isHealthy: boolean): Promise<void> {
    const stateTransition = checkStateTransition("disk-space", isHealthy);

    if (!stateTransition.shouldAlert) {
        // No state change = no alert needed
        return;
    }

    // Emergency rate limiting (backup protection)
    if (!emergencyRateLimit("disk-space-health")) {
        return;
    }

    const message: SlackMessage = {
        title: stateTransition.isRecovery ? "Disk Space Recovered" : "Disk Space Alert",
        message: stateTransition.isRecovery
            ? "File system has recovered and can write files normally"
            : "Server file system may be full or have permission issues",
        status: stateTransition.isRecovery ? "success" : "warning",
        details: stateTransition.isRecovery
            ? {
                  "Service": "File System",
                  "Status": "Healthy - Recovered",
                  "Write Test": "Successful",
              }
            : {
                  Service: "File System",
                  Status: "Write Failed",
                  Issue: "Cannot write temporary files",
                  Recommendation: "Check disk space and permissions",
              },
    };

    await sendSlackAlert(message);
}

/**
 * SMS health statistics for daily report
 */
export interface SmsHealthStats {
    sent: number;
    delivered: number;
    providerFailed: number;
    notDelivered: number;
    awaiting: number;
    internalFailed: number;
    staleUnconfirmed: number;
    hasIssues: boolean;
}

/**
 * Send daily SMS health report to Slack
 *
 * Only sends if there are issues (failures, stale unconfirmed, etc.)
 * This is NOT state-transition based - it's a daily summary report.
 */
export async function sendSmsHealthReport(stats: SmsHealthStats): Promise<boolean> {
    // Only send if there are issues
    if (!stats.hasIssues) {
        logger.debug("SMS health report skipped - no issues to report");
        return true;
    }

    // Build the message body
    const lines = [
        `*Sent:* ${stats.sent}`,
        `├─ Delivered: ${stats.delivered}`,
        `├─ Provider Failed: ${stats.providerFailed}`,
        `├─ Not Delivered: ${stats.notDelivered}`,
        `└─ Awaiting: ${stats.awaiting}`,
        "",
        `*Internal Failures:* ${stats.internalFailed}`,
        `*Stale (>24h unconfirmed):* ${stats.staleUnconfirmed}`,
    ];

    // Add actionable link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://matcentralen.com";
    lines.push("", `→ <${appUrl}/sms-failures|Review SMS Failures>`);

    const message: SlackMessage = {
        title: "⚠️ SMS Health Report (Last 24h)",
        message: lines.join("\n"),
        status: "warning",
        details: {
            "Sent": stats.sent.toString(),
            "Delivered": stats.delivered.toString(),
            "Provider Failed": stats.providerFailed.toString(),
            "Not Delivered": stats.notDelivered.toString(),
            "Internal Failed": stats.internalFailed.toString(),
            "Stale Unconfirmed": stats.staleUnconfirmed.toString(),
        },
    };

    return sendSlackAlert(message);
}
