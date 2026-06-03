import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getTestDb } from "../../db/test-db";
import { auditLog } from "@/app/db/schema";
import {
    NOSHOW_CONSECUTIVE_THRESHOLD_KEY,
    NOSHOW_FOLLOWUP_ENABLED_KEY,
    NOSHOW_TOTAL_THRESHOLD_KEY,
} from "@/app/constants/noshow-settings";

const mockSession = {
    user: {
        githubUsername: "settings-admin",
        role: "admin",
    },
};

vi.mock("@/app/utils/auth/protected-action", () => ({
    protectedAdminAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => fn(mockSession, ...args);
    },
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

const { updateParcelWarningThreshold } = await import("@/app/[locale]/settings/parcels/actions");
const { updateNoShowFollowupSettings } = await import("@/app/[locale]/settings/general/actions");

describe("critical settings audit logging integration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("records compact before/after details when parcel warning threshold changes", async () => {
        const db = await getTestDb();

        const first = await updateParcelWarningThreshold(4);
        expect(first.success).toBe(true);

        const second = await updateParcelWarningThreshold(6);
        expect(second.success).toBe(true);

        const rows = await db
            .select()
            .from(auditLog)
            .where(
                and(
                    eq(auditLog.entity_type, "global_setting"),
                    eq(auditLog.entity_id, "parcel_warning_threshold"),
                ),
            );

        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            actor_username: "settings-admin",
            action: "updated",
            summary: "Updated parcel warning threshold",
            details: {
                changes: {
                    value: {
                        before: null,
                        after: "4",
                    },
                },
            },
        });
        expect(rows[1].details).toEqual({
            changes: {
                value: {
                    before: "4",
                    after: "6",
                },
            },
        });
    });

    it("records one audit row for the no-show follow-up settings business action", async () => {
        const db = await getTestDb();

        const result = await updateNoShowFollowupSettings({
            enabled: true,
            consecutiveThreshold: 2,
            totalThreshold: 4,
        });

        expect(result.success).toBe(true);

        const [row] = await db
            .select()
            .from(auditLog)
            .where(
                and(
                    eq(auditLog.entity_type, "global_setting"),
                    eq(auditLog.entity_id, "no_show_followup"),
                ),
            );

        expect(row).toMatchObject({
            actor_username: "settings-admin",
            action: "updated",
            summary: "Updated no-show follow-up settings",
            details: {
                changes: {
                    [NOSHOW_FOLLOWUP_ENABLED_KEY]: {
                        before: null,
                        after: "true",
                    },
                    [NOSHOW_CONSECUTIVE_THRESHOLD_KEY]: {
                        before: null,
                        after: "2",
                    },
                    [NOSHOW_TOTAL_THRESHOLD_KEY]: {
                        before: null,
                        after: "4",
                    },
                },
            },
        });
    });
});
