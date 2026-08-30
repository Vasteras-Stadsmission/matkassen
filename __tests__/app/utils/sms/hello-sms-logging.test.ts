import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logMocks = vi.hoisted(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    logError: vi.fn(),
}));

vi.mock("@/app/utils/logger", () => ({
    logger: {
        debug: logMocks.debug,
        info: logMocks.info,
        warn: logMocks.warn,
        error: logMocks.error,
        fatal: logMocks.fatal,
    },
    logError: logMocks.logError,
}));

vi.mock("@/app/config/branding", () => ({
    SMS_SENDER_NAME: "SENTINEL_SMS_SENDER",
}));

describe("HelloSMS privacy-safe logging", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.stubEnv("NODE_ENV", "test");
        vi.stubEnv("HELLO_SMS_TEST_MODE", "false");
        vi.stubEnv("HELLO_SMS_USERNAME", "SENTINEL_SMS_USERNAME");
        vi.stubEnv("HELLO_SMS_PASSWORD", "SENTINEL_SMS_PASSWORD");
        vi.stubEnv(
            "HELLO_SMS_API_URL",
            "https://sms.example.test/send?authorization=SENTINEL_URL_AUTHORIZATION",
        );
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("does not log request data, credentials, authorization, or provider rejection text", async () => {
        const phone = "+46709990003";
        const smsBody = "SENTINEL_SMS_BODY_PROVIDER";
        const providerMessageId = `SENTINEL_PROVIDER_MESSAGE_ID phone=${phone}`;
        const providerError =
            "SENTINEL_PROVIDER_REJECTION authorization=SENTINEL_PROVIDER_AUTHORIZATION";
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({
                status: "success",
                messageIds: [
                    {
                        apiMessageId: providerMessageId,
                        to: phone,
                        status: -5,
                        message: providerError,
                    },
                ],
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const { sendSms } = await import("@/app/utils/sms/hello-sms");
        const result = await sendSms({
            to: phone,
            text: smsBody,
            callbackRef: "sms-record-123",
            subject: "Matkassen sms-record-123",
        });

        expect(result).toMatchObject({
            success: false,
            error: providerError,
            messageId: providerMessageId,
            httpStatus: 400,
        });

        const [, fetchOptions] = fetchMock.mock.calls[0];
        const requestBody = JSON.parse(fetchOptions.body as string);
        expect(requestBody).toMatchObject({
            to: phone,
            message: smsBody,
            callbackRef: "sms-record-123",
            subject: "Matkassen sms-record-123",
        });
        const authorization = fetchOptions.headers.Authorization as string;
        expect(authorization).toContain("Basic ");

        const logged = JSON.stringify(Object.values(logMocks).flatMap(mock => mock.mock.calls));
        for (const sensitiveValue of [
            phone,
            smsBody,
            providerMessageId,
            providerError,
            "SENTINEL_SMS_USERNAME",
            "SENTINEL_SMS_PASSWORD",
            "SENTINEL_SMS_SENDER",
            "SENTINEL_URL_AUTHORIZATION",
            "SENTINEL_PROVIDER_AUTHORIZATION",
            authorization,
        ]) {
            expect(logged).not.toContain(sensitiveValue);
        }

        expect(logMocks.warn).toHaveBeenCalledWith(
            {
                recipientStatus: -5,
            },
            "SMS recipient rejected by provider",
        );
    });

    it("does not log an uncontrolled recipient status value", async () => {
        const rawStatus = "SENTINEL_UNCONTROLLED_RECIPIENT_STATUS phone=+46709990011";
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue({
                    status: "success",
                    messageIds: [
                        {
                            apiMessageId: "provider-message-invalid-status",
                            to: "+46709990011",
                            status: rawStatus,
                            message: "Rejected",
                        },
                    ],
                }),
            }),
        );

        const { sendSms } = await import("@/app/utils/sms/hello-sms");
        await sendSms({ to: "+46709990011", text: "Status validation test" });

        expect(JSON.stringify(logMocks.warn.mock.calls)).not.toContain(rawStatus);
        expect(logMocks.warn).toHaveBeenCalledWith(
            { recipientStatus: "invalid" },
            "SMS recipient rejected by provider",
        );
    });
});
