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
import { formatPickupReminderSms, formatDateTimeForSms } from "@/app/utils/sms/templates";
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

        return NextResponse.json({
            smsRecords,
            reminderExists,
            testMode:
                process.env.HELLO_SMS_TEST_MODE === "true" || process.env.NODE_ENV !== "production",
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

        // Check cooldown for resend (prevent spam)
        if (action === "resend") {
            const existingRecords = await getSmsRecordsForParcel(parcelId);
            const recentRecord = existingRecords.find(record => {
                const timeSince = Date.now() - record.createdAt.getTime();
                return timeSince < 5 * 60 * 1000; // 5 minutes cooldown
            });

            if (recentRecord) {
                return NextResponse.json(
                    {
                        error: "Please wait at least 5 minutes before resending SMS",
                    },
                    { status: 429 },
                );
            }
        }

        // Generate SMS content
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://matkassen.org";
        const publicUrl = `${baseUrl}/p/${parcelId}`;

        const { date, time } = formatDateTimeForSms(
            parcelData.pickupDateTimeEarliest,
            parcelData.householdLocale,
        );

        const smsText = formatPickupReminderSms(
            {
                householdName,
                pickupDate: date,
                pickupTime: time,
                locationName: parcelData.locationName,
                locationAddress: parcelData.locationAddress,
                publicUrl,
            },
            parcelData.householdLocale,
        );

        // Create SMS record
        const smsId = await createSmsRecord({
            intent: "pickup_reminder",
            parcelId: parcelData.parcelId,
            householdId: parcelData.householdId,
            toE164: normalizePhoneToE164(parcelData.householdPhone),
            locale: parcelData.householdLocale,
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
