import { eq } from "drizzle-orm";
import { pickupLocations } from "@/app/db/schema";
import type { db } from "@/app/db/drizzle";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class OptionNotAvailableError extends Error {
    readonly code = "OPTION_NOT_AVAILABLE";

    constructor() {
        super("error.optionNotAvailable");
    }
}

export async function ensurePickupLocationExists(tx: DbTransaction, locationId: string) {
    const [location] = await tx
        .select({ id: pickupLocations.id })
        .from(pickupLocations)
        .where(eq(pickupLocations.id, locationId))
        .limit(1);

    if (!location) {
        throw new OptionNotAvailableError();
    }
}
