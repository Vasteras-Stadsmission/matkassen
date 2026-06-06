import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getTestDb } from "../../db/test-db";
import {
    createTestBalanceFailedSms,
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    resetHouseholdCounter,
    resetLocationCounter,
    resetSmsCounter,
} from "../../factories";
import { TEST_NOW } from "../../test-time";
import { auditLog, foodParcels, households } from "@/app/db/schema";
import {
    createParcels,
    markNoShow,
    markPickedUp,
    softDeleteParcelLenient,
    undoNoShow,
    undoPickup,
} from "@/app/utils/parcels/state-transitions";
import { removeHousehold } from "@/app/utils/anonymization/anonymize-household";
import { requeueBalanceFailures } from "@/app/utils/sms/sms-service";

function withUser(githubUsername: string) {
    return { user: { githubUsername } };
}

async function auditRowsForEntity(entityType: string, entityId: string | null) {
    const db = await getTestDb();
    return db
        .select()
        .from(auditLog)
        .where(
            and(
                eq(auditLog.entity_type, entityType),
                entityId === null ? isNull(auditLog.entity_id) : eq(auditLog.entity_id, entityId),
            ),
        );
}

describe("business audit logging integration", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
    });

    it("records one compact audit row per parcel lifecycle business action", async () => {
        const db = await getTestDb();
        const household = await createTestHousehold();
        const { location } = await createTestLocationWithSchedule();
        const session = withUser("parcel-admin");

        const futureStart = new Date(TEST_NOW.getTime() + 24 * 60 * 60 * 1000);
        const futureEnd = new Date(futureStart.getTime() + 30 * 60 * 1000);
        const pastStart = new Date(TEST_NOW.getTime() - 24 * 60 * 60 * 1000);
        const pastEnd = new Date(pastStart.getTime() + 30 * 60 * 1000);

        const createdIds = await db.transaction(tx =>
            createParcels(tx as any, {
                session,
                parcels: [
                    {
                        household_id: household.id,
                        pickup_location_id: location.id,
                        pickup_date_time_earliest: futureStart,
                        pickup_date_time_latest: futureEnd,
                        is_picked_up: false,
                    },
                    {
                        household_id: household.id,
                        pickup_location_id: location.id,
                        pickup_date_time_earliest: pastStart,
                        pickup_date_time_latest: pastEnd,
                        is_picked_up: false,
                    },
                ],
            }),
        );

        const [futureParcelId, pastParcelId] = createdIds;

        await db.transaction(async tx => {
            expect(await markPickedUp(tx as any, { parcelId: futureParcelId, session })).toEqual({
                ok: true,
            });
            expect(await undoPickup(tx as any, { parcelId: futureParcelId, session })).toEqual({
                ok: true,
            });
            expect(await markNoShow(tx as any, { parcelId: pastParcelId, session })).toEqual({
                ok: true,
            });
            expect(await undoNoShow(tx as any, { parcelId: pastParcelId, session })).toEqual({
                ok: true,
            });
            expect(
                await softDeleteParcelLenient(tx as any, {
                    parcelId: futureParcelId,
                    session,
                }),
            ).toMatchObject({ skipped: false });
        });

        const rows = await db
            .select()
            .from(auditLog)
            .where(inArray(auditLog.entity_id, [futureParcelId, pastParcelId]))
            .orderBy(auditLog.created_at);

        expect(rows).toHaveLength(7);
        expect(rows.map(row => row.action)).toEqual(
            expect.arrayContaining([
                "created",
                "marked_picked_up",
                "pickup_undone",
                "marked_no_show",
                "no_show_undone",
                "cancelled",
            ]),
        );
        expect(rows.filter(row => row.action === "created")).toHaveLength(2);
        expect(rows.every(row => row.actor_username === "parcel-admin")).toBe(true);
        expect(rows.find(row => row.action === "created")?.details).toMatchObject({
            household_id: household.id,
            pickup_location_id: location.id,
        });
        expect(rows.find(row => row.action === "marked_picked_up")?.details).toBeNull();
    });

    it("rolls back parcel state and audit rows when the business transaction fails", async () => {
        const db = await getTestDb();
        const household = await createTestHousehold();
        const { location } = await createTestLocationWithSchedule();
        const parcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
        });

        await expect(
            db.transaction(async tx => {
                await markPickedUp(tx as any, {
                    parcelId: parcel.id,
                    session: withUser("rollback-admin"),
                });
                throw new Error("simulate downstream validation failure");
            }),
        ).rejects.toThrow("simulate downstream validation failure");

        const [afterRollback] = await db
            .select({ isPickedUp: foodParcels.is_picked_up })
            .from(foodParcels)
            .where(eq(foodParcels.id, parcel.id));
        expect(afterRollback.isPickedUp).toBe(false);
        expect(await auditRowsForEntity("parcel", parcel.id)).toHaveLength(0);
    });

    it("rolls back the business mutation when the audit insert fails", async () => {
        const db = await getTestDb();
        const household = await createTestHousehold();
        const { location } = await createTestLocationWithSchedule();
        const overlongActor = "x".repeat(101); // audit_log.actor_username is varchar(100)
        const futureStart = new Date(TEST_NOW.getTime() + 24 * 60 * 60 * 1000);
        const futureEnd = new Date(futureStart.getTime() + 30 * 60 * 1000);

        await expect(
            db.transaction(tx =>
                createParcels(tx as any, {
                    session: withUser(overlongActor),
                    parcels: [
                        {
                            household_id: household.id,
                            pickup_location_id: location.id,
                            pickup_date_time_earliest: futureStart,
                            pickup_date_time_latest: futureEnd,
                            is_picked_up: false,
                        },
                    ],
                }),
            ),
        ).rejects.toThrow();

        const parcels = await db
            .select()
            .from(foodParcels)
            .where(eq(foodParcels.household_id, household.id));
        expect(parcels).toHaveLength(0);
    });

    it("prunes household and parcel audit rows when a household is anonymized", async () => {
        const db = await getTestDb();
        const household = await createTestHousehold();
        const { location } = await createTestLocationWithSchedule();
        const pastStart = new Date(TEST_NOW.getTime() - 3 * 24 * 60 * 60 * 1000);
        const parcel = await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: pastStart,
            pickup_date_time_latest: new Date(pastStart.getTime() + 30 * 60 * 1000),
        });

        await db.insert(auditLog).values([
            {
                actor_username: "old-admin",
                entity_type: "household",
                entity_id: household.id,
                action: "updated",
                summary: "Old household edit",
            },
            {
                actor_username: "old-admin",
                entity_type: "parcel",
                entity_id: parcel.id,
                action: "rescheduled",
                summary: "Old parcel reschedule",
            },
            {
                actor_username: "old-admin",
                entity_type: "user_role",
                entity_id: "staff-user",
                action: "role_changed",
                summary: "Unrelated user role audit",
            },
        ]);

        const result = await removeHousehold(household.id, "privacy-admin");
        expect(result.method).toBe("anonymized");

        expect(await auditRowsForEntity("household", household.id)).toHaveLength(0);
        expect(await auditRowsForEntity("parcel", parcel.id)).toHaveLength(0);
        expect(await auditRowsForEntity("user_role", "staff-user")).toHaveLength(1);
    });

    it("prunes household audit rows when a household with no service history is hard-deleted", async () => {
        const db = await getTestDb();
        const household = await createTestHousehold();

        await db.insert(auditLog).values({
            actor_username: "old-admin",
            entity_type: "household",
            entity_id: household.id,
            action: "updated",
            summary: "Old household edit",
        });

        const result = await removeHousehold(household.id, "cleanup-admin");
        expect(result.method).toBe("deleted");

        const [deletedHousehold] = await db
            .select()
            .from(households)
            .where(eq(households.id, household.id));
        expect(deletedHousehold).toBeUndefined();

        expect(await auditRowsForEntity("household", household.id)).toHaveLength(0);
    });

    it("records a manual SMS balance-failure requeue without storing message text", async () => {
        const db = await getTestDb();
        const household = await createTestHousehold();
        await createTestBalanceFailedSms({
            household_id: household.id,
            text: "Do not copy this real message body into audit details",
        });
        await createTestBalanceFailedSms({ household_id: household.id });

        const count = await requeueBalanceFailures(withUser("sms-admin"));
        expect(count).toBe(2);

        const rows = await auditRowsForEntity("sms", null);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            actor_username: "sms-admin",
            action: "balance_failures_requeued",
            summary: "Requeued balance-failed SMS",
        });
        expect(rows[0].details).toEqual({ count: 2 });
        expect(JSON.stringify(rows[0].details)).not.toContain("Do not copy");
    });
});
