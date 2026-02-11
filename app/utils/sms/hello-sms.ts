/**
 * HelloSMS integration utility for sending SMS messages
 * Supports test mode for development/testing
 *
 * Callback URL for delivery status updates must be configured
 * by contacting HelloSMS support (not per-request).
 */
import { SMS_SENDER_NAME } from "@/app/config/branding";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { logger, logError } from "@/app/utils/logger";

export interface HelloSmsConfig {
    apiUrl: string;
    username: string;
    password: string;
    testMode: boolean;
    from?: string; // Optional sender name/number
}

// Import and re-export types from sms-gateway.ts to maintain backwards compatibility
// and ensure type consistency across the SMS module
import type { SendSmsRequest, SendSmsResponse } from "./sms-gateway";
export type { SendSmsRequest, SendSmsResponse };

export interface HelloSmsApiResponse {
    status?: string;
    statusText?: string;
    messageIds?: Array<{
        apiMessageId: string;
        to: string;
        status: number;
        message: string;
    }>;
}

// Cache configuration to prevent duplicate logging
let cachedConfig: HelloSmsConfig | null = null;
let hasLoggedConfig = false;

const isProduction = process.env.NODE_ENV === "production";
const isServer = typeof window === "undefined";
const isBuildPhase = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;

// Environment configuration
export function getHelloSmsConfig(): HelloSmsConfig {
    // Return cached config if available
    if (cachedConfig) {
        return cachedConfig;
    }

    // Check HELLO_SMS_TEST_MODE first - if explicitly set, always use that value
    const rawTestModeValue = process.env["HELLO_SMS_TEST_MODE"];
    const normalizedTestModeValue =
        typeof rawTestModeValue === "string" ? rawTestModeValue.trim().toLowerCase() : undefined;
    let testMode: boolean;

    if (normalizedTestModeValue) {
        // If explicitly set, use that value (this takes precedence over NODE_ENV)
        testMode = ["true", "1", "yes", "on"].includes(normalizedTestModeValue);
        if (!hasLoggedConfig) {
            logger.info(
                { testMode, rawValue: rawTestModeValue },
                "SMS Test Mode explicitly configured",
            );
            hasLoggedConfig = true;
        }
    } else {
        // If not set, default based on NODE_ENV (safer default)
        testMode = process.env.NODE_ENV !== "production";
        if (!hasLoggedConfig) {
            logger.info(
                { testMode, nodeEnv: process.env.NODE_ENV },
                "SMS Test Mode defaulted based on NODE_ENV",
            );
            hasLoggedConfig = true;
        }
    }

    cachedConfig = {
        apiUrl: process.env.HELLO_SMS_API_URL || "https://api.hellosms.se/api/v1/sms/send",
        username: process.env.HELLO_SMS_USERNAME || "",
        password: process.env.HELLO_SMS_PASSWORD || "",
        testMode,
        from: SMS_SENDER_NAME,
    };

    return cachedConfig;
}

// Validate SMS configuration at server startup in production (not during build)
if (isProduction && isServer && !isBuildPhase) {
    const config = getHelloSmsConfig();

    if (config.testMode) {
        // Test mode doesn't require credentials - log warning and continue
        logger.warn("SMS TEST MODE ENABLED IN PRODUCTION - No actual SMS messages will be sent");
    } else {
        // Live mode - credentials are mandatory
        if (!config.username || !config.password) {
            logger.fatal(
                "SMS Configuration Error: HELLO_SMS_USERNAME and HELLO_SMS_PASSWORD must be set for live SMS",
            );
            process.exit(1); // Kill the server immediately
        }
        logger.info("SMS configuration validated (live mode)");
    }
}

