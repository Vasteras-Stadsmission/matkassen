import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithCustomSchedule,
    createTestLocationWithSchedule,
    createTestNoShowParcel,
    createTestParcel,
    createTestPickedUpParcel,
    createTestUser,
    resetHouseholdCounter,
    resetLocationCounter,
    resetUserCounter,
} from "../../factories";
import { auditLog, foodParcels } from "@/app/db/schema";
import type { FormData } from "@/app/[locale]/households/enroll/types";
import { stripSwedishPrefix } from "@/app/utils/validation/phone-validation";

vi.mock("@/app/utils/auth/server-action-auth", () => ({
    verifyServerActionAuth: vi.fn(async () => ({
        success: true,
        data: {
            user: {
                id: "test-admin-id",
                githubUsername: "test-admin",
                role: "admin",
            },
        },
    })),
    verifyHouseholdAccess: vi.fn(async (householdId: string) => ({
        success: true,
        data: { id: householdId, first_name: "Test", last_name: "Household" },
    })),
}));

vi.mock("@/app/utils/user-agreement", () => ({
    getCurrentAgreement: vi.fn(async () => null),
    getUserIdByGithubUsername: vi.fn(async () => null),
    hasUserAcceptedAgreement: vi.fn(async () => true),
}));

const mockQueuePickupUpdatedSms = vi.fn(async (_parcelId: string) => ({
    success: true,
    skipped: true,
}));
const mockRecomputeOutsideHoursCount = vi.fn(async (_locationId: string) => 0);

vi.mock("@/app/utils/sms/sms-service", () => ({
    queuePickupUpdatedSms: (parcelId: string) => mockQueuePickupUpdatedSms(parcelId),
}));

vi.mock("@/app/utils/schedule/outside-hours-count", () => ({
    recomputeOutsideHoursCountForLocation: (locationId: string) =>
        mockRecomputeOutsideHoursCount(locationId),
}));

type EditActionsModule = typeof import("@/app/[locale]/households/[id]/edit/actions");
type ParcelActionsModule = typeof import("@/app/[locale]/households/[id]/parcels/actions");

let updateHousehold: EditActionsModule["updateHousehold"];
let updateHouseholdParcels: ParcelActionsModule["updateHouseholdParcels"];

const allWeekdays = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
] as const;

function daysFromNow(days: number): Date {
    const now = new Date();
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function atHour(date: Date, hour: number): Date {
    const next = new Date(date);
    next.setUTCHours(hour, 0, 0, 0);
    return next;
}

function withEnd(start: Date, minutes = 15): { start: Date; end: Date } {
    return {
        start,
        end: new Date(start.getTime() + minutes * 60 * 1000),
    };
}

function weekdayName(
    date: Date,
): "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday" {
    return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
        date.getUTCDay()
    ] as ReturnType<typeof weekdayName>;
}

function buildUpdateData(
    household: Awaited<ReturnType<typeof createTestHousehold>>,
    pickupLocationId: string,
    parcels: FormData["foodParcels"]["parcels"],
): FormData {
    return {
        household: {
            first_name: household.first_name,
            last_name: household.last_name,
            phone_number: stripSwedishPrefix(household.phone_number),
            locale: household.locale,
            primary_pickup_location_id: household.primary_pickup_location_id,
            responsible_user_id: household.responsible_user_id,
        },
        members: [],
        dietaryRestrictions: [],
        additionalNeeds: [],
        pets: [],
        foodParcels: {
            pickupLocationId,
            parcels,
        },
        comments: [],
    };
}

