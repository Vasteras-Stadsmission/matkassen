/**
 * Integration tests for schedule audit logging.
 *
 * Verifies that create/update/delete schedule mutations write correct
 * audit log entries with username, action type, and changes summary.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestLocationWithSchedule,
    createTestPickupLocation,
    resetLocationCounter,
} from "../../factories";
import {
    scheduleAuditLog,
    pickupLocationSchedules,
    pickupLocationScheduleDays,
    pickupLocations,
} from "@/app/db/schema";
import { eq } from "drizzle-orm";

// Mock auth with a known username for audit trail verification
type MockSession = { user: { githubUsername: string; name: string; role: "admin" } };
const mockSession: MockSession = {
    user: { githubUsername: "audit-test-user", name: "Audit Test", role: "admin" },
};

vi.mock("@/app/utils/auth/protected-action", () => ({
    protectedAdminAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => {
            return fn(mockSession, ...args);
        };
    },
    protectedReadAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => {
            return fn(mockSession, ...args);
        };
    },
    protectedAgreementReadAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => {
            return fn(mockSession, ...args);
        };
    },
    protectedAgreementAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => {
            return fn(mockSession, ...args);
        };
    },
}));

// Mock next/headers for locale
vi.mock("next/headers", () => ({
    headers: vi.fn().mockResolvedValue(new Map([["x-locale", "sv"]])),
}));

// Mock next/cache for revalidatePath
vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

// Import after mocks
import {
    createSchedule,
    updateSchedule,
    deleteSchedule,
} from "@/app/[locale]/handout-locations/actions";

describe("Schedule Audit Logging - Integration Tests", () => {
    beforeEach(() => {
        resetLocationCounter();
    });

    describe("createSchedule", () => {
        it("should write audit log entry with action 'created'", async () => {
            const db = await getTestDb();
            const location = await createTestPickupLocation();

            const result = await createSchedule(location.id, {
                name: "Winter Schedule",
                start_date: new Date("2024-07-01"),
                end_date: new Date("2024-12-31"),
                days: [
                    {
                        weekday: "monday",
                        is_open: true,
                        opening_time: "09:00",
                        closing_time: "17:00",
                    },
                    { weekday: "tuesday", is_open: false },
                ],
            });

            expect(result.success).toBe(true);

            // Check audit log
            const logs = await db
                .select()
                .from(scheduleAuditLog)
                .where(eq(scheduleAuditLog.pickup_location_id, location.id));

            expect(logs).toHaveLength(1);
            expect(logs[0].action).toBe("created");
            expect(logs[0].changed_by).toBe("audit-test-user");
            expect(logs[0].schedule_id).toBeDefined();
            expect(logs[0].changes_summary).toContain("Winter Schedule");
        });

        it("should set created_by on the schedule itself", async () => {
            const db = await getTestDb();
            const location = await createTestPickupLocation();

            const result = await createSchedule(location.id, {
                name: "Test",
                start_date: new Date("2024-07-01"),
                end_date: new Date("2024-12-31"),
                days: [],
            });

            expect(result.success).toBe(true);

            const schedules = await db
                .select()
                .from(pickupLocationSchedules)
                .where(eq(pickupLocationSchedules.pickup_location_id, location.id));

            expect(schedules).toHaveLength(1);
            expect(schedules[0].created_by).toBe("audit-test-user");
            expect(schedules[0].created_at).toBeDefined();
        });
    });

    describe("updateSchedule", () => {
        it("should write audit log with changes summary for time changes", async () => {
            const db = await getTestDb();
            const { location, schedule } = await createTestLocationWithSchedule(
                {},
                { openingTime: "09:00", closingTime: "17:00", weekdays: ["monday", "tuesday"] },
            );

            // Update: change Monday hours and close Tuesday
            const result = await updateSchedule(schedule.id, {
                name: "Updated Schedule",
                start_date: new Date(schedule.start_date),
                end_date: new Date(schedule.end_date),
                days: [
                    {
                        weekday: "monday",
                        is_open: true,
                        opening_time: "10:00",
                        closing_time: "14:00",
                    },
                    { weekday: "tuesday", is_open: false },
                ],
            });

            expect(result.success).toBe(true);

            // Check audit log
            const logs = await db
                .select()
                .from(scheduleAuditLog)
                .where(eq(scheduleAuditLog.schedule_id, schedule.id));

            expect(logs).toHaveLength(1);
            expect(logs[0].action).toBe("updated");
            expect(logs[0].changed_by).toBe("audit-test-user");
            // Should mention the time change
            expect(logs[0].changes_summary).toBeDefined();
        });

        it("should set updated_by and updated_at on the schedule", async () => {
            const db = await getTestDb();
            const { location, schedule } = await createTestLocationWithSchedule();

            await updateSchedule(schedule.id, {
                name: "New Name",
                start_date: new Date(schedule.start_date),
                end_date: new Date(schedule.end_date),
                days: [],
            });

            const [updated] = await db
                .select()
                .from(pickupLocationSchedules)
                .where(eq(pickupLocationSchedules.id, schedule.id));

            expect(updated.updated_by).toBe("audit-test-user");
            expect(updated.updated_at).toBeDefined();
        });
    });

    describe("deleteSchedule", () => {
        it("should write audit log entry before deletion", async () => {
            const db = await getTestDb();
            const { location, schedule } = await createTestLocationWithSchedule();

            const result = await deleteSchedule(schedule.id);

            expect(result.success).toBe(true);

            // Schedule should be deleted
            const schedules = await db
                .select()
                .from(pickupLocationSchedules)
                .where(eq(pickupLocationSchedules.id, schedule.id));
            expect(schedules).toHaveLength(0);

            // Audit log should exist (schedule_id is plain text, not FK)
            const logs = await db
                .select()
                .from(scheduleAuditLog)
                .where(eq(scheduleAuditLog.schedule_id, schedule.id));

            expect(logs).toHaveLength(1);
            expect(logs[0].action).toBe("deleted");
            expect(logs[0].changed_by).toBe("audit-test-user");
            expect(logs[0].pickup_location_id).toBe(location.id);
        });

        it("should preserve audit log after schedule is gone", async () => {
            const db = await getTestDb();
            const { location, schedule } = await createTestLocationWithSchedule();

            await deleteSchedule(schedule.id);

            // The audit log references the deleted schedule's ID as plain text
            const logs = await db
                .select()
                .from(scheduleAuditLog)
                .where(eq(scheduleAuditLog.pickup_location_id, location.id));

            expect(logs.length).toBeGreaterThanOrEqual(1);
            const deleteLog = logs.find(l => l.action === "deleted");
            expect(deleteLog).toBeDefined();
            expect(deleteLog!.schedule_id).toBe(schedule.id);
        });
    });

    describe("location deletion", () => {
        it("should preserve audit log after parent location is deleted", async () => {
            // Regression test: pickup_location_id used to be a cascading FK,
            // which wiped audit history when a location was deleted, defeating
            // the design intent of using plain-text schedule_id to preserve
            // history. Both columns are now plain text.
            const db = await getTestDb();
            const location = await createTestPickupLocation();

            // Create a schedule via the action so we get a real audit row
            const createResult = await createSchedule(location.id, {
                name: "Schedule to outlive its location",
                start_date: new Date("2024-07-01"),
                end_date: new Date("2024-12-31"),
                days: [
                    {
                        weekday: "monday",
                        is_open: true,
                        opening_time: "09:00",
                        closing_time: "17:00",
                    },
                ],
            });
            expect(createResult.success).toBe(true);

            // Sanity: audit row exists before location deletion
            const beforeLogs = await db
                .select()
                .from(scheduleAuditLog)
                .where(eq(scheduleAuditLog.pickup_location_id, location.id));
            expect(beforeLogs).toHaveLength(1);
            expect(beforeLogs[0].action).toBe("created");

            // Delete the location directly. Schedules and schedule_days
            // cascade away, but the audit log must NOT.
            await db.delete(pickupLocations).where(eq(pickupLocations.id, location.id));

            // Schedules are gone (cascade)
            const remainingSchedules = await db
                .select()
                .from(pickupLocationSchedules)
                .where(eq(pickupLocationSchedules.pickup_location_id, location.id));
            expect(remainingSchedules).toHaveLength(0);

            // Audit log survives — this is the regression we're guarding
            const afterLogs = await db
                .select()
                .from(scheduleAuditLog)
                .where(eq(scheduleAuditLog.pickup_location_id, location.id));
            expect(afterLogs).toHaveLength(1);
            expect(afterLogs[0].action).toBe("created");
            expect(afterLogs[0].changed_by).toBe("audit-test-user");
        });
    });
});
