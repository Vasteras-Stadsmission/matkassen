/**
 * HelloSMS integration utility for sending SMS messages
 * Supports test mode for development/testing
 */
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

// Environment configuration
export function getHelloSmsConfig(): HelloSmsConfig {
    // Return cached config if available
    if (cachedConfig) {
        return cachedConfig;
    }

    // Check HELLO_SMS_TEST_MODE first - if explicitly set, always use that value
    const testModeFromEnv = process.env.HELLO_SMS_TEST_MODE;
    let testMode: boolean;

    if (testModeFromEnv !== undefined && testModeFromEnv !== "") {
        // If explicitly set, use that value (this takes precedence over NODE_ENV)
        testMode = testModeFromEnv === "true";
        if (!hasLoggedConfig) {
            console.log(
                `🔧 SMS Test Mode explicitly set to: ${testMode} (HELLO_SMS_TEST_MODE="${testModeFromEnv}")`,
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
        from: process.env.HELLO_SMS_FROM || "Matkassen",
    };

    return cachedConfig;
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

    // Validate configuration
    if (!config.username || !config.password) {
        console.error("❌ HelloSMS credentials not configured");
        return {
            success: false,
            error: "HelloSMS credentials not configured",
        };
    }

    // Normalize phone number (no logging needed)
    const normalizedTo = normalizePhoneToE164(request.to);

    // Handle test mode
    if (config.testMode) {
        return getTestModeResponse(request);
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
