import { NextResponse } from "next/server";
import { triggerOrgSync } from "@/app/utils/scheduler";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logError } from "@/app/utils/logger";

export async function POST() {
    try {
        const authResult = await authenticateAdminRequest({
            endpoint: "org-sync",
            config: { maxRequests: 2, windowMs: 60 * 1000 }, // 2 per minute — sync is expensive
        });
        if (!authResult.success) {
            return authResult.response;
        }

        const result = await triggerOrgSync();

        if (!result.success) {
            return NextResponse.json({ error: result.error || "Org sync failed" }, { status: 500 });
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
