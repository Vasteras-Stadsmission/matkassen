/**
 * Parcel state transitions — single source of truth for every mutation of
 * the `food_parcels` table that the application performs.
 *
 * ## Why this module exists
 *
 * Parcel mutations used to be scattered across two API routes, three
 * server actions, and one helper, each with its own copy of the
 * validation logic. PR 4 centralizes them so that PR 5 can wire one
 * `recordAuditEvent` call into each helper instead of touching six call
 * sites — and so that any future audit or invariant fix has exactly one
 * place to land.
 *
 * ## Scope
 *
 * Lifecycle transitions only:
 *   - createParcels       (insert)
 *   - markPickedUp        (pickup PATCH)
 *   - undoPickup          (pickup DELETE)
 *   - markNoShow          (no-show PATCH)
 *   - undoNoShow          (no-show DELETE)
 *   - softDeleteParcel    (strict, returns errors)
 *   - softDeleteParcelLenient (silent skip on not-found / already-deleted)
 *
 * **Reschedule paths are intentionally out of scope.** `rescheduleParcel`
 * and `bulkRescheduleParcels` in `app/[locale]/schedule/actions.ts` are
 * property updates with their own complex validation (capacity per slot,
 * per day, opening hours) and post-commit side effects (recompute counts,
 * queue update SMS). They are not lifecycle events, are not on the audit
 * gap list, and adding them would significantly expand this PR. They
 * stay as direct `tx.update(foodParcels)` writes for now.
 *
 * ## Acceptance criterion (verified by grep)
 *
 *     grep -rn '\\.(update|insert|delete)\\(foodParcels\\)' app/
 *
 * should return only:
 *   - this file
 *   - app/db/insert-parcels.ts                 (low-level conflict helper)
 *   - app/[locale]/schedule/actions.ts:738     (rescheduleParcel — out of scope)
 *   - app/[locale]/schedule/actions.ts:1752    (bulkRescheduleParcels — out of scope)
 *   - app/[locale]/households/[id]/edit/actions.ts:615 (same-day update — out of scope)
 *
 * ## Behavioural contract
 *
 * This refactor is behaviour-equivalent. Each helper preserves the exact
 * validation logic and SMS handling of the call site it replaces. The
 * existing integration tests under `__tests__/integration/parcels/` and
 * `__tests__/integration/households/` exercise every path and must keep
 * passing without modification.
 *
 * ## Audit (PR 5, not yet)
 *
 * Each helper takes a `session` parameter so PR 5 can add
 * `recordAuditEvent` calls without re-touching the call sites. The session
 * is currently used only to populate `picked_up_by_user_id` /
 * `no_show_by_user_id` / `deleted_by_user_id`.
 */

import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { db } from "@/app/db/drizzle";
import { foodParcels, outgoingSms, households, nanoid } from "@/app/db/schema";
import { insertParcels } from "@/app/db/insert-parcels";
import { notDeleted } from "@/app/db/query-helpers";
import { Time } from "@/app/utils/time-provider";
import { formatCancellationSms } from "@/app/utils/sms/templates";
import type { SupportedLocale } from "@/app/utils/locale-detection";

/**
 * Drizzle transaction handle. Same shape as the parameter type used by
 * `app/db/insert-parcels.ts` — extracted from `db.transaction`.
 */
export type ParcelTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Minimal session shape this module needs for actor attribution.
 * Intentionally narrower than next-auth's `Session` to avoid pulling
 * NextAuth types into utility code that may run from cron and from
 * server actions alike. PR 5 (audit wiring) will unify this with the
 * identical type in `app/utils/audit/log.ts`.
 */
export interface ParcelActorSession {
    user?: {
        githubUsername?: string | null;
    };
}

/** Shape accepted by createParcels for each row to insert. */
export interface NewParcelInput {
    household_id: string;
    pickup_location_id: string;
    pickup_date_time_earliest: Date;
    pickup_date_time_latest: Date;
    is_picked_up: boolean;
}

