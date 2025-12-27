/**
 * Integration tests for SMS delivery status tracking
 *
 * These tests verify the business use cases for tracking SMS delivery
 * via HelloSMS callbacks, ensuring admins can see delivery outcomes.
 *
 * HelloSMS status values:
 * - "delivered": Message successfully delivered to recipient's phone
 * - "failed": Permanent failure (invalid/inactive phone number)
 * - "not delivered": Temporary failure (phone off/offline)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../db/test-db";
import { outgoingSms } from "@/app/db/schema";
import { updateSmsProviderStatusWithDb } from "@/app/utils/sms/sms-service";
import { createTestHousehold, resetHouseholdCounter } from "../../factories/household.factory";
import { createTestSentSms, resetSmsCounter } from "../../factories/sms.factory";

describe("SMS Delivery Status Tracking", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetSmsCounter();
    });

    describe("Successful delivery", () => {
        it("admin can see that a pickup reminder was delivered to the household", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();

            // SMS was sent to household with pickup reminder
            const sms = await createTestSentSms({
                household_id: household.id,
                provider_message_id: "msg_123",
                text: "Matpaket 15 juni 10:00-10:30",
            });

            // HelloSMS confirms delivery
            await updateSmsProviderStatusWithDb(db as any, "msg_123", "delivered");

            // Admin can see the SMS was delivered
            const [record] = await db.select().from(outgoingSms).where(eq(outgoingSms.id, sms.id));

            expect(record.provider_status).toBe("delivered");
            expect(record.provider_status_updated_at).not.toBeNull();
        });
    });

    describe("Permanent failure - invalid phone number", () => {
        it("admin can identify households with invalid phone numbers to follow up manually", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();

            const sms = await createTestSentSms({
                household_id: household.id,
                provider_message_id: "msg_456",
            });

            // HelloSMS reports permanent failure (invalid number)
            await updateSmsProviderStatusWithDb(db as any, "msg_456", "failed");

            // Admin can see the failure and follow up with household
            const [record] = await db.select().from(outgoingSms).where(eq(outgoingSms.id, sms.id));

            expect(record.provider_status).toBe("failed");
        });
    });

    describe("Temporary failure - phone unreachable", () => {
        it("admin can see when SMS could not be delivered because phone was off", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();

            const sms = await createTestSentSms({
                household_id: household.id,
                provider_message_id: "msg_789",
            });

            // HelloSMS reports temporary failure (phone off/no signal)
            await updateSmsProviderStatusWithDb(db as any, "msg_789", "not delivered");

            const [record] = await db.select().from(outgoingSms).where(eq(outgoingSms.id, sms.id));

            expect(record.provider_status).toBe("not delivered");
        });

        it("status updates to delivered when phone comes back online and receives SMS", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();

            const sms = await createTestSentSms({
                household_id: household.id,
                provider_message_id: "msg_retry",
            });

            // First: phone was off
            await updateSmsProviderStatusWithDb(db as any, "msg_retry", "not delivered");

            // Later: phone came online, SMS delivered
            await updateSmsProviderStatusWithDb(db as any, "msg_retry", "delivered");

            const [record] = await db.select().from(outgoingSms).where(eq(outgoingSms.id, sms.id));

            expect(record.provider_status).toBe("delivered");
        });
    });

    describe("Callback for unknown message", () => {
        it("system gracefully ignores callbacks for messages not in our database", async () => {
            const db = await getTestDb();

            // HelloSMS sends callback for a message we don't have
            // (could be old, deleted, or from another system)
            const updated = await updateSmsProviderStatusWithDb(
                db as any,
                "unknown_msg_id",
                "delivered",
            );

            // Should not crash, just return false
            expect(updated).toBe(false);
        });
    });

    describe("Data integrity", () => {
        it("callback only updates delivery status, not the SMS content or recipient", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();

            const sms = await createTestSentSms({
                household_id: household.id,
                provider_message_id: "msg_integrity",
                text: "Original pickup reminder",
                to_e164: "+46701234567",
            });

            await updateSmsProviderStatusWithDb(db as any, "msg_integrity", "delivered");

            const [record] = await db.select().from(outgoingSms).where(eq(outgoingSms.id, sms.id));

            // Original data unchanged
            expect(record.text).toBe("Original pickup reminder");
            expect(record.to_e164).toBe("+46701234567");
            expect(record.household_id).toBe(household.id);
            // Only delivery status added
            expect(record.provider_status).toBe("delivered");
        });
    });
});