// Phone number validation and normalization to E.164 format
export function normalizePhoneToE164(phone: string, defaultCountryCode = "+46"): string {
    // Remove all non-digit characters
    const digitsOnly = phone.replace(/\D/g, "");

    // Handle Swedish numbers specifically
    if (defaultCountryCode === "+46") {
        // If starts with 0, replace with +46
        if (digitsOnly.startsWith("0")) {
            return "+46" + digitsOnly.substring(1);
        }
        // If starts with 46, add +
        if (digitsOnly.startsWith("46")) {
            return "+" + digitsOnly;
        }
        // If no country code, assume Swedish
        if (digitsOnly.length >= 8 && digitsOnly.length <= 10) {
            return "+46" + digitsOnly;
        }
    }

    // For other formats, add default country code if needed
    if (!digitsOnly.startsWith(defaultCountryCode.replace("+", ""))) {
        return defaultCountryCode + digitsOnly;
    }

    return "+" + digitsOnly;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getTestModeResponse(_request: SendSmsRequest): SendSmsResponse {
    // Success response with fake message ID
    return {
        success: true,
        messageId: `test_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    };
}

// Global flag to track if config has been logged
let configLogged = false;

// Main SMS sending function
export async function sendSms(request: SendSmsRequest): Promise<SendSmsResponse> {
    const config = getHelloSmsConfig();

    // Log config only once at startup, not per SMS
    if (!configLogged) {
        logger.info(
            {
                apiUrl: config.apiUrl,
                username: config.username ? "configured" : "missing",
                testMode: config.testMode,
                from: config.from,
            },
            "SMS configuration loaded",
        );
        configLogged = true;
    }

    // Normalize phone number (no logging needed)
    const normalizedTo = normalizePhoneToE164(request.to);

    // Handle test mode (returns fake success without calling API)
    if (config.testMode) {
        return getTestModeResponse(request);
    }

    // Validate credentials for live SMS
    // (Production startup validation already checked this, but double-check for safety)
    if (!config.username || !config.password) {
        logError("HelloSMS credentials not configured", new Error("Missing credentials"));
        return {
            success: false,
            error: "HelloSMS credentials not configured",
        };
    }

    try {
        // Prepare HelloSMS API request
        // Note: Callback URL is configured at account level with HelloSMS support
        const body = {
            to: normalizedTo,
            message: request.text,
            from: request.from || config.from,
            sendApiCallback: true,
        };

        const response = await fetch(config.apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
            },
            body: JSON.stringify(body),
        });

        const responseData = (await response.json()) as HelloSmsApiResponse;

        if (response.ok && responseData.status === "success") {
            const firstRecipient = responseData.messageIds?.[0];
            const messageId = firstRecipient?.apiMessageId || "unknown";

            // Check per-recipient status for immediate rejection errors
            // Status codes: 0 = pending/queued, 1 = sent, >= 2 typically indicates failure
            // This catches cases where API returns success but recipient is rejected
            // (e.g., invalid phone format, blocked number)
            if (firstRecipient && firstRecipient.status >= 2) {
                const errorMsg =
                    firstRecipient.message ||
                    `Recipient rejected (status: ${firstRecipient.status})`;
                logger.warn(
                    {
                        to: normalizedTo,
                        recipientStatus: firstRecipient.status,
                        message: firstRecipient.message,
                    },
                    "SMS recipient rejected by provider",
                );
                return {
                    success: false,
                    error: errorMsg,
                    messageId: messageId, // Include message ID for tracking even on failure
                    httpStatus: 400, // Permanent failure - don't retry
                };
            }

            return {
                success: true,
                messageId: messageId,
            };
        } else {
            const errorMsg = responseData.statusText || `HTTP ${response.status}`;
            return {
                success: false,
                error: errorMsg,
                httpStatus: response.status,
            };
        }
    } catch (error) {
        // Network/DNS/timeout errors should be treated as retriable (503 Service Unavailable)
        // This ensures transient network issues don't cause permanent SMS failures
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            httpStatus: 503,
        };
    }
}

// Validate E.164 phone number format
export function isValidE164(phone: string): boolean {
    return /^\+[1-9]\d{1,14}$/.test(phone);
}

/**
 * HTTP status code returned by HelloSMS when account has insufficient credits.
 * This is the standard HTTP 402 Payment Required status.
 */
export const HTTP_INSUFFICIENT_CREDITS = 402;

/**
 * Check if an SMS send failure was caused by insufficient account balance.
 * Only checks HTTP 402 status — the primary detection is the pre-batch
 * balance check via checkBalance(). This is a safety net for per-send failures.
 */
export function isInsufficientBalanceError(httpStatus?: number): boolean {
    return httpStatus === HTTP_INSUFFICIENT_CREDITS;
}

// Re-export BalanceResult from sms-gateway.ts for backwards compatibility
import type { BalanceResult } from "./sms-gateway";
export type { BalanceResult };

/**
 * Check the current SMS credit balance from HelloSMS.
 *
 * GET https://api.hellosms.se/api/v1/account/balance
 * Returns { credits: number }
 */
export async function checkBalance(): Promise<BalanceResult> {
    const config = getHelloSmsConfig();

    if (config.testMode) {
        // In test mode, report unlimited credits
        return { success: true, credits: 999 };
    }

    if (!config.username || !config.password) {
        return { success: false, error: "HelloSMS credentials not configured" };
    }

    // Derive the balance URL from the configured API URL
    // Default send URL: https://api.hellosms.se/api/v1/sms/send
    // Balance URL:      https://api.hellosms.se/api/v1/account/balance
    const baseUrl = config.apiUrl.replace(/\/sms\/send\/?$/, "");
    const balanceUrl = `${baseUrl}/account/balance`;

    try {
        const response = await fetch(balanceUrl, {
            method: "GET",
            headers: {
                "Authorization": `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
            },
        });

        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            const statusText = (body as { statusText?: string }).statusText || `HTTP ${response.status}`;
            return { success: false, error: statusText };
        }

        const data = (await response.json()) as { credits?: unknown };
        // Validate credits is actually a number — if not, treat as check failure (fail-open)
        if (typeof data.credits === "number") {
            return { success: true, credits: data.credits };
        }
        return { success: false, error: "Invalid balance response: missing credits field" };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error checking balance",
        };
    }
}
