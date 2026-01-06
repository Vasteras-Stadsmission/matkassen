/**
 * Integration tests for server-side schedule validation in handout locations.
 *
 * Regression: schedules with no open days must be rejected on save (server action),
 * not just blocked in the client form.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../db/test-db";
import {
    createTestPickupLocation,
    createTestLocationWithSchedule,
    resetLocationCounter,
} from "../../factories";
import { TEST_NOW, daysFromTestNow } from "../../test-time";
import { pickupLocationSchedules, pickupLocationScheduleDays } from "@/app/db/schema";
import type { ScheduleInput, Weekday } from "@/app/[locale]/handout-locations/types";

const ADMIN_USERNAME = "test-admin";

vi.mock("@/app/utils/auth/server-action-auth", () => ({
    verifyServerActionAuth: vi.fn(() =>
        Promise.resolve({
            success: true,
            data: { user: { githubUsername: ADMIN_USERNAME } },
        }),
    ),
    verifyHouseholdAccess: vi.fn((householdId: string) =>
        Promise.resolve({
            success: true,
            data: { id: householdId, first_name: "Test", last_name: "User" },
        }),
    ),
}));

// Import actions dynamically so mocks are applied first.
const getActions = async () => {
    const { createSchedule, updateSchedule } = await import("@/app/[locale]/handout-locations/actions");
    return { createSchedule, updateSchedule };
};

const ALL_WEEKDAYS: Weekday[] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
];

const makeAllClosedScheduleInput = (overrides: Partial<ScheduleInput> = {}): ScheduleInput => ({
    name: "All Closed",
    start_date: TEST_NOW,
    end_date: daysFromTestNow(7),
    days: ALL_WEEKDAYS.map(weekday => ({
        weekday,
        is_open: false,
        opening_time: "09:00",
        closing_time: "17:00",
    })),
    ...overrides,
});

describe("Handout location schedule actions - no-open-days validation", () => {
    beforeEach(() => {
        resetLocationCounter();
    });

    it("should reject creating a schedule with no open days (regression)", async () => {
        const db = await getTestDb();
        const location = await createTestPickupLocation();
        const { createSchedule } = await getActions();

        const result = await createSchedule(location.id, makeAllClosedScheduleInput());

        expect(result.success).toBe(false);
        if (result.success) return;

        expect(result.error.code).toBe("NO_OPEN_DAYS");
        expect(result.error.field).toBe("days");

        const schedules = await db
            .select()
            .from(pickupLocationSchedules)
            .where(eq(pickupLocationSchedules.pickup_location_id, location.id));
        expect(schedules).toHaveLength(0);
    });

    it("should reject updating a schedule to have no open days and leave data unchanged (regression)", async () => {
        const db = await getTestDb();
        const { schedule } = await createTestLocationWithSchedule();
        const { updateSchedule } = await getActions();

        const result = await updateSchedule(
            schedule.id,
            makeAllClosedScheduleInput({ name: "New Name" }),
        );

        expect(result.success).toBe(false);
        if (result.success) return;

        expect(result.error.code).toBe("NO_OPEN_DAYS");
        expect(result.error.field).toBe("days");

        const [persistedSchedule] = await db
            .select()
            .from(pickupLocationSchedules)
            .where(eq(pickupLocationSchedules.id, schedule.id));
        expect(persistedSchedule).toBeDefined();
        expect(persistedSchedule.name).toBe("Test Schedule");

        const persistedDays = await db
            .select()
            .from(pickupLocationScheduleDays)
            .where(eq(pickupLocationScheduleDays.schedule_id, schedule.id));
        expect(persistedDays.length).toBeGreaterThan(0);
        expect(persistedDays.some(day => day.is_open)).toBe(true);
    });
});