/**
 * Discriminated result type for state transitions that can fail with a
 * specific error code. The error codes match the existing API responses
 * one-for-one so the route handlers can map them to HTTP status codes
 * without translation.
 */
export type ParcelTransitionError =
    | { code: "NOT_FOUND"; message: string }
    | { code: "ALREADY_DELETED"; message: string }
    | { code: "ALREADY_PICKED_UP"; message: string }
    | { code: "ALREADY_NO_SHOW"; message: string }
    | { code: "FUTURE_PARCEL"; message: string }
    | { code: "PAST_PARCEL"; message: string };

export type ParcelTransitionResult = { ok: true } | { ok: false; error: ParcelTransitionError };

export type SoftDeleteParcelResult =
    | { ok: true; smsCancelled: boolean; smsSent: boolean }
    | { ok: false; error: ParcelTransitionError };

/**
 * Internal: extract the username string for `food_parcels.*_by_user_id`
 * columns. Preserves the existing call-site fallback conventions:
 *
 *   - explicit `null` session  → `"system"` (cron / scheduled actions)
 *   - session with username    → that username
 *   - session without username → `"unknown"` (caller bug — when audit
 *                                wiring lands in PR 5, this will surface
 *                                a Pino alarm via recordAuditEvent's
 *                                `__missing__` sentinel without changing
 *                                the column value here)
 *
 * The food_parcels columns are operational state ("who picked this up
 * now"), not the audit log — they keep the existing username convention
 * with no underscored sentinels.
 */
function extractUsername(session: ParcelActorSession | null): string {
    if (session === null) return "system";
    return session.user?.githubUsername || "unknown";
}

// ============================================================================
// createParcels
// ============================================================================

/**
 * Insert one or more food parcels with proper conflict handling for the
 * partial unique index on active parcels.
 *
 * Returns the IDs of newly inserted rows. Duplicates that hit the partial
 * index are silently skipped (idempotent under concurrent inserts) — see
 * `app/db/insert-parcels.ts` for the conflict-resolution rationale.
 *
 * The session parameter is currently unused at runtime; it exists so
 * PR 5 can add audit logging without re-touching every call site.
 */
export async function createParcels(
    tx: ParcelTransaction,
    args: {
        parcels: NewParcelInput[];
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        session: ParcelActorSession | null;
    },
): Promise<string[]> {
    return insertParcels(tx, args.parcels);
}

// ============================================================================
// markPickedUp
// ============================================================================

/**
 * Mark a parcel as picked up. Also clears any `no_show_*` state to avoid
 * the `no_show_pickup_exclusivity_check` constraint — business rule: if
 * the parcel was picked up, the household clearly showed up, so any
 * earlier no-show marking is wrong.
 */
export async function markPickedUp(
    tx: ParcelTransaction,
    args: { parcelId: string; session: ParcelActorSession },
): Promise<ParcelTransitionResult> {
    const username = extractUsername(args.session);
    const now = new Date();

    const result = await tx
        .update(foodParcels)
        .set({
            is_picked_up: true,
            picked_up_at: now,
            picked_up_by_user_id: username,
            no_show_at: null,
            no_show_by_user_id: null,
        })
        .where(and(eq(foodParcels.id, args.parcelId), notDeleted()))
        .returning({ id: foodParcels.id });

    if (result.length === 0) {
        return {
            ok: false,
            error: { code: "NOT_FOUND", message: "Parcel not found or deleted" },
        };
    }
    return { ok: true };
}

// ============================================================================
// undoPickup
// ============================================================================

/** Clear pickup status. No state validation beyond not-deleted. */
export async function undoPickup(
    tx: ParcelTransaction,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    args: { parcelId: string; session: ParcelActorSession },
): Promise<ParcelTransitionResult> {
    const result = await tx
        .update(foodParcels)
        .set({
            is_picked_up: false,
            picked_up_at: null,
            picked_up_by_user_id: null,
        })
        .where(and(eq(foodParcels.id, args.parcelId), notDeleted()))
        .returning({ id: foodParcels.id });

    if (result.length === 0) {
        return {
            ok: false,
            error: { code: "NOT_FOUND", message: "Parcel not found or deleted" },
        };
    }
    return { ok: true };
}

