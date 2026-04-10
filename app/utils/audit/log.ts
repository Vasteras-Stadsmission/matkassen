/**
 * Audit log helper.
 *
 * Single entry point for writing rows to `audit_log`. Read this file before
 * adding new audit call sites — it is the source of truth for the audit
 * philosophy in this codebase.
 *
 * ## Philosophy
 *
 * 1. **Audit must NEVER block the business action.** Log-and-continue. A
 *    failed actor lookup logs to Pino and writes the row with a sentinel
 *    actor value (`__missing__`); a failed insert is not handled here at
 *    all and will roll the surrounding transaction back, which is correct
 *    — the business mutation should not commit if its audit write failed.
 *    Sentinel actors should be alerted on, never accepted as normal.
 *
 * 2. **Log values, not redactions.** The audience for `audit_log` is a
 *    small trusted admin team behind GitHub OAuth. PII length-diffs are
 *    useless for forensics, useless for GDPR subject access requests, and
 *    useless for undo. Pass real before/after values in `details`. The
 *    threat model does not justify field-level redaction.
 *
 * 3. **Always pass a transaction.** The `tx` parameter is required so the
 *    audit write is atomic with the business mutation. No orphan audit
 *    rows on rollback, no missing audit rows on commit.
 *
 * 4. **Business mutations only.** Use this helper when an admin (or the
 *    system on behalf of an admin) makes a meaningful change you might
 *    want to investigate later. Operational events (cron starts, request
 *    traces, errors) belong in Pino, not here.
 *
 * ## Why one generic table instead of one per entity
 *
 * The existing `scheduleAuditLog` is entity-specific (it has a
 * `pickup_location_id` column). That table predates this one and stays as
 * it is — don't fork the design twice. Everything else routes through
 * `auditLog` with `entity_type` + `entity_id` so we can add new audited
 * entities without a migration.
 */

import { db } from "@/app/db/drizzle";
import { auditLog } from "@/app/db/schema";
import { logError } from "@/app/utils/logger";

/**
 * Drizzle transaction handle. Same shape as the parameter type used by
 * `app/db/insert-parcels.ts` — extracts the tx type from `db.transaction`.
 */
export type AuditTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Minimal session shape this helper needs. Intentionally narrower than
 * next-auth's `Session` so we don't pull NextAuth types into utility code
 * that may run from cron and from server actions alike.
 */
export interface AuditActorSession {
    user?: {
        githubUsername?: string | null;
    };
}

/**
 * Sentinel actor used when an authenticated session was passed but the
 * username could not be resolved. This indicates a bug — alert on it,
 * never accept as normal.
 */
export const MISSING_ACTOR_SENTINEL = "__missing__";

/**
 * Sentinel actor used when the caller explicitly passes `null` for the
 * session, signalling an automated/system action (cron job, scheduled task,
 * webhook handler with no user context).
 */
export const SYSTEM_ACTOR = "system";

export interface RecordAuditEventArgs {
    /**
     * The actor who performed the action. Pass:
     *  - the authenticated session for user-initiated actions
     *  - `null` (explicitly) for automated/system actions
     *
     * If a session is passed but `user.githubUsername` is missing, the
     * helper logs an error and writes the row with `actor_username =
     * MISSING_ACTOR_SENTINEL` so the event is never lost.
     */
    session: AuditActorSession | null;

    /**
     * Coarse classifier for what was acted on. Examples:
     * `'household'`, `'user_role'`, `'parcel'`. Keep these stable across
     * call sites — they form the index used for "show me everything that
     * happened to X" queries.
     */
    entityType: string;

    /**
     * The id of the affected entity, or `null` for actions that don't have
     * a single subject. Stored as plain text — no FK — so audit rows
     * outlive the entity they describe.
     */
    entityId: string | null;

    /**
     * What happened. Examples: `'created'`, `'updated'`, `'deleted'`,
     * `'role_changed'`, `'picked_up'`, `'no_show_undone'`. Keep verbs
     * consistent within an entity_type so log readers can scan them.
     */
    action: string;

    /**
     * Human-readable one-line description for direct UI display. Should
     * make sense without parsing `details`. Example: `"Promoted bob to
     * admin"`.
     */
    summary: string;

    /**
     * Optional structured before/after blob. Log real values — see
     * philosophy point 2 at the top of this file.
     */
    details?: Record<string, unknown>;
}

/**
 * Record one audit event inside the caller's transaction.
 *
 * Throws only on database failure (which will roll back the surrounding
 * transaction along with the business mutation). Never throws on
 * actor-resolution problems — see philosophy point 1.
 */
export async function recordAuditEvent(
    tx: AuditTransaction,
    args: RecordAuditEventArgs,
): Promise<void> {
    const actorUsername = resolveActor(args);

    await tx.insert(auditLog).values({
        actor_username: actorUsername,
        entity_type: args.entityType,
        entity_id: args.entityId,
        action: args.action,
        summary: args.summary,
        details: args.details ?? null,
    });
}

function resolveActor(args: RecordAuditEventArgs): string {
    // Explicit null = system action (cron, scheduled task). The caller has
    // affirmed there is no human actor, so this is not an error condition.
    if (args.session === null) {
        return SYSTEM_ACTOR;
    }

    const username = args.session.user?.githubUsername;
    if (username) {
        return username;
    }

    // A session object was passed but the username is missing. This is a
    // bug somewhere upstream — surface it loudly via Pino but still write
    // the audit row with a sentinel so the event is preserved. The
    // business action must not be blocked by an audit-actor problem.
    logError(
        "Audit event recorded without resolvable actor — investigate",
        new Error("audit_event_missing_actor"),
        {
            entityType: args.entityType,
            entityId: args.entityId,
            action: args.action,
        },
    );
    return MISSING_ACTOR_SENTINEL;
}
