import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logError } from "@/app/utils/logger";

export async function GET() {
    try {
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        logError("Error in auth-check endpoint", error, {
            method: "GET",
            path: "/api/admin/auth-check",
        });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
