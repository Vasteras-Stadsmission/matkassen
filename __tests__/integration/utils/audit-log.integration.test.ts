import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../db/test-db";
import { auditLog } from "@/app/db/schema";
import {
    recordAuditEvent,
    MISSING_ACTOR_SENTINEL,
    SYSTEM_ACTOR,
    type AuditTransaction,
} from "@/app/utils/audit/log";
import * as logger from "@/app/utils/logger";

// The test db is the pglite drizzle instance. Its tx type is structurally
// identical to the production postgres-js tx type the helper expects, but
// nominally different — cast in tests so the helper signature stays strict
// for production callers.
function asAuditTx<T>(tx: T): AuditTransaction {
    return tx as unknown as AuditTransaction;
}

describe("recordAuditEvent — integration", () => {
    let logErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        logErrorSpy = vi.spyOn(logger, "logError").mockImplementation(() => {});
    });

    afterEach(() => {
        logErrorSpy.mockRestore();
    });

    describe("actor resolution", () => {
        it("uses the session's githubUsername when present", async () => {
            const db = await getTestDb();

            await db.transaction(async tx => {
                await recordAuditEvent(asAuditTx(tx), {
                    session: { user: { githubUsername: "alice" } },
                    entityType: "household",
                    entityId: "h_123",
                    action: "updated",
                    summary: "Updated household name",
                    details: { name: { from: "Alice A.", to: "Alice B." } },
                });
            });

            const rows = await db.select().from(auditLog).where(eq(auditLog.entity_id, "h_123"));
            expect(rows).toHaveLength(1);
            expect(rows[0].actor_username).toBe("alice");
            expect(rows[0].entity_type).toBe("household");
            expect(rows[0].action).toBe("updated");
            expect(rows[0].summary).toBe("Updated household name");
            expect(rows[0].details).toEqual({
                name: { from: "Alice A.", to: "Alice B." },
            });
            expect(logErrorSpy).not.toHaveBeenCalled();
        });

        it("uses 'system' when caller explicitly passes null session", async () => {
            const db = await getTestDb();

            await db.transaction(async tx => {
                await recordAuditEvent(asAuditTx(tx), {
                    session: null,
                    entityType: "household",
                    entityId: "h_cron_1",
                    action: "anonymized",
                    summary: "Auto-anonymized after retention period",
                });
            });

            const [row] = await db
                .select()
                .from(auditLog)
                .where(eq(auditLog.entity_id, "h_cron_1"));
            expect(row.actor_username).toBe(SYSTEM_ACTOR);
            expect(logErrorSpy).not.toHaveBeenCalled();
        });

        it("falls back to '__missing__' and logs an error when session has no username", async () => {
            const db = await getTestDb();

            await db.transaction(async tx => {
                await recordAuditEvent(asAuditTx(tx), {
                    // Session object exists but the username is missing —
                    // this is a bug, not an intentional system call.
                    session: { user: { githubUsername: null } },
                    entityType: "user_role",
                    entityId: "u_42",
                    action: "role_changed",
                    summary: "Promoted user to admin",
                });
            });

            const [row] = await db.select().from(auditLog).where(eq(auditLog.entity_id, "u_42"));
            expect(row.actor_username).toBe(MISSING_ACTOR_SENTINEL);

            // The audit row was still written — that's the point of the
            // sentinel. The error log is the alarm channel, not a block.
            expect(logErrorSpy).toHaveBeenCalledTimes(1);
            const [message, error, context] = logErrorSpy.mock.calls[0];
            expect(message).toContain("without resolvable actor");
            expect(error).toBeInstanceOf(Error);
            expect(context).toMatchObject({
                entityType: "user_role",
                entityId: "u_42",
                action: "role_changed",
            });
        });

        it("also falls back to '__missing__' when session.user itself is missing", async () => {
            const db = await getTestDb();

            await db.transaction(async tx => {
                await recordAuditEvent(asAuditTx(tx), {
                    session: {}, // No `user` at all.
                    entityType: "household",
                    entityId: "h_no_user",
                    action: "updated",
                    summary: "Edge case: empty session object",
                });
            });

            const [row] = await db
                .select()
                .from(auditLog)
                .where(eq(auditLog.entity_id, "h_no_user"));
            expect(row.actor_username).toBe(MISSING_ACTOR_SENTINEL);
            expect(logErrorSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe("transaction semantics", () => {
        it("rolls the audit row back when the surrounding transaction throws", async () => {
            const db = await getTestDb();

            await expect(
                db.transaction(async tx => {
                    await recordAuditEvent(asAuditTx(tx), {
                        session: { user: { githubUsername: "alice" } },
                        entityType: "household",
                        entityId: "h_rolled_back",
                        action: "updated",
                        summary: "This should not survive",
                    });
                    throw new Error("simulated business mutation failure");
                }),
            ).rejects.toThrow("simulated business mutation failure");

            const rows = await db
                .select()
                .from(auditLog)
                .where(eq(auditLog.entity_id, "h_rolled_back"));
            // The audit row must have rolled back with the transaction.
            // This is the contract: audit rows can never outlive a failed
            // business mutation.
            expect(rows).toHaveLength(0);
        });

        it("commits the audit row when the surrounding transaction commits", async () => {
            const db = await getTestDb();

            await db.transaction(async tx => {
                await recordAuditEvent(asAuditTx(tx), {
                    session: { user: { githubUsername: "bob" } },
                    entityType: "household",
                    entityId: "h_committed",
                    action: "updated",
                    summary: "This should survive",
                });
                // No throw — transaction commits normally.
            });

            const rows = await db
                .select()
                .from(auditLog)
                .where(eq(auditLog.entity_id, "h_committed"));
            expect(rows).toHaveLength(1);
            expect(rows[0].actor_username).toBe("bob");
        });
    });

    describe("optional fields", () => {
        it("accepts a null entity_id for actions without a single subject", async () => {
            const db = await getTestDb();

            await db.transaction(async tx => {
                await recordAuditEvent(asAuditTx(tx), {
                    session: { user: { githubUsername: "alice" } },
                    entityType: "settings",
                    entityId: null,
                    action: "imported_csv",
                    summary: "Imported 42 records from CSV",
                    details: { count: 42, source: "manual_upload.csv" },
                });
            });

            const rows = await db
                .select()
                .from(auditLog)
                .where(eq(auditLog.actor_username, "alice"));
            const row = rows.find(r => r.action === "imported_csv");
            expect(row).toBeDefined();
            expect(row?.entity_id).toBeNull();
            expect(row?.details).toEqual({ count: 42, source: "manual_upload.csv" });
        });

        it("stores null details when caller omits them", async () => {
            const db = await getTestDb();

            await db.transaction(async tx => {
                await recordAuditEvent(asAuditTx(tx), {
                    session: { user: { githubUsername: "alice" } },
                    entityType: "household",
                    entityId: "h_no_details",
                    action: "deleted",
                    summary: "Deleted empty household",
                });
            });

            const [row] = await db
                .select()
                .from(auditLog)
                .where(eq(auditLog.entity_id, "h_no_details"));
            expect(row.details).toBeNull();
        });
    });
});
