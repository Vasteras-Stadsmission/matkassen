import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestHousehold, resetHouseholdCounter } from "../../factories/household.factory";
import { createTestSms, resetSmsCounter } from "../../factories/sms.factory";
import { hoursFromTestNow, TEST_NOW } from "../../test-time";
import { MockSmsGateway } from "@/app/utils/sms/mock-sms-gateway";
import {
    resetSmsGateway,
    setSmsGateway,
    type ConversationMessageStatus,
} from "@/app/utils/sms/sms-gateway";
import { reconcileStaleMessages } from "@/app/utils/sms/sms-service";
import { logger } from "@/app/utils/logger";

vi.mock("@/app/utils/sms/hello-sms", async importOriginal => {
    const actual = await importOriginal<typeof import("@/app/utils/sms/hello-sms")>();
    return {
        ...actual,
        getHelloSmsConfig: () => ({
            ...actual.getHelloSmsConfig(),
            testMode: false,
        }),
    };
});

describe("SMS reconciliation privacy-safe logging", () => {
    beforeEach(() => {
        vi.useRealTimers();
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(TEST_NOW);
        resetHouseholdCounter();
        resetSmsCounter();
        resetSmsGateway();
    });

    afterEach(() => {
        resetSmsGateway();
        vi.restoreAllMocks();
    });

    it("does not log a recipient phone number or SMS body when reconciliation succeeds", async () => {
        const phone = "+46709990005";
        const smsBody = "SENTINEL_RECONCILIATION_SMS_BODY";
        const sentAt = hoursFromTestNow(-2);
        const household = await createTestHousehold({ phone_number: phone });
        const sms = await createTestSms({
            household_id: household.id,
            to_e164: phone,
            text: smsBody,
            status: "sent",
            sent_at: sentAt,
            provider_message_id: "provider-message-789",
        });
        const mockGateway = new MockSmsGateway().mockConversation([
            {
                ts: sentAt.getTime() / 1000,
                subject: "",
                text: smsBody,
                direction: "out",
                status: "delivered",
            },
        ]);
        setSmsGateway(mockGateway);
        const infoLogSpy = vi.spyOn(logger, "info").mockImplementation(() => logger);

        const result = await reconcileStaleMessages();

        expect(result).toMatchObject({ reconciled: 1, checked: 1, stillWaiting: 0, errors: [] });
        const logged = JSON.stringify(infoLogSpy.mock.calls);
        expect(logged).not.toContain(phone);
        expect(logged).not.toContain(smsBody);
        expect(infoLogSpy).toHaveBeenCalledWith(
            {
                smsId: sms.id,
                providerStatus: "delivered",
            },
            "SMS delivery status reconciled via conversation API (callback was missing)",
        );
    });

    it("reports a matched waiting message as unresolved", async () => {
        const phone = "+46709990015";
        const smsBody = "SENTINEL_WAITING_SMS_BODY";
        const sentAt = hoursFromTestNow(-2);
        const household = await createTestHousehold({ phone_number: phone });
        const sms = await createTestSms({
            household_id: household.id,
            to_e164: phone,
            text: smsBody,
            status: "sent",
            sent_at: sentAt,
            provider_message_id: "provider-message-waiting",
        });
        setSmsGateway(
            new MockSmsGateway().mockConversation([
                {
                    ts: sentAt.getTime() / 1000,
                    subject: "",
                    text: smsBody,
                    direction: "out",
                    status: "waiting",
                },
            ]),
        );
        const debugLogSpy = vi.spyOn(logger, "debug").mockImplementation(() => logger);

        const result = await reconcileStaleMessages();

        expect(result).toMatchObject({ reconciled: 0, checked: 1, stillWaiting: 1, errors: [] });
        expect(debugLogSpy).toHaveBeenCalledWith(
            { smsId: sms.id },
            "SMS reconciliation confirmed message is still waiting",
        );
    });

    it("does not log an uncontrolled provider status", async () => {
        const phone = "+46709990006";
        const smsBody = "SENTINEL_UNKNOWN_STATUS_SMS_BODY";
        const rawStatus = "SENTINEL_UNCONTROLLED_PROVIDER_STATUS";
        const sentAt = hoursFromTestNow(-2);
        const household = await createTestHousehold({ phone_number: phone });
        const sms = await createTestSms({
            household_id: household.id,
            to_e164: phone,
            text: smsBody,
            status: "sent",
            sent_at: sentAt,
            provider_message_id: "provider-message-unknown-status",
        });
        const mockGateway = new MockSmsGateway().mockConversation([
            {
                ts: sentAt.getTime() / 1000,
                subject: "",
                text: smsBody,
                direction: "out",
                status: rawStatus as ConversationMessageStatus,
            },
        ]);
        setSmsGateway(mockGateway);
        const warnLogSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

        const result = await reconcileStaleMessages();

        expect(result).toMatchObject({ reconciled: 0, checked: 1, errors: [] });
        const logged = JSON.stringify(warnLogSpy.mock.calls);
        expect(logged).not.toContain(phone);
        expect(logged).not.toContain(smsBody);
        expect(logged).not.toContain(rawStatus);
        expect(warnLogSpy).toHaveBeenCalledWith(
            { smsId: sms.id },
            "SMS reconciliation: unknown provider status from conversation API, skipping",
        );
    });

    it("keeps provider conversation failures out of returned alert details", async () => {
        const phone = "+46709990007";
        const smsBody = "SENTINEL_FAILED_CONVERSATION_SMS_BODY";
        const providerError =
            "SENTINEL_CONVERSATION_PROVIDER_ERROR credential=SENTINEL_CONVERSATION_CREDENTIAL";
        const household = await createTestHousehold({ phone_number: phone });
        const sms = await createTestSms({
            household_id: household.id,
            to_e164: phone,
            text: smsBody,
            status: "sent",
            sent_at: hoursFromTestNow(-2),
            provider_message_id: "provider-message-failed-conversation",
        });
        setSmsGateway(new MockSmsGateway().mockConversationError(providerError));

        const result = await reconcileStaleMessages();

        expect(result).toMatchObject({
            reconciled: 0,
            checked: 1,
            errors: [`${sms.id}: provider conversation request failed`],
        });
        const alertDetails = JSON.stringify(result.errors);
        expect(alertDetails).not.toContain(phone);
        expect(alertDetails).not.toContain(smsBody);
        expect(alertDetails).not.toContain(providerError);
        expect(alertDetails).not.toContain("SENTINEL_CONVERSATION_CREDENTIAL");
    });
});
