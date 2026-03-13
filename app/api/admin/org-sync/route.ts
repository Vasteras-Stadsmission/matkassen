import { NextResponse } from "next/server";
import { triggerOrgSync } from "@/app/utils/scheduler";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { checkRateLimit } from "@/app/utils/rate-limit";
import { logError } from "@/app/utils/logger";

// Shared rate limit across all admins — sync is expensive (one GitHub API call per user).
const ORG_SYNC_RATE_LIMIT = { maxRequests: 2, windowMs: 60 * 1000 };

export async function POST() {
    try {
        // Authenticate without per-user rate limit — we apply a global budget below.
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response;
        }

        // Global rate limit: 2 requests/min regardless of which admin triggers it.
        const rl = checkRateLimit("org-sync:global", ORG_SYNC_RATE_LIMIT);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: rl.error, retryAfter: Math.ceil((rl.resetTime - Date.now()) / 1000) },
                { status: 429 },
            );
        }

        const result = await triggerOrgSync();

        if (!result.success) {
            return NextResponse.json({ error: result.error || "Org sync failed" }, { status: 500 });
        }

        // Return 500 when the sync encountered errors (e.g. pre-flight org check failed),
        // even though triggerOrgSync() itself didn't throw.
        if ((result.errors?.length ?? 0) > 0 && !result.skipped) {
            return NextResponse.json(
                {
                    success: false,
                    message: `Org sync completed with ${result.errors!.length} error(s)`,
                    deactivated: result.deactivated,
                    errors: result.errors,
                },
                { status: 500 },
            );
        }

        return NextResponse.json({
            success: true,
            message: result.skipped
                ? "Org sync already in progress, request skipped"
                : `Org sync complete: ${result.deactivated} deactivated, ${result.errors?.length ?? 0} errors`,
            deactivated: result.deactivated,
            errors: result.errors,
            skipped: result.skipped,
        });
    } catch (error) {
        logError("Error triggering org sync", error, {
            method: "POST",
            path: "/api/admin/org-sync",
        });
        return NextResponse.json({ error: "Failed to trigger org sync" }, { status: 500 });
    }
}