// ============================================================================
// markNoShow
// ============================================================================

/**
 * Mark a parcel as no-show. Validates state preconditions and returns
 * specific error codes for each failure case.
 *
 * Same-day no-show is intentionally allowed: households often send late
 * "I won't come" notifications on pickup day itself, and staff need to
 * be able to record these immediately. Only future parcels are blocked.
 */
export async function markNoShow(
    tx: ParcelTransaction,
    args: { parcelId: string; session: ParcelActorSession },
): Promise<ParcelTransitionResult> {
    const username = extractUsername(args.session);
    const now = Time.now().toUTC();
    const todayStockholm = Time.now().toDateString();

    const [parcel] = await tx
        .select({
            id: foodParcels.id,
            isPickedUp: foodParcels.is_picked_up,
            deletedAt: foodParcels.deleted_at,
            noShowAt: foodParcels.no_show_at,
            pickupDateTimeEarliest: foodParcels.pickup_date_time_earliest,
        })
        .from(foodParcels)
        .where(eq(foodParcels.id, args.parcelId))
        .limit(1);

    if (!parcel) {
        return {
            ok: false,
            error: { code: "NOT_FOUND", message: "Parcel not found" },
        };
    }
    if (parcel.deletedAt) {
        return {
            ok: false,
            error: {
                code: "ALREADY_DELETED",
                message: "Cannot mark a cancelled parcel as no-show",
            },
        };
    }
    if (parcel.isPickedUp) {
        return {
            ok: false,
            error: {
                code: "ALREADY_PICKED_UP",
                message: "Cannot mark a picked up parcel as no-show",
            },
        };
    }
    if (parcel.noShowAt) {
        return {
            ok: false,
            error: {
                code: "ALREADY_NO_SHOW",
                message: "Parcel is already marked as no-show",
            },
        };
    }

    const pickupDateStockholm = Time.fromDate(parcel.pickupDateTimeEarliest).toDateString();
    if (pickupDateStockholm > todayStockholm) {
        return {
            ok: false,
            error: {
                code: "FUTURE_PARCEL",
                message: "Cannot mark future parcel as no-show",
            },
        };
    }

    await tx
        .update(foodParcels)
        .set({
            no_show_at: now,
            no_show_by_user_id: username,
        })
        .where(eq(foodParcels.id, args.parcelId));

    return { ok: true };
}

// ============================================================================
// undoNoShow
// ============================================================================

/**
 * Clear no-show status. Atomic single-update with combined precondition
 * check (not deleted AND currently marked no-show) — matches the existing
 * "Parcel not found, deleted, or not marked as no-show" error from the
 * DELETE no-show route.
 */
export async function undoNoShow(
    tx: ParcelTransaction,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    args: { parcelId: string; session: ParcelActorSession },
): Promise<ParcelTransitionResult> {
    const result = await tx
        .update(foodParcels)
        .set({
            no_show_at: null,
            no_show_by_user_id: null,
        })
        .where(
            and(
                eq(foodParcels.id, args.parcelId),
                notDeleted(),
                sql`${foodParcels.no_show_at} IS NOT NULL`,
            ),
        )
        .returning({ id: foodParcels.id });

    if (result.length === 0) {
        return {
            ok: false,
            error: {
                code: "NOT_FOUND",
                message: "Parcel not found, deleted, or not marked as no-show",
            },
        };
    }
    return { ok: true };
}

// ============================================================================
// softDeleteParcel (strict) and softDeleteParcelLenient
// ============================================================================

