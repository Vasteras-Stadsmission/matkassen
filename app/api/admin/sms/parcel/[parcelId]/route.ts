import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import {
    foodParcels,
    households,
    pickupLocations,
    pickupLocationSchedules,
    pickupLocationScheduleDays,
} from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { eq, and } from "drizzle-orm";
import {
    getSmsRecordsForParcel,
    createSmsRecord,
    smsExistsForParcel,
} from "@/app/utils/sms/sms-service";
import { formatPickupSms, type SmsTemplateData } from "@/app/utils/sms/templates";
import type { SupportedLocale } from "@/app/utils/locale-detection";
import { normalizePhoneToE164, getHelloSmsConfig } from "@/app/utils/sms/hello-sms";
import { generateUrl } from "@/app/config/branding";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { SMS_RATE_LIMITS } from "@/app/utils/rate-limit";
import { logger, logError } from "@/app/utils/logger";
import { nanoid } from "nanoid";
import {
    isParcelOutsideOpeningHours,
    type ParcelTimeInfo,
    type LocationScheduleInfo,
} from "@/app/utils/schedule/outside-hours-filter";

// GET /api/admin/sms/parcel/[parcelId] - Get SMS history for a parcel
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ parcelId: string }> },
) {
    try {
        // Validate authentication and organization membership
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        const { parcelId } = await params;
        const smsRecords = await getSmsRecordsForParcel(parcelId);

        // Check if reminder SMS already exists
        const reminderExists = await smsExistsForParcel(parcelId, "pickup_reminder");

        const { testMode } = getHelloSmsConfig();

        return NextResponse.json({
            smsRecords,
            reminderExists,
            testMode,
        });
    } catch (error) {
        logError("Error fetching SMS records", error, {
            method: "GET",
            path: "/api/admin/sms/parcel/[parcelId]",
            parcelId: (await params).parcelId,
        });
        return NextResponse.json({ error: "Failed to fetch SMS records" }, { status: 500 });
    }
}

// POST /api/admin/sms/parcel/[parcelId] - Send/resend SMS for a parcel
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ parcelId: string }> },
) {
    try {
        const { parcelId } = await params;

        // Validate authentication with rate limiting
        const authResult = await authenticateAdminRequest({
            endpoint: "parcel-sms",
            config: SMS_RATE_LIMITS.PARCEL_SMS,
            identifier: parcelId,
        });
        if (!authResult.success) {
            return authResult.response!;
        }

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
                pickupDateTimeLatest: foodParcels.pickup_date_time_latest,
                locationId: foodParcels.pickup_location_id,
                locationName: pickupLocations.name,
                locationAddress: pickupLocations.street_address,
                isPickedUp: foodParcels.is_picked_up,
            })
            .from(foodParcels)
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .innerJoin(pickupLocations, eq(foodParcels.pickup_location_id, pickupLocations.id))
            .where(and(eq(foodParcels.id, parcelId), notDeleted()))
            .limit(1);

        if (result.length === 0) {
            return NextResponse.json({ error: "Parcel not found" }, { status: 404 });
        }

        const parcelData = result[0];

        // Check if parcel is outside opening hours
        const scheduleData = await db
            .select({
                scheduleId: pickupLocationSchedules.id,
                scheduleName: pickupLocationSchedules.name,
                startDate: pickupLocationSchedules.start_date,
                endDate: pickupLocationSchedules.end_date,
                weekday: pickupLocationScheduleDays.weekday,
                isOpen: pickupLocationScheduleDays.is_open,
                openingTime: pickupLocationScheduleDays.opening_time,
                closingTime: pickupLocationScheduleDays.closing_time,
            })
            .from(pickupLocationSchedules)
            .leftJoin(
                pickupLocationScheduleDays,
                eq(pickupLocationScheduleDays.schedule_id, pickupLocationSchedules.id),
            )
            .where(eq(pickupLocationSchedules.pickup_location_id, parcelData.locationId));

        // Build LocationScheduleInfo from query results
        const locationScheduleInfo: LocationScheduleInfo = { schedules: [] };
        for (const row of scheduleData) {
            let schedule = locationScheduleInfo.schedules.find(s => s.id === row.scheduleId);
            if (!schedule) {
                schedule = {
                    id: row.scheduleId,
                    name: row.scheduleName,
                    startDate: row.startDate,
                    endDate: row.endDate,
                    days: [],
                };
                locationScheduleInfo.schedules.push(schedule);
            }
            if (row.weekday) {
                schedule.days.push({
                    weekday: row.weekday,
                    isOpen: row.isOpen ?? false,
                    openingTime: row.openingTime,
                    closingTime: row.closingTime,
                });
            }
        }

        // Check if parcel is outside opening hours (only if schedules exist)
        if (locationScheduleInfo.schedules.length > 0) {
            const parcelTimeInfo: ParcelTimeInfo = {
                id: parcelData.parcelId,
                pickupEarliestTime: parcelData.pickupDateTimeEarliest,
                pickupLatestTime: parcelData.pickupDateTimeLatest,
                isPickedUp: parcelData.isPickedUp,
            };

            if (isParcelOutsideOpeningHours(parcelTimeInfo, locationScheduleInfo)) {
                return NextResponse.json(
                    { error: "Cannot send SMS for parcel scheduled outside opening hours" },
                    { status: 400 },
                );
            }
        }

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

        // Generate SMS content using centralized config
        const publicUrl = generateUrl(`/p/${parcelId}`);

        // Template data - all fields guaranteed by database schema constraints
        const templateData: SmsTemplateData = {
            pickupDate: parcelData.pickupDateTimeEarliest,
            publicUrl,
        };

        const smsText = formatPickupSms(
            templateData,
            parcelData.householdLocale as SupportedLocale,
        );

        // Create SMS record
        // For "send": use default stable idempotency key (deduplicates automatically)
        // For "resend": use unique key to allow re-sending despite stable key
        const smsId = await createSmsRecord({
            intent: "pickup_reminder",
            parcelId: parcelData.parcelId,
            householdId: parcelData.householdId,
            toE164: normalizePhoneToE164(parcelData.householdPhone),
            text: smsText,
            ...(action === "resend" && {
                idempotencyKey: `pickup_reminder|${parcelData.parcelId}|manual|${nanoid(8)}`,
            }),
        });

        // Audit log with IDs only (no PII)
        logger.info(
            {
                parcelId: parcelData.parcelId,
                householdId: parcelData.householdId,
                smsId,
                action,
                triggeredBy: authResult.session!.user.githubUsername,
            },
            "Manual parcel SMS queued",
        );

        const { testMode } = getHelloSmsConfig();

        return NextResponse.json({
            success: true,
            smsId,
            message: action === "resend" ? "SMS queued for resending" : "SMS queued for sending",
            testMode,
        });
    } catch (error) {
        logError("Error sending SMS", error, {
            method: "POST",
            path: "/api/admin/sms/parcel/[parcelId]",
            parcelId: (await params).parcelId,
        });
        return NextResponse.json({ error: "Failed to send SMS" }, { status: 500 });
    }
}