describe("Household parcel scheduling integration", () => {
    beforeAll(async () => {
        const editActions = await import("@/app/[locale]/households/[id]/edit/actions");
        const parcelActions = await import("@/app/[locale]/households/[id]/parcels/actions");
        updateHousehold = editActions.updateHousehold;
        updateHouseholdParcels = parcelActions.updateHouseholdParcels;
    });

    beforeEach(async () => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetUserCounter();
        mockQueuePickupUpdatedSms.mockClear();
        mockRecomputeOutsideHoursCount.mockClear();
        await createTestUser({
            id: "test-admin-id",
            github_username: "test-admin",
        });
    });

    it("adds a new parcel through full household edit when the selected date has capacity", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 15, max_parcels_per_slot: 15 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const slot = withEnd(atHour(daysFromNow(5), 10));
        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    pickupDate: slot.start,
                    pickupEarliestTime: slot.start,
                    pickupLatestTime: slot.end,
                },
            ]),
        );

        expect(result.success).toBe(true);

        const activeParcels = await db
            .select()
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)));

        expect(activeParcels).toHaveLength(1);
        expect(activeParcels[0].pickup_location_id).toBe(location.id);
        expect(activeParcels[0].pickup_date_time_earliest).toEqual(slot.start);
        expect(activeParcels[0].pickup_date_time_latest).toEqual(slot.end);
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
    });

    it("writes household edit audit details with only the fields that changed", async () => {
        const db = await getTestDb();
        const household = await createTestHousehold({ locale: "sv" });

        const updateData = buildUpdateData(household, "", []);
        updateData.household.phone_number = "0700009999";
        updateData.household.sms_consent = true;
        updateData.household.locale = "en";

        const result = await updateHousehold(household.id, updateData);
        expect(result.success).toBe(true);

        const [auditRow] = await db
            .select()
            .from(auditLog)
            .where(eq(auditLog.entity_id, household.id));

        const details = auditRow.details as {
            changes: Record<string, { before: unknown; after: unknown }>;
        };
        expect(auditRow).toMatchObject({
            actor_username: "test-admin",
            entity_type: "household",
            action: "updated",
            summary: "Updated household",
        });
        expect(Object.keys(details.changes).sort()).toEqual(["locale", "phone_number"]);
        expect(details.changes.locale).toEqual({ before: "sv", after: "en" });
        expect(details.changes.phone_number).toEqual({
            before: household.phone_number,
            after: "+46700009999",
        });
        expect(JSON.stringify(details)).not.toContain("comments");
    });

    it("adds a new parcel through the parcel management dialog action", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 15, max_parcels_per_slot: 15 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const slot = withEnd(atHour(daysFromNow(6), 11));
        const result = await updateHouseholdParcels(household.id, {
            pickupLocationId: location.id,
            parcels: [
                {
                    pickupDate: slot.start,
                    pickupEarliestTime: slot.start,
                    pickupLatestTime: slot.end,
                },
            ],
        });

        expect(result.success).toBe(true);

        const activeParcels = await db
            .select()
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)));

        expect(activeParcels).toHaveLength(1);
        expect(activeParcels[0].pickup_date_time_earliest).toEqual(slot.start);
        expect(activeParcels[0].pickup_date_time_latest).toEqual(slot.end);
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
    });

    it("preserves unchanged future parcels at multiple pickup locations during full household edit", async () => {
        const db = await getTestDb();
        const { location: firstLocation } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 15, max_parcels_per_slot: 15 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const { location: secondLocation } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 15, max_parcels_per_slot: 15 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const { location: newParcelLocation } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 15, max_parcels_per_slot: 15 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: firstLocation.id,
        });

        const firstSlot = withEnd(atHour(daysFromNow(2), 10));
        const secondSlot = withEnd(atHour(daysFromNow(3), 11));
        const firstParcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: firstLocation.id,
            pickup_date_time_earliest: firstSlot.start,
            pickup_date_time_latest: firstSlot.end,
        });
        const secondParcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: secondLocation.id,
            pickup_date_time_earliest: secondSlot.start,
            pickup_date_time_latest: secondSlot.end,
        });

        const newSlot = withEnd(atHour(daysFromNow(5), 12));
        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, newParcelLocation.id, [
                {
                    id: firstParcel.id,
                    pickupLocationId: firstLocation.id,
                    pickupDate: firstSlot.start,
                    pickupEarliestTime: firstSlot.start,
                    pickupLatestTime: firstSlot.end,
                },
                {
                    id: secondParcel.id,
                    pickupLocationId: secondLocation.id,
                    pickupDate: secondSlot.start,
                    pickupEarliestTime: secondSlot.start,
                    pickupLatestTime: secondSlot.end,
                },
                {
                    pickupLocationId: newParcelLocation.id,
                    pickupDate: newSlot.start,
                    pickupEarliestTime: newSlot.start,
                    pickupLatestTime: newSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(true);

        const activeParcels = await db
            .select()
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)));

        expect(activeParcels).toHaveLength(3);
        expect(activeParcels.find(parcel => parcel.id === firstParcel.id)?.pickup_location_id).toBe(
            firstLocation.id,
        );
        expect(
            activeParcels.find(parcel => parcel.id === secondParcel.id)?.pickup_location_id,
        ).toBe(secondLocation.id);
        expect(
            activeParcels.find(
                parcel => parcel.pickup_date_time_earliest.getTime() === newSlot.start.getTime(),
            )?.pickup_location_id,
        ).toBe(newParcelLocation.id);
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
    });

    it("preserves unchanged future parcels at multiple pickup locations through the parcel dialog action", async () => {
        const db = await getTestDb();
        const { location: firstLocation } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 15, max_parcels_per_slot: 15 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const { location: secondLocation } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 15, max_parcels_per_slot: 15 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const { location: newParcelLocation } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 15, max_parcels_per_slot: 15 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: firstLocation.id,
        });

        const firstSlot = withEnd(atHour(daysFromNow(2), 10));
        const secondSlot = withEnd(atHour(daysFromNow(3), 11));
        const firstParcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: firstLocation.id,
            pickup_date_time_earliest: firstSlot.start,
            pickup_date_time_latest: firstSlot.end,
        });
        const secondParcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: secondLocation.id,
            pickup_date_time_earliest: secondSlot.start,
            pickup_date_time_latest: secondSlot.end,
        });

        const newSlot = withEnd(atHour(daysFromNow(5), 12));
        const result = await updateHouseholdParcels(household.id, {
            pickupLocationId: newParcelLocation.id,
            parcels: [
                {
                    id: firstParcel.id,
                    pickupLocationId: firstLocation.id,
                    pickupDate: firstSlot.start,
                    pickupEarliestTime: firstSlot.start,
                    pickupLatestTime: firstSlot.end,
                },
                {
                    id: secondParcel.id,
                    pickupLocationId: secondLocation.id,
                    pickupDate: secondSlot.start,
                    pickupEarliestTime: secondSlot.start,
                    pickupLatestTime: secondSlot.end,
                },
                {
                    pickupLocationId: newParcelLocation.id,
                    pickupDate: newSlot.start,
                    pickupEarliestTime: newSlot.start,
                    pickupLatestTime: newSlot.end,
                },
            ],
        });

        expect(result.success).toBe(true);

        const activeParcels = await db
            .select()
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)));

        expect(activeParcels).toHaveLength(3);
        expect(activeParcels.find(parcel => parcel.id === firstParcel.id)?.pickup_location_id).toBe(
            firstLocation.id,
        );
        expect(
            activeParcels.find(parcel => parcel.id === secondParcel.id)?.pickup_location_id,
        ).toBe(secondLocation.id);
        expect(
            activeParcels.find(
                parcel => parcel.pickup_date_time_earliest.getTime() === newSlot.start.getTime(),
            )?.pickup_location_id,
        ).toBe(newParcelLocation.id);
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("preserves the parcel id when full household edit moves a parcel to another date and location", async () => {
        const db = await getTestDb();
        const { location: oldLocation } = await createTestLocationWithSchedule(
            {},
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const { location: newLocation } = await createTestLocationWithSchedule(
            {},
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: oldLocation.id,
        });

        const originalSlot = withEnd(atHour(daysFromNow(2), 10));
        const parcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: oldLocation.id,
            pickup_date_time_earliest: originalSlot.start,
            pickup_date_time_latest: originalSlot.end,
        });

        const movedSlot = withEnd(atHour(daysFromNow(3), 11));
        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, newLocation.id, [
                {
                    id: parcel.id,
                    pickupDate: movedSlot.start,
                    pickupEarliestTime: movedSlot.start,
                    pickupLatestTime: movedSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(true);

        const activeParcels = await db
            .select()
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)));

        expect(activeParcels).toHaveLength(1);
        expect(activeParcels[0].id).toBe(parcel.id);
        expect(activeParcels[0].pickup_location_id).toBe(newLocation.id);
        expect(activeParcels[0].pickup_date_time_earliest).toEqual(movedSlot.start);
        expect(activeParcels[0].pickup_date_time_latest).toEqual(movedSlot.end);
        expect(activeParcels[0].deleted_at).toBeNull();
        expect(mockQueuePickupUpdatedSms).toHaveBeenCalledWith(parcel.id);
        expect(mockRecomputeOutsideHoursCount).toHaveBeenCalledWith(oldLocation.id);
        expect(mockRecomputeOutsideHoursCount).toHaveBeenCalledWith(newLocation.id);
    });

    it("moves only the changed parcel target location while preserving another future parcel location", async () => {
        const db = await getTestDb();
        const { location: firstLocation } = await createTestLocationWithSchedule(
            {},
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const { location: secondLocation } = await createTestLocationWithSchedule(
            {},
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const { location: targetLocation } = await createTestLocationWithSchedule(
            {},
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: firstLocation.id,
        });

        const originalSlot = withEnd(atHour(daysFromNow(2), 10));
        const unchangedSlot = withEnd(atHour(daysFromNow(4), 11));
        const movedParcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: firstLocation.id,
            pickup_date_time_earliest: originalSlot.start,
            pickup_date_time_latest: originalSlot.end,
        });
        const unchangedParcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: secondLocation.id,
            pickup_date_time_earliest: unchangedSlot.start,
            pickup_date_time_latest: unchangedSlot.end,
        });

        const movedSlot = withEnd(atHour(daysFromNow(3), 12));
        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, targetLocation.id, [
                {
                    id: movedParcel.id,
                    pickupLocationId: targetLocation.id,
                    pickupDate: movedSlot.start,
                    pickupEarliestTime: movedSlot.start,
                    pickupLatestTime: movedSlot.end,
                },
                {
                    id: unchangedParcel.id,
                    pickupLocationId: secondLocation.id,
                    pickupDate: unchangedSlot.start,
                    pickupEarliestTime: unchangedSlot.start,
                    pickupLatestTime: unchangedSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(true);

        const activeParcels = await db
            .select()
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)));

        expect(activeParcels).toHaveLength(2);
        expect(activeParcels.find(parcel => parcel.id === movedParcel.id)).toMatchObject({
            pickup_location_id: targetLocation.id,
            pickup_date_time_earliest: movedSlot.start,
            pickup_date_time_latest: movedSlot.end,
        });
        expect(activeParcels.find(parcel => parcel.id === unchangedParcel.id)).toMatchObject({
            pickup_location_id: secondLocation.id,
            pickup_date_time_earliest: unchangedSlot.start,
            pickup_date_time_latest: unchangedSlot.end,
        });
        expect(mockQueuePickupUpdatedSms).toHaveBeenCalledWith(movedParcel.id);
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalledWith(unchangedParcel.id);
    });

    it("rejects full household edit when the changed parcel would exceed daily capacity", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 1, max_parcels_per_slot: 10 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });
        const otherHousehold = await createTestHousehold();

        const originalSlot = withEnd(atHour(daysFromNow(2), 10));
        const parcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: originalSlot.start,
            pickup_date_time_latest: originalSlot.end,
        });

        const fullDaySlot = withEnd(atHour(daysFromNow(3), 9));
        await createTestParcel({
            household_id: otherHousehold.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: fullDaySlot.start,
            pickup_date_time_latest: fullDaySlot.end,
        });

        const requestedSlot = withEnd(atHour(daysFromNow(3), 11));
        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    id: parcel.id,
                    pickupDate: requestedSlot.start,
                    pickupEarliestTime: requestedSlot.start,
                    pickupLatestTime: requestedSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.validationErrors?.map(error => error.code)).toContain(
                "MAX_DAILY_CAPACITY_REACHED",
            );
        }

        const [unchangedParcel] = await db
            .select()
            .from(foodParcels)
            .where(eq(foodParcels.id, parcel.id));

        expect(unchangedParcel.pickup_date_time_earliest).toEqual(originalSlot.start);
        expect(unchangedParcel.pickup_date_time_latest).toEqual(originalSlot.end);
        expect(unchangedParcel.deleted_at).toBeNull();
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
    });

    it("allows adding a parcel when an unchanged future date is already over daily capacity", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 1, max_parcels_per_slot: 10 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });
        const otherHousehold = await createTestHousehold();

        const overCapacitySlot = withEnd(atHour(daysFromNow(2), 10));
        const existingParcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: overCapacitySlot.start,
            pickup_date_time_latest: overCapacitySlot.end,
        });
        await createTestParcel({
            household_id: otherHousehold.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: withEnd(atHour(daysFromNow(2), 11)).start,
            pickup_date_time_latest: withEnd(atHour(daysFromNow(2), 11)).end,
        });

        const newSlot = withEnd(atHour(daysFromNow(4), 12));
        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    id: existingParcel.id,
                    pickupDate: overCapacitySlot.start,
                    pickupEarliestTime: overCapacitySlot.start,
                    pickupLatestTime: overCapacitySlot.end,
                },
                {
                    pickupDate: newSlot.start,
                    pickupEarliestTime: newSlot.start,
                    pickupLatestTime: newSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(true);

        const activeParcels = await db
            .select()
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)));

        expect(activeParcels).toHaveLength(2);
        expect(activeParcels.some(parcel => parcel.id === existingParcel.id)).toBe(true);
        expect(
            activeParcels.some(
                parcel => parcel.pickup_date_time_earliest.getTime() === newSlot.start.getTime(),
            ),
        ).toBe(true);
    });

    it("allows parcel dialog add when an unchanged future date is already over daily capacity", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 1, max_parcels_per_slot: 10 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });
        const otherHousehold = await createTestHousehold();

        const overCapacitySlot = withEnd(atHour(daysFromNow(2), 10));
        const existingParcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: overCapacitySlot.start,
            pickup_date_time_latest: overCapacitySlot.end,
        });
        const otherSlot = withEnd(atHour(daysFromNow(2), 11));
        await createTestParcel({
            household_id: otherHousehold.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: otherSlot.start,
            pickup_date_time_latest: otherSlot.end,
        });

        const newSlot = withEnd(atHour(daysFromNow(4), 12));
        const result = await updateHouseholdParcels(household.id, {
            pickupLocationId: location.id,
            parcels: [
                {
                    id: existingParcel.id,
                    pickupLocationId: location.id,
                    pickupDate: overCapacitySlot.start,
                    pickupEarliestTime: overCapacitySlot.start,
                    pickupLatestTime: overCapacitySlot.end,
                },
                {
                    pickupLocationId: location.id,
                    pickupDate: newSlot.start,
                    pickupEarliestTime: newSlot.start,
                    pickupLatestTime: newSlot.end,
                },
            ],
        });

        expect(result.success).toBe(true);

        const activeParcels = await db
            .select()
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)));

        expect(activeParcels).toHaveLength(2);
        expect(activeParcels.some(parcel => parcel.id === existingParcel.id)).toBe(true);
        expect(
            activeParcels.some(
                parcel => parcel.pickup_date_time_earliest.getTime() === newSlot.start.getTime(),
            ),
        ).toBe(true);
    });

    it("allows moving a parcel within an over-capacity date when daily count does not increase", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 1, max_parcels_per_slot: 10 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });
        const otherHousehold = await createTestHousehold();

        const originalSlot = withEnd(atHour(daysFromNow(2), 10));
        const parcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: originalSlot.start,
            pickup_date_time_latest: originalSlot.end,
        });
        const otherSlot = withEnd(atHour(daysFromNow(2), 11));
        await createTestParcel({
            household_id: otherHousehold.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: otherSlot.start,
            pickup_date_time_latest: otherSlot.end,
        });

        const movedSlot = withEnd(atHour(daysFromNow(2), 12));
        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    id: parcel.id,
                    pickupDate: movedSlot.start,
                    pickupEarliestTime: movedSlot.start,
                    pickupLatestTime: movedSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(true);

        const [updatedParcel] = await db
            .select()
            .from(foodParcels)
            .where(eq(foodParcels.id, parcel.id));

        expect(updatedParcel.pickup_date_time_earliest).toEqual(movedSlot.start);
        expect(updatedParcel.pickup_date_time_latest).toEqual(movedSlot.end);
        expect(updatedParcel.deleted_at).toBeNull();
        expect(mockQueuePickupUpdatedSms).toHaveBeenCalledWith(parcel.id);
    });

    it("rejects full household edit when two new parcels in the same submission double-book the household", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 15, max_parcels_per_slot: 15 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const firstSlot = withEnd(atHour(daysFromNow(7), 10));
        const secondSlot = withEnd(atHour(daysFromNow(7), 12));
        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    pickupDate: firstSlot.start,
                    pickupEarliestTime: firstSlot.start,
                    pickupLatestTime: firstSlot.end,
                },
                {
                    pickupDate: secondSlot.start,
                    pickupEarliestTime: secondSlot.start,
                    pickupLatestTime: secondSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.validationErrors?.map(error => error.code)).toContain(
                "HOUSEHOLD_DOUBLE_BOOKING",
            );
        }

        const activeParcels = await db
            .select()
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)));

        expect(activeParcels).toHaveLength(0);
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
    });

    it("rejects full household edit when the changed parcel would exceed slot capacity", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            { max_parcels_per_slot: 1, parcels_max_per_day: 10 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });
        const otherHousehold = await createTestHousehold();

        const originalSlot = withEnd(atHour(daysFromNow(2), 10));
        const parcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: originalSlot.start,
            pickup_date_time_latest: originalSlot.end,
        });

        const fullSlot = withEnd(atHour(daysFromNow(3), 11));
        await createTestParcel({
            household_id: otherHousehold.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: fullSlot.start,
            pickup_date_time_latest: fullSlot.end,
        });

        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    id: parcel.id,
                    pickupDate: fullSlot.start,
                    pickupEarliestTime: fullSlot.start,
                    pickupLatestTime: fullSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.validationErrors?.map(error => error.code)).toContain(
                "MAX_SLOT_CAPACITY_REACHED",
            );
        }

        const [unchangedParcel] = await db
            .select()
            .from(foodParcels)
            .where(eq(foodParcels.id, parcel.id));

        expect(unchangedParcel.pickup_date_time_earliest).toEqual(originalSlot.start);
        expect(unchangedParcel.pickup_date_time_latest).toEqual(originalSlot.end);
        expect(unchangedParcel.deleted_at).toBeNull();
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
    });

    it("rolls back updates and deletions when final-state validation fails", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 1, max_parcels_per_slot: 1 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });
        const otherHousehold = await createTestHousehold();

        const keptOriginalSlot = withEnd(atHour(daysFromNow(2), 10));
        const removedOriginalSlot = withEnd(atHour(daysFromNow(4), 11));
        const fullTargetSlot = withEnd(atHour(daysFromNow(3), 12));
        const keptParcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: keptOriginalSlot.start,
            pickup_date_time_latest: keptOriginalSlot.end,
        });
        const removedParcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: removedOriginalSlot.start,
            pickup_date_time_latest: removedOriginalSlot.end,
        });
        await createTestParcel({
            household_id: otherHousehold.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: fullTargetSlot.start,
            pickup_date_time_latest: fullTargetSlot.end,
        });

        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    id: keptParcel.id,
                    pickupDate: fullTargetSlot.start,
                    pickupEarliestTime: fullTargetSlot.start,
                    pickupLatestTime: fullTargetSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.validationErrors?.map(error => error.code)).toContain(
                "MAX_DAILY_CAPACITY_REACHED",
            );
        }

        const [unchangedKeptParcel] = await db
            .select()
            .from(foodParcels)
            .where(eq(foodParcels.id, keptParcel.id));
        const [unchangedRemovedParcel] = await db
            .select()
            .from(foodParcels)
            .where(eq(foodParcels.id, removedParcel.id));

        expect(unchangedKeptParcel.pickup_date_time_earliest).toEqual(keptOriginalSlot.start);
        expect(unchangedKeptParcel.pickup_date_time_latest).toEqual(keptOriginalSlot.end);
        expect(unchangedKeptParcel.deleted_at).toBeNull();
        expect(unchangedRemovedParcel.pickup_date_time_earliest).toEqual(removedOriginalSlot.start);
        expect(unchangedRemovedParcel.pickup_date_time_latest).toEqual(removedOriginalSlot.end);
        expect(unchangedRemovedParcel.deleted_at).toBeNull();
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
        expect(mockRecomputeOutsideHoursCount).not.toHaveBeenCalled();
    });

    it("rejects full household edit when the changed parcel is outside opening hours", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            {},
            {
                startDate: daysFromNow(-1),
                endDate: daysFromNow(30),
                weekdays: [...allWeekdays],
                openingTime: "09:00",
                closingTime: "17:00",
            },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const originalSlot = withEnd(atHour(daysFromNow(2), 10));
        const parcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: originalSlot.start,
            pickup_date_time_latest: originalSlot.end,
        });

        const closedSlot = withEnd(atHour(daysFromNow(3), 20));
        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    id: parcel.id,
                    pickupDate: closedSlot.start,
                    pickupEarliestTime: closedSlot.start,
                    pickupLatestTime: closedSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.validationErrors?.map(error => error.code)).toContain(
                "OUTSIDE_OPERATING_HOURS",
            );
        }

        const [unchangedParcel] = await db
            .select()
            .from(foodParcels)
            .where(eq(foodParcels.id, parcel.id));

        expect(unchangedParcel.pickup_date_time_earliest).toEqual(originalSlot.start);
        expect(unchangedParcel.pickup_date_time_latest).toEqual(originalSlot.end);
        expect(unchangedParcel.deleted_at).toBeNull();
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
    });

    it("allows adding a parcel when an unchanged future parcel is now outside opening hours", async () => {
        const db = await getTestDb();
        const existingDate = daysFromNow(2);
        const newDate = daysFromNow(3);
        const { location } = await createTestLocationWithCustomSchedule(
            {},
            {
                name: "Changed parcel only opening-hours schedule",
                startDate: daysFromNow(-1).toISOString().split("T")[0],
                endDate: daysFromNow(30).toISOString().split("T")[0],
                days: [
                    {
                        weekday: weekdayName(newDate),
                        is_open: true,
                        opening_time: "09:00",
                        closing_time: "17:00",
                    },
                ],
            },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const existingOutsideHoursSlot = withEnd(atHour(existingDate, 10));
        const existingParcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: existingOutsideHoursSlot.start,
            pickup_date_time_latest: existingOutsideHoursSlot.end,
        });

        const newSlot = withEnd(atHour(newDate, 10));
        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    id: existingParcel.id,
                    pickupDate: existingOutsideHoursSlot.start,
                    pickupEarliestTime: existingOutsideHoursSlot.start,
                    pickupLatestTime: existingOutsideHoursSlot.end,
                },
                {
                    pickupDate: newSlot.start,
                    pickupEarliestTime: newSlot.start,
                    pickupLatestTime: newSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(true);

        const activeParcels = await db
            .select()
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)));

        expect(activeParcels).toHaveLength(2);
        expect(activeParcels.some(parcel => parcel.id === existingParcel.id)).toBe(true);
        expect(
            activeParcels.some(
                parcel => parcel.pickup_date_time_earliest.getTime() === newSlot.start.getTime(),
            ),
        ).toBe(true);
    });

    it("allows a parcel slot that starts at opening and ends exactly at closing", async () => {
        const db = await getTestDb();
        const slotDate = daysFromNow(5);
        const { location } = await createTestLocationWithSchedule(
            {},
            {
                startDate: daysFromNow(-1),
                endDate: daysFromNow(30),
                weekdays: [weekdayName(slotDate)],
                openingTime: "09:00",
                closingTime: "17:00",
            },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const start = atHour(slotDate, 7);
        const end = atHour(slotDate, 15);
        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    pickupDate: start,
                    pickupEarliestTime: start,
                    pickupLatestTime: end,
                },
            ]),
        );

        expect(result.success).toBe(true);

        const activeParcels = await db
            .select()
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)));

        expect(activeParcels).toHaveLength(1);
        expect(activeParcels[0].pickup_date_time_earliest).toEqual(start);
        expect(activeParcels[0].pickup_date_time_latest).toEqual(end);
    });

    it("rejects a parcel slot that crosses closing time", async () => {
        const db = await getTestDb();
        const slotDate = daysFromNow(5);
        const { location } = await createTestLocationWithSchedule(
            {},
            {
                startDate: daysFromNow(-1),
                endDate: daysFromNow(30),
                weekdays: [weekdayName(slotDate)],
                openingTime: "09:00",
                closingTime: "17:00",
            },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const originalSlot = withEnd(atHour(daysFromNow(2), 10));
        const parcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: originalSlot.start,
            pickup_date_time_latest: originalSlot.end,
        });
        const crossingStart = atHour(slotDate, 14);
        const crossingEnd = new Date(crossingStart.getTime() + 75 * 60 * 1000);

        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    id: parcel.id,
                    pickupDate: crossingStart,
                    pickupEarliestTime: crossingStart,
                    pickupLatestTime: crossingEnd,
                },
            ]),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.validationErrors?.map(error => error.code)).toContain(
                "OUTSIDE_OPERATING_HOURS",
            );
        }

        const [unchangedParcel] = await db
            .select()
            .from(foodParcels)
            .where(eq(foodParcels.id, parcel.id));

        expect(unchangedParcel.pickup_date_time_earliest).toEqual(originalSlot.start);
        expect(unchangedParcel.pickup_date_time_latest).toEqual(originalSlot.end);
        expect(unchangedParcel.deleted_at).toBeNull();
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
    });

    it("rejects a parcel slot on a closed weekday", async () => {
        const closedDate = daysFromNow(6);
        const { location } = await createTestLocationWithCustomSchedule(
            {},
            {
                name: "Closed weekday schedule",
                startDate: daysFromNow(-1).toISOString().split("T")[0],
                endDate: daysFromNow(30).toISOString().split("T")[0],
                days: [
                    {
                        weekday: weekdayName(closedDate),
                        is_open: false,
                    },
                ],
            },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const slot = withEnd(atHour(closedDate, 10));
        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    pickupDate: slot.start,
                    pickupEarliestTime: slot.start,
                    pickupLatestTime: slot.end,
                },
            ]),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.validationErrors?.map(error => error.code)).toContain(
                "OUTSIDE_OPERATING_HOURS",
            );
        }
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
    });

    it("rejects full household edit when the changed parcel would double-book the household", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            {},
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const originalSlot = withEnd(atHour(daysFromNow(2), 10));
        const parcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: originalSlot.start,
            pickup_date_time_latest: originalSlot.end,
        });

        const existingSlot = withEnd(atHour(daysFromNow(3), 11));
        const existingParcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: existingSlot.start,
            pickup_date_time_latest: existingSlot.end,
        });

        const requestedSlot = withEnd(atHour(daysFromNow(3), 12));
        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    id: parcel.id,
                    pickupDate: requestedSlot.start,
                    pickupEarliestTime: requestedSlot.start,
                    pickupLatestTime: requestedSlot.end,
                },
                {
                    id: existingParcel.id,
                    pickupDate: existingSlot.start,
                    pickupEarliestTime: existingSlot.start,
                    pickupLatestTime: existingSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.validationErrors?.map(error => error.code)).toContain(
                "HOUSEHOLD_DOUBLE_BOOKING",
            );
        }

        const activeParcels = await db
            .select()
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)));

        expect(activeParcels).toHaveLength(2);
        expect(activeParcels.find(activeParcel => activeParcel.id === parcel.id)).toMatchObject({
            pickup_date_time_earliest: originalSlot.start,
            pickup_date_time_latest: originalSlot.end,
        });
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
    });

    it("allows moving one parcel into a date and slot freed by another moved parcel", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 15, max_parcels_per_slot: 1 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const firstOriginalSlot = withEnd(atHour(daysFromNow(8), 10));
        const secondOriginalSlot = withEnd(atHour(daysFromNow(9), 11));
        const firstParcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: firstOriginalSlot.start,
            pickup_date_time_latest: firstOriginalSlot.end,
        });
        const secondParcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: secondOriginalSlot.start,
            pickup_date_time_latest: secondOriginalSlot.end,
        });

        const secondMovedSlot = withEnd(atHour(daysFromNow(10), 12));
        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    id: firstParcel.id,
                    pickupDate: secondOriginalSlot.start,
                    pickupEarliestTime: secondOriginalSlot.start,
                    pickupLatestTime: secondOriginalSlot.end,
                },
                {
                    id: secondParcel.id,
                    pickupDate: secondMovedSlot.start,
                    pickupEarliestTime: secondMovedSlot.start,
                    pickupLatestTime: secondMovedSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(true);

        const activeParcels = await db
            .select()
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)));

        expect(activeParcels).toHaveLength(2);
        expect(
            activeParcels.find(activeParcel => activeParcel.id === firstParcel.id),
        ).toMatchObject({
            pickup_date_time_earliest: secondOriginalSlot.start,
            pickup_date_time_latest: secondOriginalSlot.end,
        });
        expect(
            activeParcels.find(activeParcel => activeParcel.id === secondParcel.id),
        ).toMatchObject({
            pickup_date_time_earliest: secondMovedSlot.start,
            pickup_date_time_latest: secondMovedSlot.end,
        });
        expect(mockQueuePickupUpdatedSms).toHaveBeenCalledWith(firstParcel.id);
        expect(mockQueuePickupUpdatedSms).toHaveBeenCalledWith(secondParcel.id);
    });

    it("allows moving one parcel into a date freed by removing another parcel", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 1, max_parcels_per_slot: 1 },
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const firstOriginalSlot = withEnd(atHour(daysFromNow(11), 10));
        const removedSlot = withEnd(atHour(daysFromNow(12), 11));
        const keptParcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: firstOriginalSlot.start,
            pickup_date_time_latest: firstOriginalSlot.end,
        });
        const removedParcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: removedSlot.start,
            pickup_date_time_latest: removedSlot.end,
        });

        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    id: keptParcel.id,
                    pickupDate: removedSlot.start,
                    pickupEarliestTime: removedSlot.start,
                    pickupLatestTime: removedSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(true);

        const [movedParcel] = await db
            .select()
            .from(foodParcels)
            .where(eq(foodParcels.id, keptParcel.id));
        const [deletedParcel] = await db
            .select()
            .from(foodParcels)
            .where(eq(foodParcels.id, removedParcel.id));

        expect(movedParcel.deleted_at).toBeNull();
        expect(movedParcel.pickup_date_time_earliest).toEqual(removedSlot.start);
        expect(movedParcel.pickup_date_time_latest).toEqual(removedSlot.end);
        expect(deletedParcel.deleted_at).not.toBeNull();
        expect(mockQueuePickupUpdatedSms).toHaveBeenCalledWith(keptParcel.id);
    });

    it("rejects full household edit when a future no-show parcel is omitted", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            {},
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const noShowSlot = withEnd(atHour(daysFromNow(13), 10));
        const noShowParcel = await createTestNoShowParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: noShowSlot.start,
            pickup_date_time_latest: noShowSlot.end,
        });

        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, []),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.validationErrors?.map(error => error.code)).toContain(
                "TERMINAL_PARCEL",
            );
        }

        const [unchangedParcel] = await db
            .select()
            .from(foodParcels)
            .where(eq(foodParcels.id, noShowParcel.id));

        expect(unchangedParcel.deleted_at).toBeNull();
        expect(unchangedParcel.no_show_at).not.toBeNull();
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
    });

    it("rejects full household edit when a future no-show parcel is changed", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            {},
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const noShowSlot = withEnd(atHour(daysFromNow(13), 10));
        const noShowParcel = await createTestNoShowParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: noShowSlot.start,
            pickup_date_time_latest: noShowSlot.end,
        });
        const movedSlot = withEnd(atHour(daysFromNow(14), 11));

        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    id: noShowParcel.id,
                    pickupDate: movedSlot.start,
                    pickupEarliestTime: movedSlot.start,
                    pickupLatestTime: movedSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.validationErrors?.map(error => error.code)).toContain(
                "TERMINAL_PARCEL",
            );
        }

        const [unchangedParcel] = await db
            .select()
            .from(foodParcels)
            .where(eq(foodParcels.id, noShowParcel.id));

        expect(unchangedParcel.pickup_date_time_earliest).toEqual(noShowSlot.start);
        expect(unchangedParcel.pickup_date_time_latest).toEqual(noShowSlot.end);
        expect(unchangedParcel.no_show_at).not.toBeNull();
        expect(unchangedParcel.deleted_at).toBeNull();
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
    });

    it("keeps an unchanged future no-show parcel without creating a duplicate", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            {},
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const noShowSlot = withEnd(atHour(daysFromNow(14), 10));
        const noShowParcel = await createTestNoShowParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: noShowSlot.start,
            pickup_date_time_latest: noShowSlot.end,
        });

        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    id: noShowParcel.id,
                    pickupDate: noShowSlot.start,
                    pickupEarliestTime: noShowSlot.start,
                    pickupLatestTime: noShowSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(true);

        const activeParcels = await db
            .select()
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)));

        expect(activeParcels).toHaveLength(1);
        expect(activeParcels[0].id).toBe(noShowParcel.id);
        expect(activeParcels[0].no_show_at).not.toBeNull();
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
    });

    it("rejects full household edit when a future picked-up parcel is omitted", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            {},
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const pickedUpSlot = withEnd(atHour(daysFromNow(13), 10));
        const pickedUpParcel = await createTestPickedUpParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: pickedUpSlot.start,
            pickup_date_time_latest: pickedUpSlot.end,
        });

        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, []),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.validationErrors?.map(error => error.code)).toContain(
                "TERMINAL_PARCEL",
            );
        }

        const [unchangedParcel] = await db
            .select()
            .from(foodParcels)
            .where(eq(foodParcels.id, pickedUpParcel.id));

        expect(unchangedParcel.deleted_at).toBeNull();
        expect(unchangedParcel.is_picked_up).toBe(true);
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
    });

    it("keeps an unchanged future picked-up parcel without creating a duplicate", async () => {
        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            {},
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const pickedUpSlot = withEnd(atHour(daysFromNow(14), 10));
        const pickedUpParcel = await createTestPickedUpParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: pickedUpSlot.start,
            pickup_date_time_latest: pickedUpSlot.end,
        });

        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, location.id, [
                {
                    id: pickedUpParcel.id,
                    pickupDate: pickedUpSlot.start,
                    pickupEarliestTime: pickedUpSlot.start,
                    pickupLatestTime: pickedUpSlot.end,
                },
            ]),
        );

        expect(result.success).toBe(true);

        const activeParcels = await db
            .select()
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)));

        expect(activeParcels).toHaveLength(1);
        expect(activeParcels[0].id).toBe(pickedUpParcel.id);
        expect(activeParcels[0].is_picked_up).toBe(true);
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
    });

    it("leaves same-day parcels whose pickup window has passed unchanged when editing household details", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-05-06T12:00:00Z"));

        const db = await getTestDb();
        const { location } = await createTestLocationWithSchedule(
            {},
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const passedSameDaySlot = {
            start: new Date("2026-05-06T09:00:00Z"),
            end: new Date("2026-05-06T10:00:00Z"),
        };
        const parcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: passedSameDaySlot.start,
            pickup_date_time_latest: passedSameDaySlot.end,
        });

        const result = await updateHousehold(household.id, buildUpdateData(household, "", []));

        expect(result.success).toBe(true);

        const [unchangedParcel] = await db
            .select()
            .from(foodParcels)
            .where(eq(foodParcels.id, parcel.id));

        expect(unchangedParcel.deleted_at).toBeNull();
        expect(unchangedParcel.pickup_date_time_earliest).toEqual(passedSameDaySlot.start);
        expect(unchangedParcel.pickup_date_time_latest).toEqual(passedSameDaySlot.end);
        expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
        expect(mockRecomputeOutsideHoursCount).not.toHaveBeenCalled();
    });

    it("returns location validation instead of opening-hours validation for a bogus pickup location", async () => {
        const { location } = await createTestLocationWithSchedule(
            {},
            { startDate: daysFromNow(-1), endDate: daysFromNow(30), weekdays: [...allWeekdays] },
        );
        const household = await createTestHousehold({
            primary_pickup_location_id: location.id,
        });

        const slot = withEnd(atHour(daysFromNow(15), 10));
        const result = await updateHousehold(
            household.id,
            buildUpdateData(household, "missing-location", [
                {
                    pickupDate: slot.start,
                    pickupEarliestTime: slot.start,
                    pickupLatestTime: slot.end,
                },
            ]),
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.validationErrors?.map(error => error.code)).toContain(
                "LOCATION_NOT_FOUND",
            );
            expect(result.error.validationErrors?.map(error => error.code)).not.toContain(
                "OUTSIDE_OPERATING_HOURS",
            );
        }
    });
});
