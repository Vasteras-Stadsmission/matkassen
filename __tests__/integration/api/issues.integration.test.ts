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
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestFailedSms,
    createTestSms,
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
    getTimeProvider,
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

// Import route handler AFTER mocking dependencies
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let GET: typeof import("@/app/api/admin/issues/route").GET;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let GET_COUNT: typeof import("@/app/api/admin/issues/count/route").GET;

describe("Issues API - Integration Tests", () => {
    beforeAll(async () => {
        // Set mock time provider with TEST_NOW
        originalTimeProvider = getTimeProvider();
        setTimeProvider(new MockTimeProvider(TEST_NOW));

        // Dynamically import the route handler after mocks are set up
        const routeModule = await import("@/app/api/admin/issues/route");
        GET = routeModule.GET;

        const countModule = await import("@/app/api/admin/issues/count/route");
        GET_COUNT = countModule.GET;
    });

    afterAll(async () => {
        // Restore original time provider
        setTimeProvider(originalTimeProvider);
    });

    beforeEach(async () => {
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
                expect(data.counts.unresolvedHandouts).toBe(1);

                // Anonymize the household
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household.id));

                // Verify the unresolved handout is now excluded
                response = await GET();
                data = await response.json();
                expect(data.unresolvedHandouts).toHaveLength(0);
                expect(data.counts.unresolvedHandouts).toBe(0);
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
                // Only open on Monday so Sunday parcels are definitely outside opening hours
                const { location } = await createTestLocationWithSchedule(
                    {},
                    { weekdays: ["monday"], openingTime: "09:00", closingTime: "17:00" },
                );

                // TEST_NOW is Saturday, +1 day is Sunday (future)
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
                expect(data.outsideHours).toHaveLength(1);
                expect(data.outsideHours[0].householdFirstName).toBe("Jane");
                expect(data.counts.outsideHours).toBe(1);

                // Anonymize the household
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household.id));

                // Verify parcels from anonymized household are excluded
                response = await GET();
                data = await response.json();
                expect(data.outsideHours).toHaveLength(0);
                expect(data.counts.outsideHours).toBe(0);
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
                expect(data.counts.failedSms).toBe(1);

                // Anonymize the household
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household.id));

                // Verify the failed SMS is now excluded
                response = await GET();
                data = await response.json();
                expect(data.failedSms).toHaveLength(0);
                expect(data.counts.failedSms).toBe(0);
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
                // Only open on Monday so Sunday parcels are definitely outside opening hours
                const { location } = await createTestLocationWithSchedule(
                    {},
                    { weekdays: ["monday"], openingTime: "09:00", closingTime: "17:00" },
                );

                // Create an unresolved handout (past parcel, no outcome)
                const yesterday = daysFromTestNow(-1);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: yesterday,
                    pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                    is_picked_up: false,
                });

                // Create a future parcel that is outside opening hours (Sunday)
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
                expect(data.unresolvedHandouts).toHaveLength(1);
                expect(data.outsideHours).toHaveLength(1);
                expect(data.failedSms).toHaveLength(1);
                expect(data.counts.total).toBe(3);

                // Anonymize the household
                await db
                    .update(households)
                    .set({ anonymized_at: TEST_NOW })
                    .where(eq(households.id, household.id));

                // Verify all issues are now excluded
                response = await GET();
                data = await response.json();
                expect(data.unresolvedHandouts).toHaveLength(0);
                expect(data.outsideHours).toHaveLength(0);
                expect(data.failedSms).toHaveLength(0);
                expect(data.counts.total).toBe(0);
            });
        });
    });

    describe("SMS Failure Classification", () => {
        it("should classify failures as internal/provider/stale", async () => {
            const household = await createTestHousehold({ first_name: "Fail" });
            const createdAtBase = new Date(TEST_NOW.getTime() - 3 * 60 * 1000);

            await createTestSms({
                household_id: household.id,
                status: "failed",
                created_at: new Date(createdAtBase.getTime() + 0),
            });

            await createTestSms({
                household_id: household.id,
                status: "sent",
                provider_status: "failed",
                sent_at: new Date(TEST_NOW.getTime() - 60 * 60 * 1000),
                created_at: new Date(createdAtBase.getTime() + 1000),
            });

            await createTestSms({
                household_id: household.id,
                status: "sent",
                sent_at: new Date(TEST_NOW.getTime() - 25 * 60 * 60 * 1000),
                created_at: new Date(createdAtBase.getTime() + 2000),
            });

            const response = await GET();
            const data = await response.json();

            expect(data.failedSms).toHaveLength(3);
            expect(data.failedSms.map((s: { failureType: string }) => s.failureType)).toEqual([
                "internal",
                "provider",
                "stale",
            ]);
        });

        it("should redact phone numbers from error messages", async () => {
            const household = await createTestHousehold({ first_name: "Redact" });
            await createTestFailedSms({
                household_id: household.id,
                error_message: "Delivery failed for +46701234567 (070-123 45 67)",
            });

            const response = await GET();
            const data = await response.json();

            expect(data.failedSms).toHaveLength(1);
            expect(data.failedSms[0].errorMessage).toContain("[PHONE REDACTED]");
            expect(data.failedSms[0].errorMessage).not.toContain("+46701234567");
            expect(data.failedSms[0].errorMessage).not.toContain("070-123 45 67");
        });
    });

    describe("Counts", () => {
        it("should return counts larger than the 100-item display limit", async () => {
            const household = await createTestHousehold({ first_name: "Count" });
            const { location } = await createTestLocationWithSchedule();
            const yesterday = daysFromTestNow(-1);

            for (let i = 0; i < 101; i++) {
                const earliest = new Date(yesterday.getTime() + i * 60 * 1000);
                const latest = new Date(earliest.getTime() + 30 * 60 * 1000);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: earliest,
                    pickup_date_time_latest: latest,
                    is_picked_up: false,
                });
            }

            const response = await GET();
            const data = await response.json();

            expect(data.unresolvedHandouts).toHaveLength(100);
            expect(data.counts.unresolvedHandouts).toBe(101);
            expect(data.counts.total).toBe(101);
        });

        it("should match the lightweight count endpoint", async () => {
            const household = await createTestHousehold({ first_name: "Badge" });
            const { location } = await createTestLocationWithSchedule(
                {},
                { weekdays: ["monday"], openingTime: "09:00", closingTime: "17:00" },
            );

            // unresolvedHandouts
            const yesterday = daysFromTestNow(-1);
            await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: yesterday,
                pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                is_picked_up: false,
            });

            // outsideHours (Sunday)
            const tomorrow = daysFromTestNow(1);
            const outsideParcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                is_picked_up: false,
            });

            // failedSms
            await createTestFailedSms({ household_id: household.id, parcel_id: outsideParcel.id });

            const mainResponse = await GET();
            const mainData = await mainResponse.json();

            const countResponse = await GET_COUNT();
            const countData = await countResponse.json();

            expect(countData).toEqual({
                total: mainData.counts.total,
                unresolvedHandouts: mainData.counts.unresolvedHandouts,
                outsideHours: mainData.counts.outsideHours,
                failedSms: mainData.counts.failedSms,
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
            expect(data).toHaveProperty("counts");
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

        it("should include short private cache headers for the count endpoint", async () => {
            const response = await GET_COUNT();
            const cacheControl = response.headers.get("Cache-Control");
            expect(cacheControl).toContain("private");
            expect(cacheControl).toContain("max-age=30");
        });
    });
});
