/**
 * HelloSMS integration utility for sending SMS messages
 * Supports test mode and failure injection for development/testing
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
    success: boolean;
    message_id?: string;
    error?: string;
}

// Environment configuration
export function getHelloSmsConfig(): HelloSmsConfig {
    return {
        apiUrl: process.env.HELLO_SMS_API_URL || "https://api.hellosms.se/v1/sms",
        username: process.env.HELLO_SMS_USERNAME || "",
        password: process.env.HELLO_SMS_PASSWORD || "",
        testMode:
            process.env.HELLO_SMS_TEST_MODE === "true" || process.env.NODE_ENV !== "production",
        from: process.env.HELLO_SMS_FROM || "Matkassen",
    };
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

// Test mode and failure injection logic
function shouldInjectFailure(): boolean {
    const failureRate = parseFloat(process.env.HELLO_SMS_FAILURE_INJECTION_RATE || "0");
    return failureRate > 0 && Math.random() < failureRate;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getTestModeResponse(_request: SendSmsRequest): SendSmsResponse {
    // Simulate different outcomes in test mode
    if (shouldInjectFailure()) {
        const failures = [
            { success: false, error: "Rate limit exceeded", httpStatus: 429 },
            { success: false, error: "Service temporarily unavailable", httpStatus: 503 },
            { success: false, error: "Invalid phone number", httpStatus: 400 },
        ];
        return failures[Math.floor(Math.random() * failures.length)];
    }

    // Success response with fake message ID
    return {
        success: true,
        messageId: `test_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    };
}

// Main SMS sending function
export async function sendSms(request: SendSmsRequest): Promise<SendSmsResponse> {
    const config = getHelloSmsConfig();

    // Validate configuration
    if (!config.username || !config.password) {
        return {
            success: false,
            error: "HelloSMS credentials not configured",
        };
    }

    // Normalize phone number
    const normalizedTo = normalizePhoneToE164(request.to);

    // Handle test mode
    if (config.testMode) {
        console.log(`[SMS Test Mode] Would send to ${normalizedTo}: ${request.text}`);
        return getTestModeResponse(request);
    }

    try {
        // Prepare HelloSMS API request
        const body = {
            to: normalizedTo,
            text: request.text,
            from: request.from || config.from,
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

        if (response.ok && responseData.success) {
            return {
                success: true,
                messageId: responseData.message_id,
            };
        } else {
            return {
                success: false,
                error: responseData.error || `HTTP ${response.status}`,
                httpStatus: response.status,
            };
        }
    } catch (error) {
        console.error("HelloSMS API error:", error);
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
