import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { foodParcels, outgoingSms, households } from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { eq, and, gte, asc, isNull, isNotNull, or } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logError } from "@/app/utils/logger";

/**
 * Sanitize error messages to remove potential PII like phone numbers.
 * Provider errors may contain sensitive data that shouldn't be exposed to staff.
 */
function sanitizeErrorMessage(message: string | null): string | null {
    if (!message) return null;

    // Redact phone numbers in various formats:
    // +46701234567, 0701234567, +1-555-123-4567, etc.
    const sanitized = message
        // International format: +XX followed by digits
        .replace(/\+\d{1,3}[-.\s]?\d{6,14}/g, "[PHONE REDACTED]")
        // Swedish mobile: 07X XXX XX XX or similar
        .replace(/\b07\d[-.\s]?\d{3}[-.\s]?\d{2}[-.\s]?\d{2}\b/g, "[PHONE REDACTED]")
        // Generic digit sequences that look like phone numbers (7+ digits)
        .replace(/\b\d{7,15}\b/g, "[PHONE REDACTED]");

    return sanitized;
}

/**
 * GET /api/admin/sms/failures - Get list of failed SMS for upcoming parcels
 *
 * Query params:
 * - status: "active" (default) | "dismissed" - filter by dismiss status
 *
 * Returns failures including:
 * - Internal failures (status = 'failed')
 * - Provider failures (status = 'sent' AND provider_status IN ('failed', 'not delivered'))
 */
export async function GET(request: NextRequest) {
    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        // Parse query params
        const { searchParams } = new URL(request.url);
        const statusFilter = searchParams.get("status") || "active";

        // Validate status param
        if (statusFilter !== "active" && statusFilter !== "dismissed") {
            return NextResponse.json(
                { error: "Invalid status parameter. Must be 'active' or 'dismissed'" },
                { status: 400 },
            );
        }

        // Build dismiss filter based on status param
        const dismissFilter =
            statusFilter === "dismissed"
                ? isNotNull(outgoingSms.dismissed_at)
                : isNull(outgoingSms.dismissed_at);

        // Query for failed SMS - includes both internal and provider failures
        // Limited to 100 to prevent unbounded responses
        const failures = await db
            .select({
                id: outgoingSms.id,
                intent: outgoingSms.intent,
                householdId: foodParcels.household_id,
                householdFirstName: households.first_name,
                householdLastName: households.last_name,
                parcelId: outgoingSms.parcel_id,
                phoneNumber: outgoingSms.to_e164,
                pickupDateEarliest: foodParcels.pickup_date_time_earliest,
                pickupDateLatest: foodParcels.pickup_date_time_latest,
                status: outgoingSms.status,
                providerStatus: outgoingSms.provider_status,
                providerStatusUpdatedAt: outgoingSms.provider_status_updated_at,
                errorMessage: outgoingSms.last_error_message,
                sentAt: outgoingSms.sent_at,
                createdAt: outgoingSms.created_at,
                dismissedAt: outgoingSms.dismissed_at,
                dismissedByUserId: outgoingSms.dismissed_by_user_id,
            })
            .from(outgoingSms)
            .innerJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .where(
                and(
                    notDeleted(), // Only active parcels
                    gte(foodParcels.pickup_date_time_latest, new Date()), // Upcoming only
                    dismissFilter, // Active or dismissed based on query param
                    // Include both internal failures AND provider failures
                    or(
                        eq(outgoingSms.status, "failed"), // Internal API failure
                        and(
                            eq(outgoingSms.status, "sent"), // Sent but provider failed
                            or(
                                eq(outgoingSms.provider_status, "failed"),
                                eq(outgoingSms.provider_status, "not delivered"),
                            ),
                        ),
                    ),
                ),
            )
            .orderBy(asc(foodParcels.pickup_date_time_earliest)) // Soonest pickups first
            .limit(100);

        // Sanitize error messages before returning to client
        const sanitizedFailures = failures.map(f => ({
            ...f,
            errorMessage: sanitizeErrorMessage(f.errorMessage),
        }));

        return NextResponse.json(
            { failures: sanitizedFailures },
            {
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                },
            },
        );
    } catch (error) {
        logError("Error fetching SMS failures", error, {
            method: "GET",
            path: "/api/admin/sms/failures",
        });
        return NextResponse.json({ error: "Failed to fetch failures" }, { status: 500 });
    }
}
