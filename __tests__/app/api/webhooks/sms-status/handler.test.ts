import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    updateSmsProviderStatus: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    logError: vi.fn(),
    sendSmsHealthAlert: vi.fn(),
}));

vi.mock("@/app/utils/sms/sms-service", () => ({
    updateSmsProviderStatus: mocks.updateSmsProviderStatus,
}));

vi.mock("@/app/utils/logger", () => ({
    logger: {
        debug: mocks.debug,
        error: mocks.error,
        info: mocks.info,
        warn: mocks.warn,
    },
    logError: mocks.logError,
}));

vi.mock("@/app/utils/notifications/slack", () => ({
    sendSmsHealthAlert: mocks.sendSmsHealthAlert,
}));

import { handleSmsStatusCallback } from "@/app/api/webhooks/sms-status/handler";

describe("SMS status callback logging", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("omits the uncontrolled callback reference from logs", async () => {
        const callbackRef =
            "SENTINEL_CALLBACK_REFERENCE phone=+46709990004 body=SENTINEL_CALLBACK_BODY";
        const messageId = "SENTINEL_CALLBACK_MESSAGE_ID phone=+46709990004";
        mocks.updateSmsProviderStatus.mockResolvedValue(true);
        const request = {
            json: vi.fn().mockResolvedValue({
                apiMessageId: messageId,
                status: "delivered",
                callbackRef,
            }),
        } as unknown as NextRequest;

        const response = await handleSmsStatusCallback(
            request,
            "/api/webhooks/sms-status/[secret]",
        );

        expect(response.status).toBe(200);
        expect(mocks.info).toHaveBeenCalledWith(
            {
                status: "delivered",
            },
            "SMS provider status updated via callback",
        );

        const logged = JSON.stringify([
            ...mocks.debug.mock.calls,
            ...mocks.info.mock.calls,
            ...mocks.warn.mock.calls,
            ...mocks.logError.mock.calls,
        ]);
        expect(logged).not.toContain(callbackRef);
        expect(logged).not.toContain(messageId);
        expect(logged).not.toContain("+46709990004");
        expect(logged).not.toContain("SENTINEL_CALLBACK_BODY");
    });

    it("omits the provider message ID when the status is invalid", async () => {
        const messageId = "SENTINEL_INVALID_STATUS_MESSAGE_ID phone=+46709990008";
        const request = {
            json: vi.fn().mockResolvedValue({
                apiMessageId: messageId,
                status: "SENTINEL_INVALID_PROVIDER_STATUS",
            }),
        } as unknown as NextRequest;

        const response = await handleSmsStatusCallback(
            request,
            "/api/webhooks/sms-status/[secret]",
        );

        expect(response.status).toBe(400);
        expect(mocks.warn).toHaveBeenCalledWith(
            { statusType: "string" },
            "SMS status callback has invalid status",
        );
        expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(messageId);
    });

    it("omits the provider message ID for an unknown SMS record", async () => {
        const messageId = "SENTINEL_UNKNOWN_MESSAGE_ID phone=+46709990009";
        mocks.updateSmsProviderStatus.mockResolvedValue(false);
        const request = {
            json: vi.fn().mockResolvedValue({
                apiMessageId: messageId,
                status: "delivered",
            }),
        } as unknown as NextRequest;

        const response = await handleSmsStatusCallback(
            request,
            "/api/webhooks/sms-status/[secret]",
        );

        expect(response.status).toBe(200);
        expect(mocks.debug).toHaveBeenCalledWith(
            { status: "delivered" },
            "SMS status callback for unknown or already processed message",
        );
        expect(JSON.stringify(mocks.debug.mock.calls)).not.toContain(messageId);
    });

    it("omits database query parameters from logs and Slack alerts", async () => {
        const messageId =
            "SENTINEL_CALLBACK_DB_MESSAGE_ID phone=+46709990012 body=SENTINEL_CALLBACK_DB_BODY";
        const databaseError = new Error(
            `Failed query: update outgoing_sms\nparams: delivered,${messageId}`,
        );
        mocks.updateSmsProviderStatus.mockRejectedValue(databaseError);
        const request = {
            json: vi.fn().mockResolvedValue({
                apiMessageId: messageId,
                status: "delivered",
            }),
        } as unknown as NextRequest;

        const response = await handleSmsStatusCallback(
            request,
            "/api/webhooks/sms-status/[secret]",
        );

        expect(response.status).toBe(200);
        expect(mocks.error).toHaveBeenCalledWith(
            {
                method: "POST",
                path: "/api/webhooks/sms-status/[secret]",
            },
            "Error processing SMS status callback",
        );
        await vi.waitFor(() => {
            expect(mocks.sendSmsHealthAlert).toHaveBeenCalledWith(false, {
                error: "SMS status callback processing failed",
                component: "sms-webhook",
            });
        });

        const emitted = JSON.stringify([
            ...mocks.debug.mock.calls,
            ...mocks.error.mock.calls,
            ...mocks.info.mock.calls,
            ...mocks.warn.mock.calls,
            ...mocks.logError.mock.calls,
            ...mocks.sendSmsHealthAlert.mock.calls,
        ]);
        expect(emitted).not.toContain(messageId);
        expect(emitted).not.toContain("+46709990012");
        expect(emitted).not.toContain("SENTINEL_CALLBACK_DB_BODY");
    });
});
