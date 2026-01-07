/**
 * Integration tests for opening hours display logic.
 *
 * These tests verify that the hasUpcomingSchedule flag correctly identifies
 * locations that have actual open hours, not just schedules with all days closed.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { getTestDb, cleanupTestDb, closeTestDb, getPgliteInstance } from "../../db/test-db";
import {
    createTestPickupLocation,
    createTestLocationWithSchedule,
    createTestLocationWithCustomSchedule,
    resetLocationCounter,
} from "../../factories/pickup-location.factory";
import { pickupLocationSchedules, pickupLocationScheduleDays } from "@/app/db/schema";
import { TEST_NOW, daysFromTestNow } from "../../test-time";

describe("Opening Hours Display", () => {
    beforeAll(async () => {
        await getTestDb();
    });

    beforeEach(async () => {
        await cleanupTestDb();
        resetLocationCounter();
    });

    afterAll(async () => {
        await closeTestDb();
    });

    // Use TEST_NOW as reference date for consistency
    const TEST_DATE_STR = TEST_NOW.toISOString().split("T")[0]; // "2024-06-15"
    const FUTURE_START = daysFromTestNow(1);
    const FUTURE_END = daysFromTestNow(60);
    const PAST_END = daysFromTestNow(-30);
    const PAST_START = daysFromTestNow(-90);

    /**
     * Helper to query hasUpcomingSchedule for locations using the same SQL logic
     * as getPickupLocations() in app/[locale]/schedule/actions.ts
     *
     * Note: We use raw SQL via getPgliteInstance() because Drizzle's sql template
     * with ${pickupLocations.id} column reference doesn't work correctly in subqueries
     * with PGlite. The production code uses the same SQL pattern with the real PostgreSQL driver.
     */
    async function queryLocationsWithScheduleStatus(currentDateStr: string) {
        const pglite = getPgliteInstance();

        const result = await pglite?.query(`
            SELECT
                pl.id,
                pl.name,
                COUNT(plsd.id) > 0 as "hasUpcomingSchedule"
            FROM pickup_locations pl
            LEFT JOIN pickup_location_schedules pls
                ON pls.pickup_location_id = pl.id
                AND pls.end_date >= '${currentDateStr}'::date
            LEFT JOIN pickup_location_schedule_days plsd
                ON plsd.schedule_id = pls.id
                AND plsd.is_open = true
            GROUP BY pl.id, pl.name
        `);

        return (result?.rows || []) as Array<{
            id: string;
            name: string;
            hasUpcomingSchedule: boolean;
        }>;
    }

    describe("hasUpcomingSchedule detection", () => {
        it("should return true for location with schedule that has open days", async () => {
            // Create a location with a normal schedule (Mon-Fri open)
            // Use explicit dates based on TEST_NOW
            const { location } = await createTestLocationWithSchedule(
                {},
                {
                    startDate: FUTURE_START,
                    endDate: FUTURE_END,
                },
            );

            const result = await queryLocationsWithScheduleStatus(TEST_DATE_STR);
            const locationResult = result.find(l => l.id === location.id);

            expect(locationResult?.hasUpcomingSchedule).toBe(true);
        });

        it("should return false for location with schedule where ALL days are closed", async () => {
            // Create a location with a schedule where all days are closed
            const startDateStr = FUTURE_START.toISOString().split("T")[0];
            const endDateStr = FUTURE_END.toISOString().split("T")[0];

            const { location } = await createTestLocationWithCustomSchedule(
                { name: "All Days Closed Location" },
                {
                    name: "Closed Schedule",
                    startDate: startDateStr,
                    endDate: endDateStr,
                    days: [
                        { weekday: "monday", is_open: false },
                        { weekday: "tuesday", is_open: false },
                        { weekday: "wednesday", is_open: false },
                        { weekday: "thursday", is_open: false },
                        { weekday: "friday", is_open: false },
                        { weekday: "saturday", is_open: false },
                        { weekday: "sunday", is_open: false },
                    ],
                },
            );

            const result = await queryLocationsWithScheduleStatus(TEST_DATE_STR);
            const locationResult = result.find(l => l.id === location.id);

            expect(locationResult?.hasUpcomingSchedule).toBe(false);
        });

        it("should return false for location with no schedule at all", async () => {
            // Create a location without any schedule
            const location = await createTestPickupLocation({ name: "No Schedule Location" });

            const result = await queryLocationsWithScheduleStatus(TEST_DATE_STR);
            const locationResult = result.find(l => l.id === location.id);

            expect(locationResult?.hasUpcomingSchedule).toBe(false);
        });

        it("should return false for location with only past schedules", async () => {
            // Create a location with only past schedules
            const pastStartStr = PAST_START.toISOString().split("T")[0];
            const pastEndStr = PAST_END.toISOString().split("T")[0];

            const { location } = await createTestLocationWithCustomSchedule(
                { name: "Past Schedule Location" },
                {
                    name: "Past Schedule",
                    startDate: pastStartStr,
                    endDate: pastEndStr,
                    days: [
                        {
                            weekday: "monday",
                            is_open: true,
                            opening_time: "09:00",
                            closing_time: "17:00",
                        },
                    ],
                },
            );

            const result = await queryLocationsWithScheduleStatus(TEST_DATE_STR);
            const locationResult = result.find(l => l.id === location.id);

            expect(locationResult?.hasUpcomingSchedule).toBe(false);
        });

        it("should return true when at least one day is open in the schedule", async () => {
            // Create a location with a schedule where only one day is open
            const startDateStr = FUTURE_START.toISOString().split("T")[0];
            const endDateStr = FUTURE_END.toISOString().split("T")[0];

            const { location } = await createTestLocationWithCustomSchedule(
                { name: "One Day Open Location" },
                {
                    name: "Mostly Closed Schedule",
                    startDate: startDateStr,
                    endDate: endDateStr,
                    days: [
                        { weekday: "monday", is_open: false },
                        { weekday: "tuesday", is_open: false },
                        {
                            weekday: "wednesday",
                            is_open: true,
                            opening_time: "10:00",
                            closing_time: "14:00",
                        },
                        { weekday: "thursday", is_open: false },
                        { weekday: "friday", is_open: false },
                        { weekday: "saturday", is_open: false },
                        { weekday: "sunday", is_open: false },
                    ],
                },
            );

            const result = await queryLocationsWithScheduleStatus(TEST_DATE_STR);
            const locationResult = result.find(l => l.id === location.id);

            expect(locationResult?.hasUpcomingSchedule).toBe(true);
        });

        it("should return true when there are multiple schedules and at least one has open days", async () => {
            const db = await getTestDb();
            const location = await createTestPickupLocation({
                name: "Multiple Schedules Location",
            });

            const startDateStr = FUTURE_START.toISOString().split("T")[0];
            const midDateStr = daysFromTestNow(30).toISOString().split("T")[0];
            const endDateStr = FUTURE_END.toISOString().split("T")[0];

            // Create first schedule with all days closed
            const [closedSchedule] = await db
                .insert(pickupLocationSchedules)
                .values({
                    pickup_location_id: location.id,
                    start_date: startDateStr,
                    end_date: midDateStr,
                    name: "Closed Schedule",
                })
                .returning();

            await db.insert(pickupLocationScheduleDays).values([
                { schedule_id: closedSchedule.id, weekday: "monday", is_open: false },
                { schedule_id: closedSchedule.id, weekday: "tuesday", is_open: false },
            ]);

            // Create second schedule with some open days
            const [openSchedule] = await db
                .insert(pickupLocationSchedules)
                .values({
                    pickup_location_id: location.id,
                    start_date: midDateStr,
                    end_date: endDateStr,
                    name: "Open Schedule",
                })
                .returning();

            await db.insert(pickupLocationScheduleDays).values([
                {
                    schedule_id: openSchedule.id,
                    weekday: "monday",
                    is_open: true,
                    opening_time: "09:00",
                    closing_time: "17:00",
                },
            ]);

            const result = await queryLocationsWithScheduleStatus(TEST_DATE_STR);
            const locationResult = result.find(l => l.id === location.id);

            expect(locationResult?.hasUpcomingSchedule).toBe(true);
        });

        it("should return false when schedule has no day configurations at all", async () => {
            const db = await getTestDb();
            const location = await createTestPickupLocation({ name: "Empty Schedule Location" });

            const startDateStr = FUTURE_START.toISOString().split("T")[0];
            const endDateStr = FUTURE_END.toISOString().split("T")[0];

            // Create a schedule without any day configurations
            await db
                .insert(pickupLocationSchedules)
                .values({
                    pickup_location_id: location.id,
                    start_date: startDateStr,
                    end_date: endDateStr,
                    name: "Empty Schedule",
                })
                .returning();

            // Don't add any days to the schedule

            const result = await queryLocationsWithScheduleStatus(TEST_DATE_STR);
            const locationResult = result.find(l => l.id === location.id);

            expect(locationResult?.hasUpcomingSchedule).toBe(false);
        });
    });

    describe("regression: schedule with valid date range but no open days", () => {
        it("should show 'no upcoming hours' warning for schedule with all days closed", async () => {
            /**
             * This test documents the bug that was fixed:
             * A location with a schedule that has a valid date range but ALL days
             * marked as is_open=false was incorrectly showing hasUpcomingSchedule=true
             * because the old query only checked for schedule existence, not open days.
             */
            const startDateStr = FUTURE_START.toISOString().split("T")[0];
            const endDateStr = FUTURE_END.toISOString().split("T")[0];

            const { location } = await createTestLocationWithCustomSchedule(
                { name: "Bug Regression Test Location" },
                {
                    name: "Summer Schedule",
                    startDate: startDateStr,
                    endDate: endDateStr,
                    days: [
                        { weekday: "monday", is_open: false },
                        { weekday: "tuesday", is_open: false },
                        { weekday: "wednesday", is_open: false },
                        { weekday: "thursday", is_open: false },
                        { weekday: "friday", is_open: false },
                    ],
                },
            );

            const result = await queryLocationsWithScheduleStatus(TEST_DATE_STR);
            const locationResult = result.find(l => l.id === location.id);

            // With the bug, this would incorrectly be true
            // After the fix, it should be false
            expect(locationResult?.hasUpcomingSchedule).toBe(false);
        });
    });
});