/**
 * Strict soft-delete entry point. Validates that the parcel exists, is
 * not already deleted, has not been picked up, and is not in the past.
 * Returns specific error codes for each failure so the API DELETE route
 * can map them to HTTP status codes.
 *
 * On success, also handles SMS cancellation: queued/sending/retrying
 * reminder SMS get cancelled, already-sent reminders trigger a
 * cancellation SMS to the household, and pending pickup_updated SMS get
 * cancelled to prevent stale updates.
 *
 * Use this for user-facing actions where each parcel is processed
 * individually and errors should surface to the user. For bulk operations
 * inside a household-edit transaction, see `softDeleteParcelLenient`.
 */
export async function softDeleteParcel(
    tx: ParcelTransaction,
    args: { parcelId: string; session: ParcelActorSession | null },
): Promise<SoftDeleteParcelResult> {
    // Validation select shape matches the previous softDeleteParcel action
    // (select the whole parcel row under `parcel`) so the existing unit
    // tests in __tests__/app/parcels/softDeleteParcel.test.ts — which mock
    // the drizzle select call sequence — keep working without rewrites.
    const parcelResult = await tx
        .select({ parcel: foodParcels })
        .from(foodParcels)
        .where(and(eq(foodParcels.id, args.parcelId), notDeleted()))
        .limit(1);

    if (parcelResult.length === 0) {
        return {
            ok: false,
            error: { code: "NOT_FOUND", message: "Parcel not found or already deleted" },
        };
    }

    const { parcel } = parcelResult[0];

    if (parcel.is_picked_up) {
        return {
            ok: false,
            error: {
                code: "ALREADY_PICKED_UP",
                message: "Cannot delete a parcel that has already been picked up",
            },
        };
    }

    const now = Time.now();
    const pickupEnd = Time.fromDate(parcel.pickup_date_time_latest);
    if (now.isAfter(pickupEnd)) {
        return {
            ok: false,
            error: {
                code: "PAST_PARCEL",
                message: "Cannot delete a parcel from the past",
            },
        };
    }

    const { smsCancelled, smsSent } = await performSoftDelete(tx, args.parcelId, args.session);
    return { ok: true, smsCancelled, smsSent };
}

/**
 * Lenient soft-delete for bulk household-edit paths. Silently skips
 * parcels that don't exist or have already been deleted; does NOT check
 * for picked-up or past status — caller is responsible for any
 * pre-validation it needs.
 *
 * **Known pre-existing edge case**: if a parcel is picked up between
 * the caller's pre-fetch and this call, it will still be soft-deleted.
 * This is the same behaviour as the previous
 * `softDeleteParcelInTransaction` helper that this function replaces.
 * The race window is small in practice and the buggy outcome (a row
 * with both `is_picked_up = true` and `deleted_at IS NOT NULL`) does
 * not violate the existing CHECK constraint
 * (`no_show_pickup_exclusivity_check` only blocks no-show + picked-up,
 * not deleted + picked-up). Fixing this is a separate concern outside
 * the scope of the refactor.
 *
 * Returns `{ skipped: true }` when the parcel was not found or already
 * deleted, otherwise the SMS handling result.
 */
export async function softDeleteParcelLenient(
    tx: ParcelTransaction,
    args: { parcelId: string; session: ParcelActorSession | null },
): Promise<{ skipped: boolean; smsCancelled: boolean; smsSent: boolean }> {
    // The performSoftDelete helper does its own existence check via the
    // join below; if the parcel is missing it returns the no-op shape.
    const result = await performSoftDelete(tx, args.parcelId, args.session);
    return result;
}

// ============================================================================
// Internal: shared soft-delete implementation
// ============================================================================

/**
 * Performs the soft-delete + SMS cancellation logic that both
 * `softDeleteParcel` (strict) and `softDeleteParcelLenient` rely on.
 *
 * Behaviour ported verbatim from the previous
 * `softDeleteParcelInTransaction` in `app/[locale]/parcels/actions.ts`:
 *
 *   1. Look up parcel + household (joined). If not found or already
 *      deleted, return early with `{ skipped: true }`.
 *   2. Walk pickup_reminder SMS records newest-first:
 *        - queued/sending → cancel
 *        - retrying → cancel and clear next_attempt_at
 *        - sent (first one only) → queue a cancellation SMS to the
 *          household
 *   3. Cancel any non-terminal pickup_updated SMS for the parcel.
 *   4. Soft-delete the parcel (set deleted_at, deleted_by_user_id).
 */
