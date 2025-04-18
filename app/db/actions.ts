"use server";

import { revalidatePath } from "next/cache";
import { db } from "./drizzle";
import { households } from "./schema";
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
