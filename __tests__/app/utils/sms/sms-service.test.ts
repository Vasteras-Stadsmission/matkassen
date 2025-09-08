import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as smsService from "../../../../app/utils/sms/sms-service";
import * as helloSms from "../../../../app/utils/sms/hello-sms";

// Mock the database module
vi.mock("../../../../app/db/drizzle", () => ({
    db: {
        insert: vi.fn(),
        select: vi.fn(),
        update: vi.fn(),
    },
}));

// Mock the SMS sending module
vi.mock("../../../../app/utils/sms/hello-sms", () => ({
    sendSms: vi.fn(),
}));

// Mock nanoid
vi.mock("nanoid", () => ({
    nanoid: vi.fn(() => "test-sms-id-12345"),
}));

describe("SMS Service Business Logic", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset date to a fixed time for consistent testing
        vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("SMS Record Creation", () => {
        it("should create SMS record with correct data structure", async () => {
            const mockDbInsert = {
                values: vi.fn().mockResolvedValue(undefined),
            };
            const mockDb = await import("../../../../app/db/drizzle");
            mockDb.db.insert = vi.fn().mockReturnValue(mockDbInsert);

            const smsData: smsService.CreateSmsData = {
                intent: "pickup_reminder",
                parcelId: "parcel-123",
                householdId: "household-456",
                toE164: "+46701234567",
                locale: "sv",
                text: "Test SMS message",
            };

            const result = await smsService.createSmsRecord(smsData);

            expect(result).toBe("test-sms-id-12345");
            expect(mockDb.db.insert).toHaveBeenCalled();
            expect(mockDbInsert.values).toHaveBeenCalledWith({
                id: "test-sms-id-12345",
                intent: "pickup_reminder",
                parcel_id: "parcel-123",
                household_id: "household-456",
                to_e164: "+46701234567",
                locale: "sv",
                text: "Test SMS message",
                status: "queued",
                attempt_count: 0,
                created_at: new Date("2024-01-15T10:00:00Z"),
            });
        });

        it("should handle consent enrollment SMS without parcel", async () => {
            const mockDbInsert = {
                values: vi.fn().mockResolvedValue(undefined),
            };
            const mockDb = await import("../../../../app/db/drizzle");
            mockDb.db.insert = vi.fn().mockReturnValue(mockDbInsert);

            const smsData: smsService.CreateSmsData = {
                intent: "consent_enrolment",
                householdId: "household-789",
                toE164: "+46707654321",
                locale: "en",
                text: "Consent enrollment SMS",
            };

            await smsService.createSmsRecord(smsData);

            expect(mockDbInsert.values).toHaveBeenCalledWith(
                expect.objectContaining({
                    intent: "consent_enrolment",
                    parcel_id: undefined,
                    household_id: "household-789",
                }),
            );
        });
    });

    describe("SMS Status Updates", () => {
        it("should update status to sent with provider message ID", async () => {
            const mockDbUpdate = {
                set: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue(undefined),
                }),
            };
            const mockDb = await import("../../../../app/db/drizzle");
            mockDb.db.update = vi.fn().mockReturnValue(mockDbUpdate);

            await smsService.updateSmsStatus("sms-123", "sent", {
                providerMessageId: "provider-msg-456",
            });

            expect(mockDbUpdate.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: "sent",
                    sent_at: new Date("2024-01-15T10:00:00Z"),
                    provider_message_id: "provider-msg-456",
                }),
            );
        });

        it("should update status to failed with error details", async () => {
            const mockDbUpdate = {
                set: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue(undefined),
                }),
            };
            const mockDb = await import("../../../../app/db/drizzle");
            mockDb.db.update = vi.fn().mockReturnValue(mockDbUpdate);

            await smsService.updateSmsStatus("sms-123", "failed", {
                errorCode: "400",
                errorMessage: "Invalid phone number",
            });

            expect(mockDbUpdate.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: "failed",
                    failed_at: new Date("2024-01-15T10:00:00Z"),
                    last_error_code: "400",
                    last_error_message: "Invalid phone number",
                }),
            );
        });

        it("should update status to retrying with next attempt time", async () => {
            const nextAttemptAt = new Date("2024-01-15T10:05:00Z");
            const mockDbUpdate = {
                set: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue(undefined),
                }),
            };
            const mockDb = await import("../../../../app/db/drizzle");
            mockDb.db.update = vi.fn().mockReturnValue(mockDbUpdate);

            await smsService.updateSmsStatus("sms-123", "retrying", {
                errorCode: "429",
                errorMessage: "Rate limited",
                nextAttemptAt,
            });

            expect(mockDbUpdate.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: "retrying",
                    next_attempt_at: nextAttemptAt,
                    last_error_code: "429",
                    last_error_message: "Rate limited",
                }),
            );
        });
    });

    describe("SMS Delivery Status Updates", () => {
        it("should update delivery status to delivered", async () => {
            const mockDbUpdate = {
                set: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        returning: vi.fn().mockResolvedValue([{ id: "sms-123" }]),
                    }),
                }),
            };
            const mockDb = await import("../../../../app/db/drizzle");
            mockDb.db.update = vi.fn().mockReturnValue(mockDbUpdate);

            const result = await smsService.updateSmsDeliveryStatus("provider-msg-456", true);

            expect(result).toBe(true);
            expect(mockDbUpdate.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: "delivered",
                    delivered_at: new Date("2024-01-15T10:00:00Z"),
                }),
            );
        });

        it("should update delivery status to not delivered", async () => {
            const mockDbUpdate = {
                set: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        returning: vi.fn().mockResolvedValue([]),
                    }),
                }),
            };
            const mockDb = await import("../../../../app/db/drizzle");
            mockDb.db.update = vi.fn().mockReturnValue(mockDbUpdate);

            const result = await smsService.updateSmsDeliveryStatus("nonexistent-msg", false);

            expect(result).toBe(false);
            expect(mockDbUpdate.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: "not_delivered",
                    failed_at: new Date("2024-01-15T10:00:00Z"),
                }),
            );
        });
    });

    describe("SMS Sending Logic", () => {
        it("should successfully send SMS and update status", async () => {
            const mockSendSms = vi.mocked(helloSms.sendSms);
            mockSendSms.mockResolvedValue({
                success: true,
                messageId: "provider-msg-789",
            });

            const mockDbUpdate = {
                set: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue(undefined),
                }),
            };
            const mockDb = await import("../../../../app/db/drizzle");
            mockDb.db.update = vi.fn().mockReturnValue(mockDbUpdate);

            const smsRecord: smsService.SmsRecord = {
                id: "sms-123",
                intent: "pickup_reminder",
                parcelId: "parcel-456",
                householdId: "household-789",
                toE164: "+46701234567",
                locale: "sv",
                text: "Your food parcel is ready for pickup",
                status: "queued",
                attemptCount: 0,
                createdAt: new Date("2024-01-15T09:00:00Z"),
            };

            await smsService.sendSmsRecord(smsRecord);

            expect(mockSendSms).toHaveBeenCalledWith({
                to: "+46701234567",
                text: "Your food parcel is ready for pickup",
            });

            // Should first mark as sending, then as sent
            expect(mockDbUpdate.set).toHaveBeenCalledTimes(2);
        });

        it("should handle SMS sending failure with retry", async () => {
            const mockSendSms = vi.mocked(helloSms.sendSms);
            mockSendSms.mockResolvedValue({
                success: false,
                error: "Rate limited",
                httpStatus: 429,
            });

            const mockDbUpdate = {
                set: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue(undefined),
                }),
            };
            const mockDb = await import("../../../../app/db/drizzle");
            mockDb.db.update = vi.fn().mockReturnValue(mockDbUpdate);

            const smsRecord: smsService.SmsRecord = {
                id: "sms-123",
                intent: "pickup_reminder",
                toE164: "+46701234567",
                locale: "sv",
                text: "Test message",
                status: "queued",
                attemptCount: 1,
                householdId: "household-123",
                createdAt: new Date("2024-01-15T09:00:00Z"),
            };

            await smsService.sendSmsRecord(smsRecord);

            // Should mark as sending, then as retrying due to 429 error
            expect(mockDbUpdate.set).toHaveBeenCalledTimes(2);

            // Check that the retry status was set with proper backoff
            const retryCall = mockDbUpdate.set.mock.calls[1][0];
            expect(retryCall.status).toBe("retrying");
            expect(retryCall.last_error_code).toBe("429");
            expect(retryCall.next_attempt_at).toBeInstanceOf(Date);
        });

        it("should mark as failed after max attempts", async () => {
            const mockSendSms = vi.mocked(helloSms.sendSms);
            mockSendSms.mockResolvedValue({
                success: false,
                error: "Service unavailable",
                httpStatus: 503,
            });

            const mockDbUpdate = {
                set: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue(undefined),
                }),
            };
            const mockDb = await import("../../../../app/db/drizzle");
            mockDb.db.update = vi.fn().mockReturnValue(mockDbUpdate);

            const smsRecord: smsService.SmsRecord = {
                id: "sms-123",
                intent: "pickup_reminder",
                toE164: "+46701234567",
                locale: "sv",
                text: "Test message",
                status: "retrying",
                attemptCount: 4, // Max attempts reached
                householdId: "household-123",
                createdAt: new Date("2024-01-15T09:00:00Z"),
            };

            await smsService.sendSmsRecord(smsRecord);

            // Should mark as sending, then as failed (no more retries)
            const failedCall = mockDbUpdate.set.mock.calls[1][0];
            expect(failedCall.status).toBe("failed");
            expect(failedCall.last_error_code).toBe("503");
        });

        it("should handle non-retryable errors immediately", async () => {
            const mockSendSms = vi.mocked(helloSms.sendSms);
            mockSendSms.mockResolvedValue({
                success: false,
                error: "Invalid phone number",
                httpStatus: 400,
            });

            const mockDbUpdate = {
                set: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue(undefined),
                }),
            };
            const mockDb = await import("../../../../app/db/drizzle");
            mockDb.db.update = vi.fn().mockReturnValue(mockDbUpdate);

            const smsRecord: smsService.SmsRecord = {
                id: "sms-123",
                intent: "pickup_reminder",
                toE164: "+46701234567",
                locale: "sv",
                text: "Test message",
                status: "queued",
                attemptCount: 1,
                householdId: "household-123",
                createdAt: new Date("2024-01-15T09:00:00Z"),
            };

            await smsService.sendSmsRecord(smsRecord);

            // Should mark as sending, then as failed (400 is not retryable)
            const failedCall = mockDbUpdate.set.mock.calls[1][0];
            expect(failedCall.status).toBe("failed");
            expect(failedCall.last_error_code).toBe("400");
        });
    });

    describe("Backoff Calculation", () => {
        it("should calculate correct backoff times for retries", async () => {
            const mockSendSms = vi.mocked(helloSms.sendSms);
            mockSendSms.mockResolvedValue({
                success: false,
                error: "Rate limited",
                httpStatus: 429,
            });

            const mockDbUpdate = {
                set: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue(undefined),
                }),
            };
            const mockDb = await import("../../../../app/db/drizzle");
            mockDb.db.update = vi.fn().mockReturnValue(mockDbUpdate);

            // Test different attempt counts and their expected backoff
            // Note: algorithm uses (attemptCount + 1 - 1) as index into [5, 15, 60]
            const testCases = [
                { attemptCount: 0, expectedBackoffSeconds: 5 }, // First attempt fails: nextAttemptCount=1, index=0 → 5s
                { attemptCount: 1, expectedBackoffSeconds: 15 }, // First retry fails: nextAttemptCount=2, index=1 → 15s
                { attemptCount: 2, expectedBackoffSeconds: 60 }, // Second retry fails: nextAttemptCount=3, index=2 → 60s
            ];

            for (const testCase of testCases) {
                mockDbUpdate.set.mockClear();

                const smsRecord: smsService.SmsRecord = {
                    id: `sms-${testCase.attemptCount}`,
                    intent: "pickup_reminder",
                    toE164: "+46701234567",
                    locale: "sv",
                    text: "Test message",
                    status: "queued",
                    attemptCount: testCase.attemptCount,
                    householdId: "household-123",
                    createdAt: new Date("2024-01-15T09:00:00Z"),
                };

                await smsService.sendSmsRecord(smsRecord);

                const retryCall = mockDbUpdate.set.mock.calls[1][0];
                const expectedNextAttempt = new Date(
                    new Date("2024-01-15T10:00:00Z").getTime() +
                        testCase.expectedBackoffSeconds * 1000,
                );

                expect(retryCall.next_attempt_at).toEqual(expectedNextAttempt);
            }
        });
    });
});
