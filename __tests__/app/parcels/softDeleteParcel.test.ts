/**
 * Tests for softDeleteParcel function (Phase 4)
 *
 * CRITICAL BUSINESS LOGIC TESTED:
 * 1. SMS Cancellation Logic - Different handling based on SMS status
 * 2. Soft Delete Mechanics - Proper timestamp and user tracking
 * 3. Transaction Safety - Atomicity of parcel deletion + SMS handling
 * 4. Edge Cases - Non-existent parcels, already deleted parcels
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Session } from "next-auth";

// Track database operations for verification
let insertedSms: any[] = [];
let updatedSms: any[] = [];
let updatedParcels: any[] = [];
let mockParcelData: any = null;
let mockSmsRecords: any[] = [];
let shouldTransactionFail = false;
let selectCallCount = 0;

// Mock nanoid for predictable IDs
vi.mock("nanoid", () => ({
    nanoid: vi.fn((length: number) => `test-id-${length}`),
    customAlphabet: vi.fn(() => () => `test-id-custom`),
}));

// Mock time provider
vi.mock("@/app/utils/time-provider", () => ({
    Time: {
        now: vi.fn(() => ({
            toDate: () => new Date("2025-10-10T12:00:00Z"),
            isAfter: (otherTime: any) => {
                const now = new Date("2025-10-10T12:00:00Z");
                const other = otherTime.toDate();
                return now > other;
            },
        })),
        fromDate: vi.fn((date: Date) => ({
            toDate: () => date,
        })),
    },
}));

// Mock SMS template generator
vi.mock("@/app/utils/sms/templates", () => ({
    formatCancellationSms: vi.fn(
        (data: { pickupDate: Date; publicUrl: string }, locale: string) => {
            const formatted = data.pickupDate.toISOString();
            switch (locale) {
                case "sv":
                    return `Matpaket ${formatted} är inställt.`;
                case "en":
                    return `Food pickup ${formatted} is cancelled.`;
                default:
                    return `Pickup ${formatted} cancelled.`;
            }
        },
    ),
}));

// Mock the database module
vi.mock("@/app/db/drizzle", () => {
    const mockDb = {
        transaction: vi.fn(async (callback: any) => {
            if (shouldTransactionFail) {
                throw new Error("Transaction failed");
            }
            // Reset select call count for each transaction
            selectCallCount = 0;
            return await callback(mockDb);
        }),
        select: vi.fn((fields?: any) => {
            selectCallCount++;
            const currentSelectNum = selectCallCount;

            return {
                from: vi.fn(() => {
                    if (currentSelectNum === 1) {
                        // First select: validation query in softDeleteParcel
                        return {
                            where: vi.fn(() => ({
                                limit: vi.fn(() => {
                                    if (mockParcelData) {
                                        return Promise.resolve([mockParcelData]);
                                    }
                                    return Promise.resolve([]);
                                }),
                            })),
                        };
                    } else if (currentSelectNum === 2) {
                        // Second select: innerJoin query for parcel + household
                        return {
                            innerJoin: vi.fn(() => ({
                                where: vi.fn(() => ({
                                    limit: vi.fn(() => {
                                        if (mockParcelData) {
                                            return Promise.resolve([mockParcelData]);
                                        }
                                        return Promise.resolve([]);
                                    }),
                                })),
                            })),
                        };
                    } else if (currentSelectNum === 3) {
                        // Third select: SMS query - returns directly with orderBy support
                        return {
                            where: vi.fn(() => ({
                                orderBy: vi.fn(() => Promise.resolve(mockSmsRecords)),
                            })),
                        };
                    }

                    // Default: return empty
                    return {
                        where: vi.fn(() => ({
                            limit: vi.fn(() => Promise.resolve([])),
                        })),
                    };
                }),
            };
        }),
        update: vi.fn((table: any) => ({
            set: vi.fn((values: any) => ({
                where: vi.fn((condition: any) => {
                    // Track the update operation based on what fields are being set
                    if (values.status !== undefined) {
                        // This is an SMS update
                        updatedSms.push(values);
                    } else if (values.deleted_at !== undefined) {
                        // This is a parcel update
                        updatedParcels.push(values);
                    }
                    return Promise.resolve();
                }),
            })),
        })),
        insert: vi.fn(() => ({
            values: vi.fn((values: any) => {
                insertedSms.push(values);
                return Promise.resolve();
            }),
        })),
    };

    return {
        db: mockDb,
    };
});

// Mock query helpers
vi.mock("@/app/db/query-helpers", () => ({
    notDeleted: vi.fn(() => "NOT_DELETED_CONDITION"),
}));

// Mock the auth module
vi.mock("@/app/utils/auth/protected-action", () => ({
    protectedAction: (fn: any) => {
        return async (...args: any[]) => {
            const mockSession: Session = {
                user: {
                    githubUsername: "test-admin",
                    name: "Test Admin",
                    email: "admin@example.com",
                },
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            };
            return fn(mockSession, ...args);
        };
    },
    protectedAgreementAction: (fn: any) => {
        return async (...args: any[]) => {
            const mockSession: Session = {
                user: {
                    githubUsername: "test-admin",
                    name: "Test Admin",
                    email: "admin@example.com",
                },
                expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            };
            return fn(mockSession, ...args);
        };
    },
}));

describe("softDeleteParcel", () => {
    beforeEach(() => {
        // Reset tracking arrays
        insertedSms = [];
        updatedSms = [];
        updatedParcels = [];
        mockParcelData = null;
        mockSmsRecords = [];
        shouldTransactionFail = false;
        selectCallCount = 0;
        vi.clearAllMocks();
    });

    describe("SMS Cancellation Logic", () => {
        it("should cancel queued SMS silently without sending cancellation message", async () => {
            // Setup: Future parcel with queued SMS
            mockParcelData = {
                parcel: {
                    id: "parcel-123",
                    household_id: "household-456",
                    pickup_location_id: "location-1",
                    pickup_date_time_earliest: new Date("2025-10-15T10:00:00Z"),
                    pickup_date_time_latest: new Date("2025-10-15T12:00:00Z"),
                    is_picked_up: false,
                    deleted_at: null,
                },
                household: {
                    id: "household-456",
                    first_name: "Test",
                    last_name: "User",
                    phone_number: "+46701234567",
                    locale: "sv",
                },
            };

            // Mock SMS query to return queued SMS
            mockSmsRecords = [
                {
                    id: "sms-789",
                    parcel_id: "parcel-123",
                    intent: "pickup_reminder",
                    status: "queued",
                },
            ];

            const { softDeleteParcel } = await import("@/app/[locale]/parcels/actions");
            const result = await softDeleteParcel("parcel-123");

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.smsCancelled).toBe(true);
                expect(result.data.smsSent).toBe(false);
            }

            // 2 SMS updates: queued cancelled + pickup_updated cancellation attempt
            expect(updatedSms).toHaveLength(2);
            expect(updatedSms.every((sms: any) => sms.status === "cancelled")).toBe(true);

            // Verify no new SMS was inserted
            expect(insertedSms).toHaveLength(0);

            // Verify parcel was soft deleted
            expect(updatedParcels).toHaveLength(1);
            expect(updatedParcels[0].deleted_at).toBeDefined();
            expect(updatedParcels[0].deleted_by_user_id).toBe("test-admin");
        });

        it("should cancel sending SMS silently (same as queued)", async () => {
            mockParcelData = {
                parcel: {
                    id: "parcel-123",
                    household_id: "household-456",
                    pickup_location_id: "location-1",
                    pickup_date_time_earliest: new Date("2025-10-15T10:00:00Z"),
                    pickup_date_time_latest: new Date("2025-10-15T12:00:00Z"),
                    is_picked_up: false,
                    deleted_at: null,
                },
                household: {
                    id: "household-456",
                    locale: "sv",
                    phone_number: "+46701234567",
                },
            };

            mockSmsRecords = [
                {
                    id: "sms-789",
                    status: "sending",
                },
            ];

            const { softDeleteParcel } = await import("@/app/[locale]/parcels/actions");
            const result = await softDeleteParcel("parcel-123");

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.smsCancelled).toBe(true);
                expect(result.data.smsSent).toBe(false);
            }
        });

        it("should send cancellation SMS when original SMS was already sent", async () => {
            mockParcelData = {
                parcel: {
                    id: "parcel-123",
                    household_id: "household-456",
                    pickup_location_id: "location-1",
                    pickup_date_time_earliest: new Date("2025-10-15T10:00:00Z"),
                    pickup_date_time_latest: new Date("2025-10-15T12:00:00Z"),
                    is_picked_up: false,
                    deleted_at: null,
                },
                household: {
                    id: "household-456",
                    locale: "sv",
                    phone_number: "+46701234567",
                },
            };

            mockSmsRecords = [
                {
                    id: "sms-789",
                    status: "sent",
                },
            ];

            const { softDeleteParcel } = await import("@/app/[locale]/parcels/actions");
            const result = await softDeleteParcel("parcel-123");

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.smsCancelled).toBe(false);
                expect(result.data.smsSent).toBe(true); // Detects that SMS was sent
            }

            // 1 SMS update for pickup_updated cancellation attempt
            // (sent pickup_reminder SMS is not modified)
            expect(updatedSms).toHaveLength(1);

            // Verify cancellation SMS was inserted
            expect(insertedSms).toHaveLength(1);
            expect(insertedSms[0].intent).toBe("pickup_cancelled");
            expect(insertedSms[0].parcel_id).toBe("parcel-123"); // Keep parcel reference (soft-deleted)
            expect(insertedSms[0].status).toBe("queued");
            expect(insertedSms[0].text).toContain("är inställt");
        });

        it("should NOT send cancellation SMS for failed SMS status", async () => {
            mockParcelData = {
                parcel: {
                    id: "parcel-123",
                    household_id: "household-456",
                    pickup_location_id: "location-1",
                    pickup_date_time_earliest: new Date("2025-10-15T10:00:00Z"),
                    pickup_date_time_latest: new Date("2025-10-15T12:00:00Z"),
                    is_picked_up: false,
                    deleted_at: null,
                },
                household: {
                    id: "household-456",
                    locale: "sv",
                    phone_number: "+46701234567",
                },
            };

            mockSmsRecords = [
                {
                    id: "sms-789",
                    status: "failed",
                },
            ];

            const { softDeleteParcel } = await import("@/app/[locale]/parcels/actions");
            const result = await softDeleteParcel("parcel-123");

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.smsCancelled).toBe(false);
                expect(result.data.smsSent).toBe(false);
            }

            // 1 SMS update for pickup_updated cancellation attempt
            // (failed pickup_reminder SMS is not modified)
            expect(updatedSms).toHaveLength(1);
            expect(insertedSms).toHaveLength(0);
        });

        it("should cancel ALL queued SMS records, not just first (regression test)", async () => {
            mockParcelData = {
                parcel: {
                    id: "parcel-123",
                    household_id: "household-456",
                    pickup_location_id: "location-1",
                    pickup_date_time_earliest: new Date("2025-10-15T10:00:00Z"),
                    pickup_date_time_latest: new Date("2025-10-15T12:00:00Z"),
                    is_picked_up: false,
                    deleted_at: null,
                },
                household: {
                    id: "household-456",
                    locale: "sv",
                    phone_number: "+46701234567",
                },
            };

            // Multiple queued SMS (e.g., after multiple reschedules)
            mockSmsRecords = [
                {
                    id: "sms-1",
                    status: "queued",
                    created_at: new Date("2025-10-09T10:00:00Z"),
                },
                {
                    id: "sms-2",
                    status: "queued",
                    created_at: new Date("2025-10-10T10:00:00Z"),
                },
                {
                    id: "sms-3",
                    status: "sending",
                    created_at: new Date("2025-10-11T10:00:00Z"),
                },
            ];

            const { softDeleteParcel } = await import("@/app/[locale]/parcels/actions");
            const result = await softDeleteParcel("parcel-123");

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.smsCancelled).toBe(true);
                expect(result.data.smsSent).toBe(false);
            }

            // 4 SMS updates: 3 queued/sending cancelled + 1 pickup_updated cancellation attempt
            expect(updatedSms).toHaveLength(4);
            expect(updatedSms.every((sms: any) => sms.status === "cancelled")).toBe(true);

            // No cancellation SMS sent (none were "sent" status)
            expect(insertedSms).toHaveLength(0);
        });

        it("should cancel queued SMS AND send cancellation for sent SMS (mixed statuses)", async () => {
            mockParcelData = {
                parcel: {
                    id: "parcel-123",
                    household_id: "household-456",
                    pickup_location_id: "location-1",
                    pickup_date_time_earliest: new Date("2025-10-15T10:00:00Z"),
                    pickup_date_time_latest: new Date("2025-10-15T12:00:00Z"),
                    is_picked_up: false,
                    deleted_at: null,
                },
                household: {
                    id: "household-456",
                    locale: "sv",
                    phone_number: "+46701234567",
                },
            };

            // Real-world scenario: old sent reminder + new queued one after resend
            mockSmsRecords = [
                {
                    id: "sms-old",
                    status: "sent",
                    created_at: new Date("2025-10-08T10:00:00Z"),
                },
                {
                    id: "sms-new",
                    status: "queued",
                    created_at: new Date("2025-10-10T10:00:00Z"),
                },
            ];

            const { softDeleteParcel } = await import("@/app/[locale]/parcels/actions");
            const result = await softDeleteParcel("parcel-123");

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.smsCancelled).toBe(true); // Queued one cancelled
                expect(result.data.smsSent).toBe(true); // Cancellation sent for sent one
            }

            // 2 SMS updates: queued cancelled + pickup_updated cancellation attempt
            expect(updatedSms).toHaveLength(2);
            expect(updatedSms.every((sms: any) => sms.status === "cancelled")).toBe(true);

            // Cancellation SMS should be inserted
            expect(insertedSms).toHaveLength(1);
            expect(insertedSms[0].intent).toBe("pickup_cancelled");
            expect(insertedSms[0].status).toBe("queued");
            expect(insertedSms[0].text).toContain("är inställt");
        });

        it("should only send ONE cancellation SMS even with multiple sent SMS", async () => {
            mockParcelData = {
                parcel: {
                    id: "parcel-123",
                    household_id: "household-456",
                    pickup_location_id: "location-1",
                    pickup_date_time_earliest: new Date("2025-10-15T10:00:00Z"),
                    pickup_date_time_latest: new Date("2025-10-15T12:00:00Z"),
                    is_picked_up: false,
                    deleted_at: null,
                },
                household: {
                    id: "household-456",
                    locale: "sv",
                    phone_number: "+46701234567",
                },
            };

            // Edge case: Multiple sent SMS (shouldn't happen but be defensive)
            mockSmsRecords = [
                {
                    id: "sms-1",
                    status: "sent",
                    created_at: new Date("2025-10-08T10:00:00Z"),
                },
                {
                    id: "sms-2",
                    status: "sent",
                    created_at: new Date("2025-10-09T10:00:00Z"),
                },
            ];

            const { softDeleteParcel } = await import("@/app/[locale]/parcels/actions");
            const result = await softDeleteParcel("parcel-123");

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.smsCancelled).toBe(false);
                expect(result.data.smsSent).toBe(true);
            }

            // 1 SMS update for pickup_updated cancellation (even though none exist)
            // The sent pickup_reminder SMS are not modified
            expect(updatedSms).toHaveLength(1);
            expect(updatedSms[0].status).toBe("cancelled"); // pickup_updated cancellation attempt

            // Only ONE cancellation SMS inserted (not 2)
            expect(insertedSms).toHaveLength(1);
            expect(insertedSms[0].text).toContain("är inställt");
        });

        it("should handle complex mix: queued + sending + sent + failed", async () => {
            mockParcelData = {
                parcel: {
                    id: "parcel-123",
                    household_id: "household-456",
                    pickup_location_id: "location-1",
                    pickup_date_time_earliest: new Date("2025-10-15T10:00:00Z"),
                    pickup_date_time_latest: new Date("2025-10-15T12:00:00Z"),
                    is_picked_up: false,
                    deleted_at: null,
                },
                household: {
                    id: "household-456",
                    locale: "sv",
                    phone_number: "+46701234567",
                },
            };

            // Complex edge case: all statuses present
            mockSmsRecords = [
                {
                    id: "sms-failed",
                    status: "failed",
                    created_at: new Date("2025-10-07T10:00:00Z"),
                },
                {
                    id: "sms-sent",
                    status: "sent",
                    created_at: new Date("2025-10-08T10:00:00Z"),
                },
                {
                    id: "sms-queued",
                    status: "queued",
                    created_at: new Date("2025-10-09T10:00:00Z"),
                },
                {
                    id: "sms-sending",
                    status: "sending",
                    created_at: new Date("2025-10-10T10:00:00Z"),
                },
            ];

            const { softDeleteParcel } = await import("@/app/[locale]/parcels/actions");
            const result = await softDeleteParcel("parcel-123");

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.smsCancelled).toBe(true); // queued + sending cancelled
                expect(result.data.smsSent).toBe(true); // cancellation for sent
            }

            // 3 SMS updates: queued cancelled + sending cancelled + pickup_updated cancellation attempt
            expect(updatedSms).toHaveLength(3);
            expect(updatedSms.every((sms: any) => sms.status === "cancelled")).toBe(true);

            // 1 cancellation SMS should be inserted (for sent)
            expect(insertedSms).toHaveLength(1);
            expect(insertedSms[0].text).toContain("är inställt");
        });

        it("should handle parcel with no SMS gracefully", async () => {
            mockParcelData = {
                parcel: {
                    id: "parcel-123",
                    household_id: "household-456",
                    pickup_location_id: "location-1",
                    pickup_date_time_earliest: new Date("2025-10-15T10:00:00Z"),
                    pickup_date_time_latest: new Date("2025-10-15T12:00:00Z"),
                    is_picked_up: false,
                    deleted_at: null,
                },
                household: {
                    id: "household-456",
                    locale: "sv",
                    phone_number: "+46701234567",
                },
            };

            // Mock SMS query to return empty array (no SMS)
            mockSmsRecords = [];

            const { softDeleteParcel } = await import("@/app/[locale]/parcels/actions");
            const result = await softDeleteParcel("parcel-123");

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.smsCancelled).toBe(false);
                expect(result.data.smsSent).toBe(false);
            }

            // 1 SMS update for pickup_updated cancellation attempt (even though none exist)
            expect(updatedSms).toHaveLength(1);
            expect(insertedSms).toHaveLength(0);

            // Parcel still deleted
            expect(updatedParcels).toHaveLength(1);
        });
    });

    describe("Error Handling", () => {
        it("should return NOT_FOUND for non-existent parcel", async () => {
            // mockParcelData is null, so query returns empty
            const { softDeleteParcel } = await import("@/app/[locale]/parcels/actions");
            const result = await softDeleteParcel("parcel-nonexistent");

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("NOT_FOUND");
                expect(result.error.message).toContain("not found");
            }
        });

        it("should return ALREADY_PICKED_UP for picked up parcel", async () => {
            mockParcelData = {
                parcel: {
                    id: "parcel-123",
                    household_id: "household-456",
                    pickup_location_id: "location-1",
                    pickup_date_time_earliest: new Date("2025-10-15T10:00:00Z"),
                    pickup_date_time_latest: new Date("2025-10-15T12:00:00Z"),
                    is_picked_up: true, // Already picked up
                    deleted_at: null,
                },
            };

            const { softDeleteParcel } = await import("@/app/[locale]/parcels/actions");
            const result = await softDeleteParcel("parcel-123");

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("ALREADY_PICKED_UP");
            }
        });

        it("should return PAST_PARCEL for past parcel", async () => {
            // Mock Time.now() returns 2025-10-10T12:00:00Z
            // Parcel ends at 2025-10-09 (before now)
            mockParcelData = {
                parcel: {
                    id: "parcel-123",
                    household_id: "household-456",
                    pickup_location_id: "location-1",
                    pickup_date_time_earliest: new Date("2025-10-09T10:00:00Z"),
                    pickup_date_time_latest: new Date("2025-10-09T12:00:00Z"),
                    is_picked_up: false,
                    deleted_at: null,
                },
            };

            const { Time } = await import("@/app/utils/time-provider");
            vi.mocked(Time.fromDate).mockReturnValueOnce({
                toDate: () => new Date("2025-10-09T12:00:00Z"),
            } as any);

            const { softDeleteParcel } = await import("@/app/[locale]/parcels/actions");
            const result = await softDeleteParcel("parcel-123");

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("PAST_PARCEL");
            }
        });
    });

    describe("Audit Trail", () => {
        it("should record deleted_by_user_id from session", async () => {
            mockParcelData = {
                parcel: {
                    id: "parcel-123",
                    household_id: "household-456",
                    pickup_location_id: "location-1",
                    pickup_date_time_earliest: new Date("2025-10-15T10:00:00Z"),
                    pickup_date_time_latest: new Date("2025-10-15T12:00:00Z"),
                    is_picked_up: false,
                    deleted_at: null,
                },
                household: {
                    id: "household-456",
                    locale: "sv",
                    phone_number: "+46701234567",
                },
            };

            mockSmsRecords = [];

            const { softDeleteParcel } = await import("@/app/[locale]/parcels/actions");
            await softDeleteParcel("parcel-123");

            expect(updatedParcels).toHaveLength(1);
            expect(updatedParcels[0].deleted_by_user_id).toBe("test-admin");
            expect(updatedParcels[0].deleted_at).toEqual(new Date("2025-10-10T12:00:00Z"));
        });
    });
});
