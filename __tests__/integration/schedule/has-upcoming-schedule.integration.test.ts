/**
 * Integration tests for the hasUpcomingSchedule computed field in getPickupLocations.
 *
 * The hasUpcomingSchedule field checks if a location has any active or future schedule
 * with at least one open day. This is used to display warnings to admins when a location
 * has no upcoming opening hours.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestPickupLocation,
    createTestLocationWithSchedule,
    createTestLocationWithCustomSchedule,
    resetLocationCounter,
} from "../../factories";
import { pickupLocationSchedules, pickupLocationScheduleDays } from "@/app/db/schema";

// Mock the auth to allow the action to run
vi.mock("@/app/utils/auth/server-action-auth", () => ({
    verifyServerActionAuth: vi.fn(() =>
        Promise.resolve({
            success: true,
            data: { user: { githubUsername: "test-admin" } },
        }),
    ),
}));

// Import actions dynamically so mocks are applied first
const getActions = async () => {
    const { getPickupLocations } = await import("@/app/[locale]/schedule/actions");
    return { getPickupLocations };
};

// Helper to create date strings relative to today
const today = new Date();
const formatDate = (date: Date) => date.toISOString().split("T")[0];
const daysFromNow = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return formatDate(d);
};

describe("getPickupLocations - hasUpcomingSchedule field", () => {
    beforeEach(() => {
        resetLocationCounter();
    });

    it("returns hasUpcomingSchedule=false when location has no schedules", async () => {
        await createTestPickupLocation({ name: "No Schedule Location" });
        const { getPickupLocations } = await getActions();

        const locations = await getPickupLocations();

        const location = locations.find(l => l.name === "No Schedule Location");
        expect(location).toBeDefined();
        expect(location!.hasUpcomingSchedule).toBe(false);
    });

    it("returns hasUpcomingSchedule=false when all schedules have expired", async () => {
        const db = await getTestDb();
        const location = await createTestPickupLocation({ name: "Expired Schedule Location" });

        // Create a schedule that ended in the past
        const [schedule] = await db
            .insert(pickupLocationSchedules)
            .values({
                pickup_location_id: location.id,
                name: "Past Schedule",
                start_date: daysFromNow(-30),
                end_date: daysFromNow(-1), // Ended yesterday
            })
            .returning();

        // Add open days to the expired schedule
        await db.insert(pickupLocationScheduleDays).values({
            schedule_id: schedule.id,
            weekday: "monday",
            is_open: true,
            opening_time: "09:00",
            closing_time: "17:00",
        });

        const { getPickupLocations } = await getActions();
        const locations = await getPickupLocations();

        const foundLocation = locations.find(l => l.name === "Expired Schedule Location");
        expect(foundLocation).toBeDefined();
        expect(foundLocation!.hasUpcomingSchedule).toBe(false);
    });

    it("returns hasUpcomingSchedule=false when schedule exists but all days are closed", async () => {
        // Create location with a schedule where all days are marked as closed
        await createTestLocationWithCustomSchedule(
            { name: "All Days Closed Location" },
            {
                name: "All Closed Schedule",
                startDate: daysFromNow(0),
                endDate: daysFromNow(30),
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

        const { getPickupLocations } = await getActions();
        const locations = await getPickupLocations();

        const location = locations.find(l => l.name === "All Days Closed Location");
        expect(location).toBeDefined();
        expect(location!.hasUpcomingSchedule).toBe(false);
    });

    it("returns hasUpcomingSchedule=true when location has active schedule with open days", async () => {
        // Create location with a valid schedule (Mon-Fri open)
        await createTestLocationWithSchedule(
            { name: "Active Schedule Location" },
            {
                startDate: new Date(daysFromNow(-7)), // Started last week
                endDate: new Date(daysFromNow(30)), // Ends in 30 days
                weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
            },
        );

        const { getPickupLocations } = await getActions();
        const locations = await getPickupLocations();

        const location = locations.find(l => l.name === "Active Schedule Location");
        expect(location).toBeDefined();
        expect(location!.hasUpcomingSchedule).toBe(true);
    });

    it("returns hasUpcomingSchedule=true when location has future schedule with open days", async () => {
        // Create location with a schedule that starts in the future
        await createTestLocationWithSchedule(
            { name: "Future Schedule Location" },
            {
                startDate: new Date(daysFromNow(7)), // Starts next week
                endDate: new Date(daysFromNow(37)), // Ends in 37 days
                weekdays: ["saturday", "sunday"],
            },
        );

        const { getPickupLocations } = await getActions();
        const locations = await getPickupLocations();

        const location = locations.find(l => l.name === "Future Schedule Location");
        expect(location).toBeDefined();
        expect(location!.hasUpcomingSchedule).toBe(true);
    });

    it("returns hasUpcomingSchedule=true when schedule ends today", async () => {
        // Edge case: schedule that ends exactly today should still be counted
        await createTestLocationWithSchedule(
            { name: "Ends Today Location" },
            {
                startDate: new Date(daysFromNow(-7)),
                endDate: new Date(daysFromNow(0)), // Ends today
                weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
            },
        );

        const { getPickupLocations } = await getActions();
        const locations = await getPickupLocations();

        const location = locations.find(l => l.name === "Ends Today Location");
        expect(location).toBeDefined();
        expect(location!.hasUpcomingSchedule).toBe(true);
    });

    it("correctly handles multiple locations with different schedule states", async () => {
        // Create multiple locations with different schedule states
        await createTestPickupLocation({ name: "Location No Schedule" });

        await createTestLocationWithSchedule(
            { name: "Location With Active Schedule" },
            {
                startDate: new Date(daysFromNow(-7)),
                endDate: new Date(daysFromNow(30)),
            },
        );

        await createTestLocationWithCustomSchedule(
            { name: "Location All Closed" },
            {
                name: "All Closed",
                startDate: daysFromNow(0),
                endDate: daysFromNow(30),
                days: [
                    { weekday: "monday", is_open: false },
                    { weekday: "tuesday", is_open: false },
                ],
            },
        );

        const { getPickupLocations } = await getActions();
        const locations = await getPickupLocations();

        const noSchedule = locations.find(l => l.name === "Location No Schedule");
        const activeSchedule = locations.find(l => l.name === "Location With Active Schedule");
        const allClosed = locations.find(l => l.name === "Location All Closed");

        expect(noSchedule?.hasUpcomingSchedule).toBe(false);
        expect(activeSchedule?.hasUpcomingSchedule).toBe(true);
        expect(allClosed?.hasUpcomingSchedule).toBe(false);
    });
});
