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
    status?: string;
    statusText?: string;
    messageIds?: Array<{
        apiMessageId: string;
        to: string;
        status: number;
        message: string;
    }>;
}

// Environment configuration
export function getHelloSmsConfig(): HelloSmsConfig {
    return {
        apiUrl: process.env.HELLO_SMS_API_URL || "https://api.hellosms.se/v1/sms",
        username: process.env.HELLO_SMS_USERNAME || "",
        password: process.env.HELLO_SMS_PASSWORD || "",
        testMode: process.env.HELLO_SMS_TEST_MODE === "true",
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getTestModeResponse(_request: SendSmsRequest): SendSmsResponse {
    // Success response with fake message ID
    return {
        success: true,
        messageId: `test_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    };
}

// Main SMS sending function
export async function sendSms(request: SendSmsRequest): Promise<SendSmsResponse> {
    const config = getHelloSmsConfig();

    console.log("🔧 SMS Config:", {
        apiUrl: config.apiUrl,
        username: config.username,
        testMode: config.testMode,
        from: config.from,
    });

    // Validate configuration
    if (!config.username || !config.password) {
        console.error("❌ HelloSMS credentials not configured");
        return {
            success: false,
            error: "HelloSMS credentials not configured",
        };
    }

    // Normalize phone number
    const normalizedTo = normalizePhoneToE164(request.to);
    console.log(`📱 Normalized phone: ${request.to} -> ${normalizedTo}`);

    // Handle test mode
    if (config.testMode) {
        console.log(`[SMS Test Mode] Would send to ${normalizedTo}: ${request.text}`);
        return getTestModeResponse(request);
    }

    console.log(`🚀 Sending REAL SMS to ${normalizedTo} via HelloSMS API...`);

    try {
        // Prepare HelloSMS API request
        const body = {
            to: normalizedTo,
            message: request.text, // HelloSMS expects 'message', not 'text'
            from: request.from || config.from,
            sendApiCallback: true, // Enable delivery status callbacks
        };

        console.log("📤 HelloSMS API Request:", {
            url: config.apiUrl,
            method: "POST",
            body: body,
            authConfigured: !!config.username && !!config.password,
        });

        const response = await fetch(config.apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
            },
            body: JSON.stringify(body),
        });

        console.log(`📥 HelloSMS API Response: ${response.status} ${response.statusText}`);

        const responseData = (await response.json()) as HelloSmsApiResponse;
        console.log("📄 HelloSMS Response Data:", responseData);

        if (response.ok && responseData.status === "success") {
            const messageId = responseData.messageIds?.[0]?.apiMessageId || "unknown";
            console.log(`✅ HelloSMS API Success: Message ID ${messageId}`);
            return {
                success: true,
                messageId: messageId,
            };
        } else {
            const errorMsg = responseData.statusText || `HTTP ${response.status}`;
            console.error(`❌ HelloSMS API Error: ${errorMsg}`);
            return {
                success: false,
                error: errorMsg,
                httpStatus: response.status,
            };
        }
    } catch (error) {
        console.error("💥 HelloSMS API Exception:", error);
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
