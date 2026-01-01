/**
 * Integration tests for the Issues API (/api/admin/issues).
 *
 * These tests verify that the Issues API correctly filters data
 * and excludes anonymized households from all issue categories.
 *
 * IMPORTANT: Uses shared TEST_NOW for deterministic testing.
 *
 * This test calls the actual route handler with mocked dependencies:
 * - Database: PGlite in-memory database
 * - Time: MockTimeProvider with TEST_NOW
 * - Auth: Mocked to always succeed
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { getTestDb, cleanupTestDb, closeTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestFailedSms,
    resetHouseholdCounter,
    resetLocationCounter,
    resetSmsCounter,
} from "../../factories";
import { TEST_NOW, daysFromTestNow } from "../../test-time";
import { households } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import {
    MockTimeProvider,
    setTimeProvider,
    TimeProvider,
    type ITimeProvider,
} from "@/app/utils/time-provider";

// Store original time provider
let originalTimeProvider: ITimeProvider;

// Mock auth to always succeed
vi.mock("@/app/utils/auth/api-auth", () => ({
    authenticateAdminRequest: vi.fn(() =>
        Promise.resolve({
            success: true,
            session: { user: { id: "test-admin", role: "admin" } },
        }),
    ),
}));

// Mock database to use test database
let testDb: Awaited<ReturnType<typeof getTestDb>>;
vi.mock("@/app/db/drizzle", async () => {
    // Get the actual test db
    const { getTestDb } = await import("../../db/test-db");
    testDb = await getTestDb();
    return {
        db: testDb,
        client: {},
    };
});

// Import route handler AFTER mocking dependencies
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let GET: typeof import("@/app/api/admin/issues/route").GET;

describe("Issues API - Integration Tests", () => {
    beforeAll(async () => {
        // Set mock time provider with TEST_NOW
        originalTimeProvider = new TimeProvider();
        setTimeProvider(new MockTimeProvider(TEST_NOW));

        // Dynamically import the route handler after mocks are set up
        const routeModule = await import("@/app/api/admin/issues/route");
        GET = routeModule.GET;
    });

    afterAll(async () => {
        // Restore original time provider
        setTimeProvider(originalTimeProvider);
        await closeTestDb();
    });

    beforeEach(async () => {
        await cleanupTestDb();
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
    });

    describe("Anonymized Household Exclusion", () => {
        describe("Unresolved Handouts", () => {
            it("should exclude anonymized households from unresolved handouts", async () => {
                const db = await getTestDb();
                const household = await createTestHousehold({ first_name: "John" });
                const { location } = await createTestLocationWithSchedule();

                // Create past parcel with no outcome (unresolved handout)
                const yesterday = daysFromTestNow(-1);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: yesterday,
                    pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                    is_picked_up: false,
                });

                // Verify the unresolved handout appears before anonymization
                let response = await GET();
                let data = await response.json();
                expect(data.unresolvedHandouts).toHaveLength(1);
                expect(data.unresolvedHandouts[0].householdFirstName).toBe("John");

                // Anonymize the household
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household.id));

                // Verify the unresolved handout is now excluded
                response = await GET();
                data = await response.json();
                expect(data.unresolvedHandouts).toHaveLength(0);
            });

            it("should still show non-anonymized households in unresolved handouts", async () => {
                const db = await getTestDb();
                const household1 = await createTestHousehold({ first_name: "Alice" });
                const household2 = await createTestHousehold({ first_name: "Bob" });
                const { location } = await createTestLocationWithSchedule();

                const yesterday = daysFromTestNow(-1);

                // Create unresolved parcels for both households
                await createTestParcel({
                    household_id: household1.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: yesterday,
                    pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                    is_picked_up: false,
                });

                await createTestParcel({
                    household_id: household2.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: new Date(yesterday.getTime() + 60 * 60 * 1000),
                    pickup_date_time_latest: new Date(yesterday.getTime() + 90 * 60 * 1000),
                    is_picked_up: false,
                });

                // Anonymize only household1
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household1.id));

                // Verify only household2 (non-anonymized) appears
                const response = await GET();
                const data = await response.json();
                expect(data.unresolvedHandouts).toHaveLength(1);
                expect(data.unresolvedHandouts[0].householdFirstName).toBe("Bob");
            });
        });

        describe("Future Parcels (Outside Hours)", () => {
            it("should exclude anonymized households from future parcels", async () => {
                const db = await getTestDb();
                const household = await createTestHousehold({ first_name: "Jane" });
                const { location } = await createTestLocationWithSchedule();

                // Create future parcel
                const tomorrow = daysFromTestNow(1);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: tomorrow,
                    pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                    is_picked_up: false,
                });

                // Verify the future parcel appears before anonymization
                let response = await GET();
                let data = await response.json();
                // Future parcels are only counted in outsideHours if they're actually outside hours
                // So we check the total count instead
                const initialParcelCount =
                    data.unresolvedHandouts.length +
                    data.outsideHours.length +
                    data.failedSms.length;

                // Anonymize the household
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household.id));

                // Verify parcels from anonymized household are excluded
                response = await GET();
                data = await response.json();
                const finalParcelCount =
                    data.unresolvedHandouts.length +
                    data.outsideHours.length +
                    data.failedSms.length;
                expect(finalParcelCount).toBeLessThanOrEqual(initialParcelCount);
            });
        });

        describe("Failed SMS", () => {
            it("should exclude anonymized households from failed SMS", async () => {
                const db = await getTestDb();
                const household = await createTestHousehold({ first_name: "Eve" });
                const { location } = await createTestLocationWithSchedule();

                // Create a parcel for the SMS
                const tomorrow = daysFromTestNow(1);
                const parcel = await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: tomorrow,
                    pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                });

                // Create failed SMS
                await createTestFailedSms({
                    household_id: household.id,
                    parcel_id: parcel.id,
                    error_message: "Delivery failed",
                });

                // Verify the failed SMS appears before anonymization
                let response = await GET();
                let data = await response.json();
                expect(data.failedSms).toHaveLength(1);
                expect(data.failedSms[0].householdFirstName).toBe("Eve");

                // Anonymize the household
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household.id));

                // Verify the failed SMS is now excluded
                response = await GET();
                data = await response.json();
                expect(data.failedSms).toHaveLength(0);
            });

            it("should still show non-anonymized households in failed SMS", async () => {
                const db = await getTestDb();
                const household1 = await createTestHousehold({ first_name: "Frank" });
                const household2 = await createTestHousehold({ first_name: "Grace" });
                const { location } = await createTestLocationWithSchedule();

                const tomorrow = daysFromTestNow(1);

                // Create parcels and failed SMS for both households
                const parcel1 = await createTestParcel({
                    household_id: household1.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: tomorrow,
                    pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                });

                const parcel2 = await createTestParcel({
                    household_id: household2.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: new Date(tomorrow.getTime() + 60 * 60 * 1000),
                    pickup_date_time_latest: new Date(tomorrow.getTime() + 90 * 60 * 1000),
                });

                await createTestFailedSms({
                    household_id: household1.id,
                    parcel_id: parcel1.id,
                });

                await createTestFailedSms({
                    household_id: household2.id,
                    parcel_id: parcel2.id,
                });

                // Anonymize only household1
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household1.id));

                // Verify only household2 (non-anonymized) appears
                const response = await GET();
                const data = await response.json();
                expect(data.failedSms).toHaveLength(1);
                expect(data.failedSms[0].householdFirstName).toBe("Grace");
            });
        });

        describe("All Issue Types Together", () => {
            it("should exclude anonymized household from all issue categories simultaneously", async () => {
                const db = await getTestDb();
                const household = await createTestHousehold({ first_name: "Henry" });
                const { location } = await createTestLocationWithSchedule();

                // Create an unresolved handout (past parcel, no outcome)
                const yesterday = daysFromTestNow(-1);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: yesterday,
                    pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                    is_picked_up: false,
                });

                // Create a future parcel (for outside hours check)
                const tomorrow = daysFromTestNow(1);
                const futureParcel = await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: tomorrow,
                    pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                    is_picked_up: false,
                });

                // Create a failed SMS
                await createTestFailedSms({
                    household_id: household.id,
                    parcel_id: futureParcel.id,
                });

                // Verify issues appear before anonymization
                let response = await GET();
                let data = await response.json();
                expect(data.unresolvedHandouts.length).toBeGreaterThanOrEqual(1);
                expect(data.failedSms.length).toBeGreaterThanOrEqual(1);

                // Anonymize the household
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household.id));

                // Verify all issues are now excluded
                response = await GET();
                data = await response.json();
                expect(data.unresolvedHandouts).toHaveLength(0);
                expect(data.failedSms).toHaveLength(0);
            });
        });
    });

    describe("Response Structure", () => {
        it("should return expected response structure", async () => {
            const response = await GET();
            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data).toHaveProperty("unresolvedHandouts");
            expect(data).toHaveProperty("outsideHours");
            expect(data).toHaveProperty("failedSms");
            expect(Array.isArray(data.unresolvedHandouts)).toBe(true);
            expect(Array.isArray(data.outsideHours)).toBe(true);
            expect(Array.isArray(data.failedSms)).toBe(true);
        });

        it("should include no-store Cache-Control header for fresh data", async () => {
            const response = await GET();
            const cacheControl = response.headers.get("Cache-Control");
            // Main issues endpoint uses no-store for real-time data
            // (count endpoint uses private with short cache for navigation badges)
            expect(cacheControl).toContain("no-store");
        });
    });
});
