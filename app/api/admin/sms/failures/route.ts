import { NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { foodParcels, outgoingSms, households } from "@/app/db/schema";
import { eq, and, gte, or, isNull, asc, desc } from "drizzle-orm";
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

// GET /api/admin/sms/failures - Get list of failed SMS (both parcel and enrolment)
export async function GET() {
    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        // For enrolment SMS (no parcel), show failures from last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Query for failed SMS - includes both parcel and non-parcel (enrolment) SMS
        // Uses LEFT JOIN to include SMS without parcels
        // Joins households directly via outgoingSms.household_id
        const failures = await db
            .select({
                id: outgoingSms.id,
                intent: outgoingSms.intent,
                householdId: outgoingSms.household_id,
                householdFirstName: households.first_name,
                householdLastName: households.last_name,
                parcelId: outgoingSms.parcel_id,
                pickupDateEarliest: foodParcels.pickup_date_time_earliest,
                pickupDateLatest: foodParcels.pickup_date_time_latest,
                errorMessage: outgoingSms.last_error_message,
                createdAt: outgoingSms.created_at,
            })
            .from(outgoingSms)
            .leftJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
            .innerJoin(households, eq(outgoingSms.household_id, households.id))
            .where(
                and(
                    eq(outgoingSms.status, "failed"), // Failed status only
                    or(
                        // Parcel SMS: upcoming parcels only (not deleted)
                        and(
                            isNull(foodParcels.deleted_at),
                            gte(foodParcels.pickup_date_time_latest, new Date()),
                        ),
                        // Non-parcel SMS (enrolment): recent failures only
                        and(
                            isNull(outgoingSms.parcel_id),
                            gte(outgoingSms.created_at, sevenDaysAgo),
                        ),
                    ),
                ),
            )
            .orderBy(
                // Parcel SMS first (by pickup date), then enrolment SMS (by created date)
                asc(foodParcels.pickup_date_time_earliest),
                desc(outgoingSms.created_at),
            )
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