async function performSoftDelete(
    tx: ParcelTransaction,
    parcelId: string,
    session: ParcelActorSession | null,
): Promise<{ skipped: boolean; smsCancelled: boolean; smsSent: boolean }> {
    const parcelResult = await tx
        .select({
            parcel: foodParcels,
            household: households,
        })
        .from(foodParcels)
        .innerJoin(households, eq(foodParcels.household_id, households.id))
        .where(and(eq(foodParcels.id, parcelId), notDeleted()))
        .limit(1);

    if (parcelResult.length === 0) {
        // Parcel not found or already deleted — silently skip
        return { skipped: true, smsCancelled: false, smsSent: false };
    }

    const { parcel, household } = parcelResult[0];

    // Check for existing reminder SMS records for this parcel (newest first)
    const smsRecords = await tx
        .select()
        .from(outgoingSms)
        .where(and(eq(outgoingSms.parcel_id, parcelId), eq(outgoingSms.intent, "pickup_reminder")))
        .orderBy(desc(outgoingSms.created_at));

    let smsCancelled = false;
    let smsSent = false;

    for (const sms of smsRecords) {
        if (sms.status === "queued" || sms.status === "sending") {
            // Case 1: SMS not yet sent or in-flight — cancel silently.
            // "sending" status means an HTTP request may be active but
            // can still be effectively cancelled since the SMS processor
            // won't pick it up again with cancelled status.
            await tx
                .update(outgoingSms)
                .set({ status: "cancelled" })
                .where(eq(outgoingSms.id, sms.id));
            smsCancelled = true;
        } else if (sms.status === "retrying") {
            // Case 2: SMS in retry backoff — cancel and clear next_attempt_at
            // so getSmsRecordsReadyForSending doesn't pick it up next poll.
            await tx
                .update(outgoingSms)
                .set({ status: "cancelled", next_attempt_at: null })
                .where(eq(outgoingSms.id, sms.id));
            smsCancelled = true;
        } else if (sms.status === "sent" && !smsSent) {
            // Case 3: SMS already delivered — queue a cancellation SMS.
            smsSent = true;

            const publicUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/p/${parcelId}`;
            const cancellationText = formatCancellationSms(
                {
                    pickupDate: parcel.pickup_date_time_earliest,
                    publicUrl,
                },
                household.locale as SupportedLocale,
            );

            // Keep parcel_id reference — parcel still exists (soft-deleted)
            // for audit trail.
            await tx.insert(outgoingSms).values({
                id: nanoid(12),
                intent: "pickup_cancelled",
                parcel_id: parcelId,
                household_id: household.id,
                to_e164: household.phone_number,
                text: cancellationText,
                status: "queued",
                attempt_count: 0,
                next_attempt_at: Time.now().toDate(),
                idempotency_key: `cancel-${parcelId}-${Date.now()}`,
            });
        }
        // For "failed" and "cancelled" — no action needed (terminal state).
    }

    // Also cancel any pending pickup_updated SMS so stale updates don't
    // get sent after cancellation. No outbound notification — if the
    // parcel is cancelled, an update to it is irrelevant.
    await tx
        .update(outgoingSms)
        .set({ status: "cancelled", next_attempt_at: null })
        .where(
            and(
                eq(outgoingSms.parcel_id, parcelId),
                eq(outgoingSms.intent, "pickup_updated"),
                inArray(outgoingSms.status, ["queued", "sending", "retrying"]),
            ),
        );

    // Soft delete the parcel itself.
    await tx
        .update(foodParcels)
        .set({
            deleted_at: Time.now().toDate(),
            deleted_by_user_id: extractUsername(session),
        })
        .where(eq(foodParcels.id, parcelId));

    return { skipped: false, smsCancelled, smsSent };
}
