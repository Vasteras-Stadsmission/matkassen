/**
 * Integration tests for test data factories.
 *
 * Verifies that all factories work correctly with PGlite
 * and that relationships between entities are properly established.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../db/test-db";
import {
    createTestHousehold,
    createTestHouseholdWithMembers,
    resetHouseholdCounter,
} from "../factories/household.factory";
import {
    createTestPickupLocation,
    createTestLocationWithSchedule,
    resetLocationCounter,
} from "../factories/pickup-location.factory";
import {
    createTestParcel,
    createTestParcelForToday,
    createTestDeletedParcel,
    createTestPickedUpParcel,
} from "../factories/food-parcel.factory";
import { createTestUser, createTestUserWithFavoriteLocation, resetUserCounter } from "../factories/user.factory";
import {
    createTestSms,
    createTestSentSms,
    createTestFailedSms,
    resetSmsCounter,
} from "../factories/sms.factory";
import {
    households,
    householdMembers,
    pickupLocationScheduleDays,
} from "@/app/db/schema";
import { eq } from "drizzle-orm";

describe("Test Data Factories", () => {
    beforeEach(() => {
        // Reset counters to ensure predictable phone numbers/usernames
        resetHouseholdCounter();
        resetLocationCounter();
        resetUserCounter();
        resetSmsCounter();
    });

    describe("Household Factory", () => {
        it("should create a household with default values", async () => {
            const household = await createTestHousehold();

            expect(household.id).toBeDefined();
            expect(household.first_name).toBe("Test1");
            expect(household.last_name).toBe("User1");
            expect(household.phone_number).toBe("+46700000001");
            expect(household.locale).toBe("sv");
            expect(household.postal_code).toBe("72345");
        });

        it("should create households with unique phone numbers", async () => {
            const h1 = await createTestHousehold();
            const h2 = await createTestHousehold();
            const h3 = await createTestHousehold();

            expect(h1.phone_number).toBe("+46700000001");
            expect(h2.phone_number).toBe("+46700000002");
            expect(h3.phone_number).toBe("+46700000003");
        });

        it("should allow overriding default values", async () => {
            const household = await createTestHousehold({
                first_name: "Custom",
                last_name: "Name",
                locale: "en",
            });

            expect(household.first_name).toBe("Custom");
            expect(household.last_name).toBe("Name");
            expect(household.locale).toBe("en");
        });

        it("should create household with members", async () => {
            const household = await createTestHouseholdWithMembers({}, [
                { age: 35, sex: "male" },
                { age: 32, sex: "female" },
                { age: 5, sex: "other" },
            ]);

            const db = await getTestDb();
            const members = await db
                .select()
                .from(householdMembers)
                .where(eq(householdMembers.household_id, household.id));

            expect(members).toHaveLength(3);
            expect(members.map(m => m.age).sort((a, b) => a - b)).toEqual([5, 32, 35]);
        });
    });

    describe("Pickup Location Factory", () => {
        it("should create a pickup location with default values", async () => {
            const location = await createTestPickupLocation();

            expect(location.id).toBeDefined();
            expect(location.name).toBe("Test Location 1");
            expect(location.street_address).toBe("Test Street 1");
            expect(location.postal_code).toBe("72345");
            expect(location.default_slot_duration_minutes).toBe(15);
            expect(location.max_parcels_per_slot).toBe(4);
        });

        it("should create location with schedule and weekday hours", async () => {
            const { location, schedule } = await createTestLocationWithSchedule();

            expect(location.id).toBeDefined();
            expect(schedule.id).toBeDefined();
            expect(schedule.pickup_location_id).toBe(location.id);

            const db = await getTestDb();
            const days = await db
                .select()
                .from(pickupLocationScheduleDays)
                .where(eq(pickupLocationScheduleDays.schedule_id, schedule.id));

            // Default is Mon-Fri
            expect(days).toHaveLength(5);
            // Time is returned as HH:MM:SS format from PostgreSQL
            expect(days.every(d => d.opening_time?.startsWith("09:00"))).toBe(true);
            expect(days.every(d => d.closing_time?.startsWith("17:00"))).toBe(true);
        });

        it("should allow custom schedule options", async () => {
            const { location, schedule } = await createTestLocationWithSchedule(
                {},
                {
                    weekdays: ["saturday", "sunday"],
                    openingTime: "10:00",
                    closingTime: "14:00",
                },
            );

            const db = await getTestDb();
            const days = await db
                .select()
                .from(pickupLocationScheduleDays)
                .where(eq(pickupLocationScheduleDays.schedule_id, schedule.id));

            expect(days).toHaveLength(2);
            expect(days.map(d => d.weekday).sort()).toEqual(["saturday", "sunday"]);
            expect(days.every(d => d.opening_time?.startsWith("10:00"))).toBe(true);
        });
    });

    describe("Food Parcel Factory", () => {
        it("should create a parcel with required relationships", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });

            expect(parcel.id).toBeDefined();
            expect(parcel.household_id).toBe(household.id);
            expect(parcel.pickup_location_id).toBe(location.id);
            expect(parcel.is_picked_up).toBe(false);
            expect(parcel.deleted_at).toBeNull();
        });

        it("should create a soft-deleted parcel", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const parcel = await createTestDeletedParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });

            expect(parcel.deleted_at).not.toBeNull();
            expect(parcel.deleted_by_user_id).toBe("test-admin");
        });

        it("should create a picked-up parcel", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const parcel = await createTestPickedUpParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });

            expect(parcel.is_picked_up).toBe(true);
            expect(parcel.picked_up_at).not.toBeNull();
            expect(parcel.picked_up_by_user_id).toBe("test-admin");
        });

        it("should allow duplicate deleted parcels (partial unique index)", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const timestamp = new Date(Date.now() + 24 * 60 * 60 * 1000);

            // Create and delete first parcel
            const parcel1 = await createTestDeletedParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: timestamp,
                pickup_date_time_latest: new Date(timestamp.getTime() + 30 * 60 * 1000),
            });

            // Create second parcel with same slot (should work because first is deleted)
            const parcel2 = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: timestamp,
                pickup_date_time_latest: new Date(timestamp.getTime() + 30 * 60 * 1000),
            });

            expect(parcel1.id).not.toBe(parcel2.id);
            expect(parcel1.deleted_at).not.toBeNull();
            expect(parcel2.deleted_at).toBeNull();
        });
    });

    describe("User Factory", () => {
        it("should create a user with default values", async () => {
            const user = await createTestUser();

            expect(user.id).toBeDefined();
            expect(user.github_username).toBe("testuser1");
            expect(user.display_name).toBe("Test User 1");
            expect(user.avatar_url).toContain("avatars.githubusercontent.com");
        });

        it("should create user with favorite location", async () => {
            const { location } = await createTestLocationWithSchedule();
            const user = await createTestUserWithFavoriteLocation(location.id);

            expect(user.favorite_pickup_location_id).toBe(location.id);
        });
    });

    describe("SMS Factory", () => {
        it("should create an SMS with required relationships", async () => {
            const household = await createTestHousehold();

            const sms = await createTestSms({
                household_id: household.id,
            });

            expect(sms.id).toBeDefined();
            expect(sms.household_id).toBe(household.id);
            expect(sms.intent).toBe("pickup_reminder");
            expect(sms.status).toBe("queued");
        });

        it("should create SMS linked to parcel", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });

            const sms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
            });

            expect(sms.parcel_id).toBe(parcel.id);
        });

        it("should create sent SMS with timestamp", async () => {
            const household = await createTestHousehold();

            const sms = await createTestSentSms({
                household_id: household.id,
            });

            expect(sms.status).toBe("sent");
            expect(sms.sent_at).not.toBeNull();
            expect(sms.attempt_count).toBe(1);
        });

        it("should create failed SMS with error message", async () => {
            const household = await createTestHousehold();

            const sms = await createTestFailedSms({
                household_id: household.id,
                error_message: "Network timeout",
            });

            expect(sms.status).toBe("failed");
            expect(sms.last_error_message).toBe("Network timeout");
            expect(sms.attempt_count).toBe(3);
        });
    });

    describe("Complex Scenarios", () => {
        it("should create a complete household scenario", async () => {
            // Create a household with members
            const household = await createTestHouseholdWithMembers(
                { first_name: "Anna", last_name: "Svensson" },
                [
                    { age: 40, sex: "female" },
                    { age: 8, sex: "male" },
                ],
            );

            // Create a location with schedule
            const { location } = await createTestLocationWithSchedule({
                name: "Stadsmission Västerås",
            });

            // Create a parcel for pickup
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });

            // Create a user who will process it
            const user = await createTestUserWithFavoriteLocation(location.id, {
                github_username: "volunteer1",
            });

            // Create the reminder SMS
            const sms = await createTestSentSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
            });

            // Verify everything was created
            expect(household.first_name).toBe("Anna");
            expect(location.name).toBe("Stadsmission Västerås");
            expect(parcel.household_id).toBe(household.id);
            expect(user.favorite_pickup_location_id).toBe(location.id);
            expect(sms.status).toBe("sent");
        });
    });
});
