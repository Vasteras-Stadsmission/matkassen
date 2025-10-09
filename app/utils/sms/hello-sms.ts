/**
 * HelloSMS integration utility for sending SMS messages
 * Supports test mode for development/testing
 */
import { SMS_SENDER_NAME } from "@/app/config/branding";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

export interface HelloSmsConfig {
    apiUrl: string;
    username: string;
    password: string;
    testMode: boolean;
    from?: string; // Optional sender name/number
}

export interface SendSmsRequest {
    to: string; // E.164 format phone number
    text: string;
    from?: string;
}

export interface SendSmsResponse {
    success: boolean;
    messageId?: string;
    error?: string;
    httpStatus?: number;
}

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
            console.log(
                `🔧 SMS Test Mode explicitly set to: ${testMode} (HELLO_SMS_TEST_MODE="${rawTestModeValue}")`,
            );
            hasLoggedConfig = true;
        }
    } else {
        // If not set, default based on NODE_ENV (safer default)
        testMode = process.env.NODE_ENV !== "production";
        if (!hasLoggedConfig) {
            console.log(
                `🔧 SMS Test Mode defaulted to: ${testMode} (NODE_ENV="${process.env.NODE_ENV}")`,
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
// This ensures credentials are configured even when test mode is enabled
if (isProduction && isServer && !isBuildPhase) {
    const config = getHelloSmsConfig();

    // CRITICAL: Always validate credentials in production, even in test mode
    // This prevents silent misconfiguration and maintains fail-fast behavior
    if (!config.username || !config.password) {
        console.error("\n❌ SMS Configuration Error:");
        console.error("   HELLO_SMS_USERNAME and HELLO_SMS_PASSWORD must be set in production");
        console.error("   (Required even when HELLO_SMS_TEST_MODE=true)");
        console.error("\nThe application cannot start without proper SMS configuration.\n");
        process.exit(1); // Kill the server immediately
    }

    // Warn loudly if test mode is enabled in production
    if (config.testMode) {
        console.warn("\n⚠️  WARNING: SMS TEST MODE ENABLED IN PRODUCTION");
        console.warn("   No actual SMS messages will be sent!");
        console.warn("   All SMS operations will return fake success responses.");
        console.warn("   Set HELLO_SMS_TEST_MODE=false when ready for live SMS.\n");
    } else {
        console.log("✅ SMS configuration validated (live mode)");
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
        console.log("🔧 SMS Config:", {
            apiUrl: config.apiUrl,
            username: config.username ? "configured" : "missing",
            testMode: config.testMode,
            from: config.from,
        });
        configLogged = true;
    }

    // Normalize phone number (no logging needed)
    const normalizedTo = normalizePhoneToE164(request.to);

    // Handle test mode (credentials already validated at startup in production)
    if (config.testMode) {
        return getTestModeResponse(request);
    }

    // Additional safety check for non-production environments
    // (Production validation happens at startup via process.exit)
    if (!config.username || !config.password) {
        console.error("❌ HelloSMS credentials not configured (required for live SMS)");
        return {
            success: false,
            error: "HelloSMS credentials not configured",
        };
    }

    try {
        // Prepare HelloSMS API request
        const body = {
            to: normalizedTo,
            message: request.text,
            from: request.from || config.from,
            sendApiCallback: false,
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
            const messageId = responseData.messageIds?.[0]?.apiMessageId || "unknown";
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
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

// Validate E.164 phone number format
export function isValidE164(phone: string): boolean {
    return /^\+[1-9]\d{1,14}$/.test(phone);
}
