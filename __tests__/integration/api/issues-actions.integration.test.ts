/**
 * Integration tests for Issues page actions via real API route handlers.
 *
 * These tests call the same route handlers that IssuesPageClient uses, then verify that
 * `/api/admin/issues` reflects the updated state.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
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
import { foodParcels, outgoingSms } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

const ADMIN_USERNAME = "test-admin";

vi.mock("@/app/utils/auth/api-auth", () => ({
    authenticateAdminRequest: vi.fn((_options?: unknown) =>
        Promise.resolve({
            success: true,
            session: {
                user: {
                    id: "test-admin-id",
                    role: "admin",
                    githubUsername: ADMIN_USERNAME,
                },
            },
        }),
    ),
}));

// Needed for server actions that use protectedAction() (e.g. softDeleteParcel)
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

// Import handlers AFTER mocks are set up
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let issuesGET: typeof import("@/app/api/admin/issues/route").GET;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let pickupPATCH: typeof import("@/app/api/admin/parcel/[parcelId]/pickup/route").PATCH;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let noShowPATCH: typeof import("@/app/api/admin/parcel/[parcelId]/no-show/route").PATCH;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let parcelDELETE: typeof import("@/app/api/admin/parcel/[parcelId]/route").DELETE;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let dismissPATCH: typeof import("@/app/api/admin/sms/[smsId]/dismiss/route").PATCH;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let parcelSmsPOST: typeof import("@/app/api/admin/sms/parcel/[parcelId]/route").POST;

function makeRequest(url: string, init?: RequestInit): NextRequest {
    return new Request(url, init) as unknown as NextRequest;
}

async function getIssues() {
    const response = await issuesGET();
    expect(response.status).toBe(200);
    return response.json();
}

describe("Issues actions - Route handler integration", () => {
    beforeAll(async () => {
        ({ GET: issuesGET } = await import("@/app/api/admin/issues/route"));
        ({ PATCH: pickupPATCH } = await import("@/app/api/admin/parcel/[parcelId]/pickup/route"));
        ({ PATCH: noShowPATCH } = await import("@/app/api/admin/parcel/[parcelId]/no-show/route"));
        ({ DELETE: parcelDELETE } = await import("@/app/api/admin/parcel/[parcelId]/route"));
        ({ PATCH: dismissPATCH } = await import("@/app/api/admin/sms/[smsId]/dismiss/route"));
        ({ POST: parcelSmsPOST } = await import("@/app/api/admin/sms/parcel/[parcelId]/route"));
    });

    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
    });

    describe("Mark As Picked Up", () => {
        it("should remove parcel from unresolved handouts", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({ first_name: "Pickup" });
            const { location } = await createTestLocationWithSchedule();
            const yesterday = daysFromTestNow(-1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: yesterday,
                pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                is_picked_up: false,
            });

            const before = await getIssues();
            expect(
                before.unresolvedHandouts.map((p: { parcelId: string }) => p.parcelId),
            ).toContain(parcel.id);

            const response = await pickupPATCH(
                makeRequest(`http://localhost/api/admin/parcel/${parcel.id}/pickup`, {
                    method: "PATCH",
                }),
                { params: Promise.resolve({ parcelId: parcel.id }) },
            );
            expect(response.status).toBe(200);

            const payload = await response.json();
            expect(payload.success).toBe(true);

            const [updated] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));
            expect(updated.is_picked_up).toBe(true);
            expect(updated.picked_up_by_user_id).toBe(ADMIN_USERNAME);
            expect(updated.no_show_at).toBeNull();
            expect(updated.no_show_by_user_id).toBeNull();

            const after = await getIssues();
            expect(
                after.unresolvedHandouts.map((p: { parcelId: string }) => p.parcelId),
            ).not.toContain(parcel.id);
            expect(after.counts.unresolvedHandouts).toBe(0);
        });

        it("should clear no-show fields when marking as picked up", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({ first_name: "NoShowToPickup" });
            const { location } = await createTestLocationWithSchedule();
            const yesterday = daysFromTestNow(-1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: yesterday,
                pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                is_picked_up: false,
            });

            // First mark as no-show via API
            const noShowResponse = await noShowPATCH(
                makeRequest(`http://localhost/api/admin/parcel/${parcel.id}/no-show`, {
                    method: "PATCH",
                }),
                { params: Promise.resolve({ parcelId: parcel.id }) },
            );
            expect(noShowResponse.status).toBe(200);

            const [afterNoShow] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));
            expect(afterNoShow.no_show_at).toBeInstanceOf(Date);
            expect(afterNoShow.no_show_by_user_id).toBe(ADMIN_USERNAME);

            // Now mark as picked up; should clear no-show fields
            const pickupResponse = await pickupPATCH(
                makeRequest(`http://localhost/api/admin/parcel/${parcel.id}/pickup`, {
                    method: "PATCH",
                }),
                { params: Promise.resolve({ parcelId: parcel.id }) },
            );
            expect(pickupResponse.status).toBe(200);

            const [updated] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));
            expect(updated.is_picked_up).toBe(true);
            expect(updated.no_show_at).toBeNull();
            expect(updated.no_show_by_user_id).toBeNull();
        });
    });

    describe("Mark As No-Show", () => {
        it("should remove parcel from unresolved handouts", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({ first_name: "NoShow" });
            const { location } = await createTestLocationWithSchedule();
            const yesterday = daysFromTestNow(-1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: yesterday,
                pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                is_picked_up: false,
            });

            const before = await getIssues();
            expect(
                before.unresolvedHandouts.map((p: { parcelId: string }) => p.parcelId),
            ).toContain(parcel.id);

            const response = await noShowPATCH(
                makeRequest(`http://localhost/api/admin/parcel/${parcel.id}/no-show`, {
                    method: "PATCH",
                }),
                { params: Promise.resolve({ parcelId: parcel.id }) },
            );
            expect(response.status).toBe(200);

            const payload = await response.json();
            expect(payload.success).toBe(true);

            const [updated] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));
            expect(updated.no_show_at).toBeInstanceOf(Date);
            expect(updated.no_show_by_user_id).toBe(ADMIN_USERNAME);

            const after = await getIssues();
            expect(
                after.unresolvedHandouts.map((p: { parcelId: string }) => p.parcelId),
            ).not.toContain(parcel.id);
            expect(after.counts.unresolvedHandouts).toBe(0);
        });

        it("should reject no-show for future parcels (date-only rule)", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({ first_name: "FutureNoShow" });
            const { location } = await createTestLocationWithSchedule();
            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                is_picked_up: false,
            });

            const response = await noShowPATCH(
                makeRequest(`http://localhost/api/admin/parcel/${parcel.id}/no-show`, {
                    method: "PATCH",
                }),
                { params: Promise.resolve({ parcelId: parcel.id }) },
            );
            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.code).toBe("FUTURE_PARCEL");

            const [unchanged] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));
            expect(unchanged.no_show_at).toBeNull();
            expect(unchanged.no_show_by_user_id).toBeNull();
        });
    });

    describe("Cancel Parcel (Outside Opening Hours)", () => {
        it("should soft delete the parcel and remove it from outsideHours issues", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({ first_name: "Cancel" });
            const { location } = await createTestLocationWithSchedule(
                {},
                { weekdays: ["monday"], openingTime: "09:00", closingTime: "17:00" },
            );

            // TEST_NOW is Saturday, +1 day is Sunday (future and outside opening hours)
            const sunday = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: sunday,
                pickup_date_time_latest: new Date(sunday.getTime() + 30 * 60 * 1000),
                is_picked_up: false,
            });

            const before = await getIssues();
            expect(before.outsideHours.map((p: { parcelId: string }) => p.parcelId)).toContain(
                parcel.id,
            );
            expect(before.counts.outsideHours).toBe(1);

            const response = await parcelDELETE(
                makeRequest(`http://localhost/api/admin/parcel/${parcel.id}`, { method: "DELETE" }),
                { params: Promise.resolve({ parcelId: parcel.id }) },
            );
            expect(response.status).toBe(200);

            const payload = await response.json();
            expect(payload.success).toBe(true);
            expect(payload.parcelId).toBe(parcel.id);
            expect(payload.smsCancelled).toBe(false);
            expect(payload.smsSent).toBe(false);

            const [deleted] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));
            expect(deleted.deleted_at).toBeInstanceOf(Date);
            expect(deleted.deleted_by_user_id).toBe(ADMIN_USERNAME);

            const after = await getIssues();
            expect(after.outsideHours.map((p: { parcelId: string }) => p.parcelId)).not.toContain(
                parcel.id,
            );
            expect(after.counts.outsideHours).toBe(0);
        });
    });

    describe("Dismiss Failed SMS", () => {
        it("should remove the SMS from failedSms issues", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({ first_name: "Sms" });
            const sms = await createTestFailedSms({ household_id: household.id });

            const before = await getIssues();
            expect(before.failedSms.map((s: { id: string }) => s.id)).toContain(sms.id);

            const response = await dismissPATCH(
                makeRequest(`http://localhost/api/admin/sms/${sms.id}/dismiss`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dismissed: true }),
                }),
                { params: Promise.resolve({ smsId: sms.id }) },
            );
            expect(response.status).toBe(200);

            const payload = await response.json();
            expect(payload.success).toBe(true);
            expect(payload.smsId).toBe(sms.id);
            expect(payload.dismissed).toBe(true);
            expect(payload.dismissedByUserId).toBe(ADMIN_USERNAME);

            const [updated] = await db.select().from(outgoingSms).where(eq(outgoingSms.id, sms.id));
            expect(updated.dismissed_at).toBeInstanceOf(Date);
            expect(updated.dismissed_by_user_id).toBe(ADMIN_USERNAME);

            const after = await getIssues();
            expect(after.failedSms.map((s: { id: string }) => s.id)).not.toContain(sms.id);
            expect(after.counts.failedSms).toBe(0);
        });

        it("should validate request body", async () => {
            const household = await createTestHousehold({ first_name: "SmsBody" });
            const sms = await createTestFailedSms({ household_id: household.id });

            const response = await dismissPATCH(
                makeRequest(`http://localhost/api/admin/sms/${sms.id}/dismiss`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                }),
                { params: Promise.resolve({ smsId: sms.id }) },
            );

            expect(response.status).toBe(400);
        });
    });

    describe("Retry Failed Parcel SMS", () => {
        it("should allow resending and then dismissing the original failure", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({ first_name: "Retry" });
            const { location } = await createTestLocationWithSchedule(
                {},
                { weekdays: ["sunday"], openingTime: "09:00", closingTime: "17:00" },
            );

            // TEST_NOW is Saturday, +1 day is Sunday (future and within opening hours)
            const sunday = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: sunday,
                pickup_date_time_latest: new Date(sunday.getTime() + 30 * 60 * 1000),
                is_picked_up: false,
            });

            // Existing failure older than the 5-minute cooldown
            const originalFailure = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                status: "failed",
                attempt_count: 3,
                last_error_message: "Test error",
                created_at: new Date(TEST_NOW.getTime() - 6 * 60 * 1000),
            });

            const resendResponse = await parcelSmsPOST(
                makeRequest(`http://localhost/api/admin/sms/parcel/${parcel.id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "resend" }),
                }),
                { params: Promise.resolve({ parcelId: parcel.id }) },
            );

            expect(resendResponse.status).toBe(200);
            const resendPayload = await resendResponse.json();
            expect(resendPayload.success).toBe(true);
            expect(typeof resendPayload.smsId).toBe("string");

            const dismissResponse = await dismissPATCH(
                makeRequest(`http://localhost/api/admin/sms/${originalFailure.id}/dismiss`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dismissed: true }),
                }),
                { params: Promise.resolve({ smsId: originalFailure.id }) },
            );
            expect(dismissResponse.status).toBe(200);

            const [dismissedRow] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, originalFailure.id));
            expect(dismissedRow.dismissed_at).toBeInstanceOf(Date);

            const after = await getIssues();
            expect(after.failedSms).toHaveLength(0);
            expect(after.counts.failedSms).toBe(0);
        });
    });
});
