/**
 * SMS queueing for food parcels
 *
 * This module handles automatic SMS queueing when parcels are created or updated.
 * SMS records are created immediately with appropriate scheduling:
 * - Parcels >48h away: SMS scheduled for 48 hours before pickup
 * - Parcels <48h away: SMS scheduled with 5-minute grace period
 */

import { eq } from "drizzle-orm";
import { households } from "@/app/db/schema";
import { Time } from "@/app/utils/time-provider";
import { createSmsRecord } from "@/app/utils/sms/sms-service";
import { formatPickupSms } from "@/app/utils/sms/templates";
import { normalizePhoneToE164 } from "@/app/utils/sms/hello-sms";
import { generateUrl } from "@/app/config/branding";
import type { SupportedLocale } from "@/app/utils/locale-detection";

// Constants
const GRACE_PERIOD_MINUTES = 5; // Time to allow edits before SMS sends
const REMINDER_HOURS_BEFORE_PICKUP = 48; // Send reminder 48 hours before pickup

interface ParcelWithId {
    id: string;
    household_id: string;
    pickup_location_id: string;
    pickup_date_time_earliest: Date;
    pickup_date_time_latest: Date;
    is_picked_up: boolean;
}

/**
 * Calculate when SMS should be sent for a parcel
 *
 * Logic:
 * - If parcel is >48 hours away: Schedule SMS for 48 hours before pickup
 * - If parcel is <48 hours away: Schedule SMS with 5-minute grace period
 *
 * @param pickupTime - The earliest pickup time for the parcel
 * @returns Date when SMS should be sent
 */
export function calculateSmsScheduleTime(pickupTime: Date): Date {
    const now = Time.now();
    const hoursUntilPickup = (pickupTime.getTime() - now.toUTC().getTime()) / (1000 * 60 * 60);

    if (hoursUntilPickup > REMINDER_HOURS_BEFORE_PICKUP) {
        // Schedule SMS for 48 hours before pickup
        const reminderTime = new Date(pickupTime);
        reminderTime.setHours(reminderTime.getHours() - REMINDER_HOURS_BEFORE_PICKUP);
        return reminderTime;
    } else {
        // Schedule SMS with grace period (5 minutes from now)
        return now.addMinutes(GRACE_PERIOD_MINUTES).toUTC();
    }
}

/**
 * Queue SMS records for newly created parcels
 *
 * This function:
 * 1. Fetches household information (phone, locale) for each parcel
 * 2. Calculates optimal SMS send time
 * 3. Creates SMS records in the outgoing_sms table
 *
 * @param tx - Database transaction
 * @param parcels - Array of parcels with IDs to queue SMS for
 */
export async function queueSmsForNewParcels(
    tx: Parameters<Parameters<typeof import("@/app/db/drizzle").db.transaction>[0]>[0],
    parcels: ParcelWithId[],
): Promise<void> {
    if (parcels.length === 0) return;

    console.log(`📱 queueSmsForNewParcels: Starting SMS queueing for ${parcels.length} parcel(s)`);

    // Fetch household info for all parcels (phone number, locale)
    // We need this to create SMS records
    const householdIds = [...new Set(parcels.map(p => p.household_id))];
    const householdsData = await tx
        .select({
            id: households.id,
            phone: households.phone_number,
            locale: households.locale,
        })
        .from(households)
        .where(
            // Use IN clause for multiple household IDs
            householdIds.length === 1
                ? eq(households.id, householdIds[0])
                : eq(households.id, households.id), // Fallback, will filter below
        );

    // Create a map for quick lookup
    const householdMap = new Map(householdsData.map(h => [h.id, h]));

    console.log(`📋 Fetched ${householdsData.length} household(s) info:`, {
        householdIds,
        withPhone: householdsData.filter(h => h.phone).length,
        withoutPhone: householdsData.filter(h => !h.phone).length,
    });

    // Queue SMS for each parcel
    let queuedCount = 0;
    for (const parcel of parcels) {
        try {
            const household = householdMap.get(parcel.household_id);
            if (!household || !household.phone) {
                console.warn(
                    `Skipping SMS for parcel ${parcel.id}: household ${parcel.household_id} has no phone number`,
                );
                continue;
            }

            // Calculate when SMS should be sent
            const nextAttemptAt = calculateSmsScheduleTime(parcel.pickup_date_time_earliest);

            // Generate public URL for the parcel
            const publicUrl = generateUrl(`/p/${parcel.id}`);

            // Generate SMS text
            const smsText = formatPickupSms(
                {
                    pickupDate: parcel.pickup_date_time_earliest,
                    publicUrl,
                },
                household.locale as SupportedLocale,
            );

            // Create SMS record with calculated send time
            await createSmsRecord({
                intent: "pickup_reminder",
                parcelId: parcel.id,
                householdId: parcel.household_id,
                toE164: normalizePhoneToE164(household.phone),
                text: smsText,
                nextAttemptAt,
                tx, // Pass transaction to ensure SMS is created in same transaction as parcel
            });

            queuedCount++;

            const hoursUntilSend =
                (nextAttemptAt.getTime() - Time.now().toUTC().getTime()) / (1000 * 60 * 60);
            console.log(
                `📬 Queued SMS for parcel ${parcel.id} (will send in ${hoursUntilSend.toFixed(1)}h)`,
            );
        } catch (error) {
            console.error(`Failed to queue SMS for parcel ${parcel.id}:`, error);
            // Continue with other parcels even if one fails
        }
    }

    if (queuedCount > 0) {
        console.log(`✅ Queued ${queuedCount} SMS messages for new parcels`);
    }
}
