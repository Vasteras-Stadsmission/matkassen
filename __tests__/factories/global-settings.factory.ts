import { getTestDb } from "../db/test-db";
import { globalSettings } from "@/app/db/schema";

/**
 * Create a test global setting.
 */
export async function createTestGlobalSetting(key: string, value: string) {
    const db = await getTestDb();

    const [setting] = await db
        .insert(globalSettings)
        .values({
            key,
            value,
        })
        .returning();

    return setting;
}

/**
 * Create the parcel warning threshold setting.
 */
export async function createTestParcelWarningThreshold(threshold: number) {
    return createTestGlobalSetting("parcel_warning_threshold", threshold.toString());
}
