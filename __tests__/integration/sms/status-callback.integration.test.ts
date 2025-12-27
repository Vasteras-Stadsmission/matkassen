/**
 * Integration tests for SMS status callback functionality
 *
 * Tests the updateSmsProviderStatusWithDb function which is called
 * when HelloSMS sends delivery status callbacks.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../db/test-db";
import { outgoingSms } from "@/app/db/schema";
import { updateSmsProviderStatusWithDb } from "@/app/utils/sms/sms-service";
import { createTestHousehold, resetHouseholdCounter } from "../../factories/household.factory";
import { createTestSentSms, resetSmsCounter } from "../../factories/sms.factory";

describe("SMS Status Callback - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetSmsCounter();
    });

    describe("updateSmsProviderStatusWithDb", () => {
        it("should update provider_status for SMS with matching provider_message_id", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();

            // Create a sent SMS with a provider message ID
            const sms = await createTestSentSms({
                household_id: household.id,
                provider_message_id: "hellosms_msg_123456",
            });

            // Simulate HelloSMS callback
            const updated = await updateSmsProviderStatusWithDb(
                db as any,
                "hellosms_msg_123456",
                "Delivered",
            );

            expect(updated).toBe(true);

            // Verify the database was updated
            const [updatedSms] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));

            expect(updatedSms.provider_status).toBe("Delivered");
            expect(updatedSms.provider_status_updated_at).not.toBeNull();
        });

        it("should return false when no SMS matches the provider_message_id", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();

            // Create a sent SMS with a different provider message ID
            await createTestSentSms({
                household_id: household.id,
                provider_message_id: "hellosms_msg_different",
            });

            // Try to update with non-matching ID
            const updated = await updateSmsProviderStatusWithDb(
                db as any,
                "hellosms_msg_unknown",
                "Delivered",
            );

            expect(updated).toBe(false);
        });

        it("should handle various status values from HelloSMS", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();

            const statusValues = [
                "Delivered",
                "Failed",
                "Sent",
                "Queued",
                "Expired",
                "Rejected",
                "Failed: Invalid phone number",
                "Delivered: Handset confirmed",
            ];

            for (let i = 0; i < statusValues.length; i++) {
                const status = statusValues[i];
                const messageId = `hellosms_msg_${i}`;

                const sms = await createTestSentSms({
                    household_id: household.id,
                    provider_message_id: messageId,
                });

                const updated = await updateSmsProviderStatusWithDb(db as any, messageId, status);

                expect(updated).toBe(true);

                const [updatedSms] = await db
                    .select()
                    .from(outgoingSms)
                    .where(eq(outgoingSms.id, sms.id));

                expect(updatedSms.provider_status).toBe(status);
            }
        });

        it("should update provider_status_updated_at timestamp", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();

            const sms = await createTestSentSms({
                household_id: household.id,
                provider_message_id: "hellosms_msg_timestamp_test",
            });

            // Initial state: no provider_status_updated_at
            const [initialSms] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));

            expect(initialSms.provider_status_updated_at).toBeNull();

            // Update status
            await updateSmsProviderStatusWithDb(
                db as any,
                "hellosms_msg_timestamp_test",
                "Delivered",
            );

            // Verify timestamp was set
            const [updatedSms] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));

            expect(updatedSms.provider_status_updated_at).not.toBeNull();
            expect(updatedSms.provider_status_updated_at).toBeInstanceOf(Date);
        });

        it("should overwrite previous provider_status on subsequent callbacks", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();

            const sms = await createTestSentSms({
                household_id: household.id,
                provider_message_id: "hellosms_msg_multi_update",
            });

            // First callback: Sent
            await updateSmsProviderStatusWithDb(db as any, "hellosms_msg_multi_update", "Sent");

            const [afterFirst] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));

            expect(afterFirst.provider_status).toBe("Sent");
            const firstTimestamp = afterFirst.provider_status_updated_at;

            // Small delay to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            // Second callback: Delivered
            await updateSmsProviderStatusWithDb(
                db as any,
                "hellosms_msg_multi_update",
                "Delivered",
            );

            const [afterSecond] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));

            expect(afterSecond.provider_status).toBe("Delivered");
            // Timestamp should be updated
            expect(afterSecond.provider_status_updated_at).not.toBeNull();
            expect(afterSecond.provider_status_updated_at!.getTime()).toBeGreaterThanOrEqual(
                firstTimestamp!.getTime(),
            );
        });

        it("should not modify other SMS fields when updating provider status", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();

            const sms = await createTestSentSms({
                household_id: household.id,
                provider_message_id: "hellosms_msg_no_side_effects",
                text: "Original message text",
                to_e164: "+46701234567",
            });

            // Record original values
            const [originalSms] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));

            // Update provider status
            await updateSmsProviderStatusWithDb(
                db as any,
                "hellosms_msg_no_side_effects",
                "Delivered",
            );

            // Verify other fields unchanged
            const [updatedSms] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));

            expect(updatedSms.text).toBe(originalSms.text);
            expect(updatedSms.to_e164).toBe(originalSms.to_e164);
            expect(updatedSms.status).toBe(originalSms.status);
            expect(updatedSms.intent).toBe(originalSms.intent);
            expect(updatedSms.sent_at?.getTime()).toBe(originalSms.sent_at?.getTime());
            expect(updatedSms.household_id).toBe(originalSms.household_id);
        });

        it("should handle SMS without provider_message_id (queued SMS)", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();

            // Create SMS without provider_message_id (hasn't been sent yet)
            const [queuedSms] = await db
                .insert(outgoingSms)
                .values({
                    household_id: household.id,
                    intent: "pickup_reminder",
                    to_e164: "+46701234567",
                    text: "Test message",
                    status: "queued",
                    idempotency_key: `test-queued-${Date.now()}`,
                    attempt_count: 0,
                    // No provider_message_id
                })
                .returning();

            // Try to update - should not match anything
            const updated = await updateSmsProviderStatusWithDb(
                db as any,
                "hellosms_msg_random",
                "Delivered",
            );

            expect(updated).toBe(false);

            // Original SMS should be unchanged
            const [unchangedSms] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, queuedSms.id));

            expect(unchangedSms.provider_status).toBeNull();
        });
    });
});
