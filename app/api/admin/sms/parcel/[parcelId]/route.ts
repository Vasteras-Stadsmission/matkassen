import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/app/db/drizzle";
import { foodParcels, households, pickupLocations } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import {
    getSmsRecordsForParcel,
    createSmsRecord,
    smsExistsForParcel,
} from "@/app/utils/sms/sms-service";
import { formatPickupSms } from "@/app/utils/sms/templates";
import type { SupportedLocale } from "@/app/utils/locale-detection";
import { normalizePhoneToE164 } from "@/app/utils/sms/hello-sms";

// GET /api/admin/sms/parcel/[parcelId] - Get SMS history for a parcel
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ parcelId: string }> },
) {
    try {
        const session = await auth();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { parcelId } = await params;
        const smsRecords = await getSmsRecordsForParcel(parcelId);

        // Check if reminder SMS already exists
        const reminderExists = await smsExistsForParcel(parcelId, "pickup_reminder");

        const testMode =
            process.env.HELLO_SMS_TEST_MODE === "true" || process.env.NODE_ENV !== "production";

        return NextResponse.json({
            smsRecords,
            reminderExists,
            testMode,
        });
    } catch (error) {
        console.error("Error fetching SMS records:", error);
        return NextResponse.json({ error: "Failed to fetch SMS records" }, { status: 500 });
    }
}

// POST /api/admin/sms/parcel/[parcelId] - Send/resend SMS for a parcel
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ parcelId: string }> },
) {
    try {
        const session = await auth();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { parcelId } = await params;
        const { action } = await request.json();

        if (action !== "send" && action !== "resend") {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

        // Get complete parcel data with household and location
        const result = await db
            .select({
                parcelId: foodParcels.id,
                householdId: households.id,
                householdName: {
                    first: households.first_name,
                    last: households.last_name,
                },
                householdPhone: households.phone_number,
                householdLocale: households.locale,
                pickupDateTimeEarliest: foodParcels.pickup_date_time_earliest,
                locationName: pickupLocations.name,
                locationAddress: pickupLocations.street_address,
            })
            .from(foodParcels)
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .innerJoin(pickupLocations, eq(foodParcels.pickup_location_id, pickupLocations.id))
            .where(eq(foodParcels.id, parcelId))
            .limit(1);

        if (result.length === 0) {
            return NextResponse.json({ error: "Parcel not found" }, { status: 404 });
        }

        const parcelData = result[0];
        const householdName = `${parcelData.householdName.first} ${parcelData.householdName.last}`;

        // Determine the actual intent based on existing SMS and user request
        const existingRecords = await getSmsRecordsForParcel(parcelId);

        // Check cooldown for any SMS sending (prevent spam)
        const recentRecord = existingRecords.find(record => {
            const timeSince = Date.now() - record.createdAt.getTime();
            return timeSince < 5 * 60 * 1000; // 5 minutes cooldown
        });

        if (recentRecord) {
            return NextResponse.json(
                {
                    error: "Please wait at least 5 minutes before sending another SMS",
                },
                { status: 429 },
            );
        }

        // Generate SMS content
        const baseUrl =
            process.env.NEXT_PUBLIC_BASE_URL ||
            (process.env.NODE_ENV === "production" ? "matkassen.org" : "localhost:3000");

        // Create shorter URL for SMS limits
        const publicUrl = `${baseUrl}/p/${parcelId}`;

        // Use pickup SMS template with Date object
        const templateData = {
            householdName,
            pickupDate: parcelData.pickupDateTimeEarliest, // Pass Date object directly
            locationName: parcelData.locationName,
            publicUrl,
        };

        const smsText = formatPickupSms(
            templateData,
            parcelData.householdLocale as SupportedLocale,
        );

        // Create SMS record
        const smsId = await createSmsRecord({
            intent: "pickup_reminder",
            parcelId: parcelData.parcelId,
            householdId: parcelData.householdId,
            toE164: normalizePhoneToE164(parcelData.householdPhone),
            text: smsText,
        });

        return NextResponse.json({
            success: true,
            smsId,
            message: action === "resend" ? "SMS queued for resending" : "SMS queued for sending",
            testMode:
                process.env.HELLO_SMS_TEST_MODE === "true" || process.env.NODE_ENV !== "production",
        });
    } catch (error) {
        console.error("Error sending SMS:", error);
        return NextResponse.json({ error: "Failed to send SMS" }, { status: 500 });
    }
}
