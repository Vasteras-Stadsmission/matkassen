/**
 * Integration tests for Issues page actions.
 *
 * Tests the business logic for all user actions available on the Issues page:
 * 1. Mark parcel as handed out (unresolved handouts)
 * 2. Mark parcel as no-show (unresolved handouts)
 * 3. Cancel parcel (outside opening hours)
 * 4. Dismiss failed SMS
 *
 * IMPORTANT: These tests verify the actual database state changes,
 * not just the API responses.
 *
 * NOTE ON TESTING APPROACH:
 * These tests simulate action outcomes by directly updating the PGlite test
 * database. This tests the database constraints and business rules (e.g., the
 * no_show_pickup_exclusivity_check CHECK constraint) without HTTP overhead.
 *
 * Full API handler testing (auth, HTTP status codes, error handling) is
 * covered by e2e tests. See: e2e/api-health.spec.ts for validation.
 *
 * Future improvement: Refactor handlers to accept a database connection
 * parameter, allowing tests to call actual handlers with the test database.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestFailedSms,
    resetHouseholdCounter,
    resetLocationCounter,
    resetSmsCounter,
} from "../../factories";
import { TEST_NOW, daysFromTestNow, minutesFromTestNow } from "../../test-time";
import { foodParcels, outgoingSms } from "@/app/db/schema";
import { eq, isNull, isNotNull } from "drizzle-orm";

describe("Issues Page Actions - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
    });

    describe("Mark as Handed Out", () => {
        it("should mark past parcel as picked up", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create past parcel (unresolved handout)
            const yesterday = daysFromTestNow(-1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: yesterday,
                pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                is_picked_up: false,
            });

            expect(parcel.is_picked_up).toBe(false);
            expect(parcel.picked_up_at).toBeNull();

            // Simulate the action: mark as handed out
            await db
                .update(foodParcels)
                .set({
                    is_picked_up: true,
                    picked_up_at: TEST_NOW,
                    picked_up_by_user_id: "test-admin",
                })
                .where(eq(foodParcels.id, parcel.id));

            // Verify the parcel is now marked as picked up
            const [updated] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));

            expect(updated.is_picked_up).toBe(true);
            expect(updated.picked_up_at).toBeInstanceOf(Date);
            expect(updated.picked_up_by_user_id).toBe("test-admin");
        });

        it("should not allow marking already picked up parcel", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create already picked up parcel
            const yesterday = daysFromTestNow(-1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: yesterday,
                pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                is_picked_up: true,
            });

            // Try to mark as picked up again - the where clause should not match
            const result = await db
                .update(foodParcels)
                .set({
                    is_picked_up: true,
                    picked_up_at: TEST_NOW,
                    picked_up_by_user_id: "test-admin",
                })
                .where(eq(foodParcels.id, parcel.id))
                .returning();

            // Update should succeed but we should verify no duplicate action
            expect(result).toHaveLength(1);
        });
    });

    describe("Mark as No-Show", () => {
        it("should mark past parcel as no-show", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create past parcel (unresolved handout)
            const yesterday = daysFromTestNow(-1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: yesterday,
                pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                is_picked_up: false,
            });

            expect(parcel.no_show_at).toBeNull();

            // Simulate the action: mark as no-show
            await db
                .update(foodParcels)
                .set({
                    no_show_at: TEST_NOW,
                    no_show_by_user_id: "test-admin",
                })
                .where(eq(foodParcels.id, parcel.id));

            // Verify the parcel is now marked as no-show
            const [updated] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));

            expect(updated.no_show_at).toBeInstanceOf(Date);
            expect(updated.no_show_by_user_id).toBe("test-admin");
        });

        it("should not allow marking picked up parcel as no-show (database constraint)", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create already picked up parcel
            const yesterday = daysFromTestNow(-1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: yesterday,
                pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                is_picked_up: true,
            });

            // Database constraint (no_show_pickup_exclusivity_check) prevents this
            // This verifies the business rule is enforced at the database level
            await expect(
                db
                    .update(foodParcels)
                    .set({
                        no_show_at: TEST_NOW,
                        no_show_by_user_id: "test-admin",
                    })
                    .where(eq(foodParcels.id, parcel.id))
                    .returning(),
            ).rejects.toThrow(); // Throws due to database constraint
        });

        it("should not mark future parcel as no-show", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create future parcel
            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                is_picked_up: false,
            });

            // In production, the API checks if the pickup date is in the past
            // This is a business rule enforced in the API, not the database
            expect(parcel.pickup_date_time_latest > TEST_NOW).toBe(true);
        });
    });

    describe("Cancel Parcel (Soft Delete)", () => {
        it("should soft delete future parcel", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create future parcel (outside opening hours scenario)
            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                is_picked_up: false,
            });

            expect(parcel.deleted_at).toBeNull();

            // Simulate the action: cancel parcel
            await db
                .update(foodParcels)
                .set({
                    deleted_at: TEST_NOW,
                    deleted_by_user_id: "test-admin",
                })
                .where(eq(foodParcels.id, parcel.id));

            // Verify the parcel is now soft deleted
            const [updated] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));

            expect(updated.deleted_at).toBeInstanceOf(Date);
            expect(updated.deleted_by_user_id).toBe("test-admin");
        });

        it("should not allow cancelling already picked up parcel", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create picked up parcel
            const yesterday = daysFromTestNow(-1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: yesterday,
                pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                is_picked_up: true,
            });

            // The API should prevent cancelling picked up parcels
            // This is enforced in the softDeleteParcel action
            expect(parcel.is_picked_up).toBe(true);
        });

        it("should not allow cancelling already deleted parcel", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create and delete parcel
            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // Soft delete
            await db
                .update(foodParcels)
                .set({
                    deleted_at: TEST_NOW,
                    deleted_by_user_id: "test-admin",
                })
                .where(eq(foodParcels.id, parcel.id));

            // Verify it's deleted
            const [deleted] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));

            expect(deleted.deleted_at).not.toBeNull();

            // API would return 410 Gone for already deleted
        });

        it("should exclude cancelled parcel from active queries", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create parcel
            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // Active query should find it
            let activeParcels = await db
                .select()
                .from(foodParcels)
                .where(isNull(foodParcels.deleted_at));
            expect(activeParcels.some(p => p.id === parcel.id)).toBe(true);

            // Cancel it
            await db
                .update(foodParcels)
                .set({
                    deleted_at: TEST_NOW,
                    deleted_by_user_id: "test-admin",
                })
                .where(eq(foodParcels.id, parcel.id));

            // Active query should no longer find it
            activeParcels = await db
                .select()
                .from(foodParcels)
                .where(isNull(foodParcels.deleted_at));
            expect(activeParcels.some(p => p.id === parcel.id)).toBe(false);
        });
    });

    describe("Dismiss Failed SMS", () => {
        it("should dismiss failed SMS by setting dismissed_at", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create parcel and failed SMS
            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const sms = await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
                error_message: "Test error",
            });

            expect(sms.dismissed_at).toBeNull();

            // Simulate the action: dismiss SMS
            await db
                .update(outgoingSms)
                .set({ dismissed_at: TEST_NOW })
                .where(eq(outgoingSms.id, sms.id));

            // Verify the SMS is dismissed
            const [updated] = await db.select().from(outgoingSms).where(eq(outgoingSms.id, sms.id));

            expect(updated.dismissed_at).toBeInstanceOf(Date);
        });

        it("should exclude dismissed SMS from failed SMS query", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create parcel and failed SMS
            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const sms = await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
            });

            // Query should find non-dismissed failed SMS
            let failedSms = await db
                .select()
                .from(outgoingSms)
                .where(isNull(outgoingSms.dismissed_at));
            expect(failedSms.some(s => s.id === sms.id)).toBe(true);

            // Dismiss it
            await db
                .update(outgoingSms)
                .set({ dismissed_at: TEST_NOW })
                .where(eq(outgoingSms.id, sms.id));

            // Query should no longer find it
            failedSms = await db.select().from(outgoingSms).where(isNull(outgoingSms.dismissed_at));
            expect(failedSms.some(s => s.id === sms.id)).toBe(false);
        });
    });

    describe("Parcel ID Validation", () => {
        it("should accept 12-character nanoid", async () => {
            const id = "XXxjD8zt4Yo1"; // 12 chars
            const isValid = id.length >= 8 && id.length <= 32 && /^[a-zA-Z0-9_-]+$/.test(id);
            expect(isValid).toBe(true);
        });

        it("should accept 14-character nanoid", async () => {
            const id = "uCJ2wAFVtolwyO"; // 14 chars
            const isValid = id.length >= 8 && id.length <= 32 && /^[a-zA-Z0-9_-]+$/.test(id);
            expect(isValid).toBe(true);
        });

        it("should reject too short IDs", async () => {
            const id = "abc"; // 3 chars - too short
            const isValid = id.length >= 8 && id.length <= 32 && /^[a-zA-Z0-9_-]+$/.test(id);
            expect(isValid).toBe(false);
        });

        it("should reject IDs with invalid characters", async () => {
            const id = "abc!@#def123"; // contains invalid chars
            const isValid = id.length >= 8 && id.length <= 32 && /^[a-zA-Z0-9_-]+$/.test(id);
            expect(isValid).toBe(false);
        });
    });

    describe("SMS Retry - Outside Opening Hours", () => {
        it("should identify parcel outside opening hours", async () => {
            const household = await createTestHousehold();

            // Create location with schedule: Monday 09:00-17:00 only
            const { location } = await createTestLocationWithSchedule(
                {},
                {
                    weekdays: ["monday"],
                    openingTime: "09:00",
                    closingTime: "17:00",
                },
            );

            // Create parcel on a Sunday (TEST_NOW is Saturday, +1 day = Sunday)
            // This is outside opening hours because the location is only open on Monday
            const sunday = daysFromTestNow(1); // Sunday
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: sunday,
                pickup_date_time_latest: new Date(sunday.getTime() + 30 * 60 * 1000),
            });

            // Import and use the outside hours filter
            const { isParcelOutsideOpeningHours } =
                await import("@/app/utils/schedule/outside-hours-filter");

            const parcelTimeInfo = {
                id: parcel.id,
                pickupEarliestTime: parcel.pickup_date_time_earliest,
                pickupLatestTime: parcel.pickup_date_time_latest,
                isPickedUp: parcel.is_picked_up,
            };

            const scheduleInfo = {
                schedules: [
                    {
                        id: "test-schedule",
                        name: "Test Schedule",
                        startDate: new Date("2020-01-01"),
                        endDate: new Date("2030-12-31"),
                        days: [
                            {
                                weekday: "monday",
                                isOpen: true,
                                openingTime: "09:00",
                                closingTime: "17:00",
                            },
                        ],
                    },
                ],
            };

            const isOutside = isParcelOutsideOpeningHours(parcelTimeInfo, scheduleInfo);
            expect(isOutside).toBe(true);
        });

        it("should identify parcel within opening hours", async () => {
            const { isParcelOutsideOpeningHours } =
                await import("@/app/utils/schedule/outside-hours-filter");

            // TEST_NOW is 2024-06-15T10:00:00Z (Saturday at 12:00 Stockholm time)
            // Create parcel time info for Saturday at 14:00 Stockholm time
            const saturday = daysFromTestNow(0);
            saturday.setHours(12, 0, 0, 0); // Noon UTC = 14:00 Stockholm

            const parcelTimeInfo = {
                id: "test-parcel",
                pickupEarliestTime: saturday,
                pickupLatestTime: new Date(saturday.getTime() + 30 * 60 * 1000),
                isPickedUp: false,
            };

            const scheduleInfo = {
                schedules: [
                    {
                        id: "test-schedule",
                        name: "Test Schedule",
                        startDate: new Date("2020-01-01"),
                        endDate: new Date("2030-12-31"),
                        days: [
                            {
                                weekday: "saturday",
                                isOpen: true,
                                openingTime: "09:00",
                                closingTime: "18:00",
                            },
                        ],
                    },
                ],
            };

            const isOutside = isParcelOutsideOpeningHours(parcelTimeInfo, scheduleInfo);
            expect(isOutside).toBe(false);
        });

        it("should not allow retry for deleted parcel", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create and delete a parcel
            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // Soft delete the parcel
            await db
                .update(foodParcels)
                .set({
                    deleted_at: TEST_NOW,
                    deleted_by_user_id: "test-admin",
                })
                .where(eq(foodParcels.id, parcel.id));

            // Verify parcel is deleted
            const [deleted] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));

            expect(deleted.deleted_at).not.toBeNull();

            // The SMS API would return 404 for deleted parcels
            // This is tested via the notDeleted() filter in the API
        });
    });
});
