"use server";

import { revalidatePath } from "next/cache";
import { db } from "./drizzle";
import { households, cspViolations } from "./schema";
import { eq } from "drizzle-orm";

export async function addHouseholdAction(formData: FormData) {
    const firstName = formData.get("first_name") as string;
    const lastName = formData.get("last_name") as string;
    const phoneNumber = formData.get("phone_number") as string;
    const locale = formData.get("locale") as string;
    const postalCode = formData.get("postal_code") as string;

    await db.insert(households).values({
        first_name: firstName,
        last_name: lastName,
        phone_number: phoneNumber,
        locale: locale,
        postal_code: postalCode,
    });
    revalidatePath("/db");
}

export async function deleteHouseholdAction(formData: FormData) {
    const id = formData.get("id") as string;
    await db.delete(households).where(eq(households.id, id));
    revalidatePath("/db");
}

// Define the minimum required fields based on the schema
type CspViolationInsert = {
    violated_directive: string;
    disposition: string;
    blocked_uri?: string;
    effective_directive?: string;
    original_policy?: string;
    referrer?: string;
    source_file?: string;
    line_number?: number;
    column_number?: number;
    user_agent?: string;
    script_sample?: string;
};

// CSP violation storage action
export async function storeCspViolationAction(violationData: {
    blockedUri?: string;
    violatedDirective: string;
    effectiveDirective?: string;
    originalPolicy?: string;
    disposition: string;
    referrer?: string;
    sourceFile?: string;
    lineNumber?: number;
    columnNumber?: number;
    userAgent?: string;
    scriptSample?: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        // Map the camelCase input params to snake_case for Drizzle schema
        const insertData: CspViolationInsert = {
            blocked_uri: violationData.blockedUri,
            violated_directive: violationData.violatedDirective,
            effective_directive: violationData.effectiveDirective,
            original_policy: violationData.originalPolicy,
            disposition: violationData.disposition,
            referrer: violationData.referrer,
            source_file: violationData.sourceFile,
            line_number: violationData.lineNumber,
            column_number: violationData.columnNumber,
            user_agent: violationData.userAgent,
            script_sample: violationData.scriptSample,
        };

        await db.insert(cspViolations).values(insertData);

        return { success: true };
    } catch (error) {
        console.error("Error storing CSP violation:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
        };
    }
}
