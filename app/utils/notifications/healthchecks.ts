/**
 * Pings to healthchecks.io, which emails when a check reports a failure or
 * stops pinging, and stays quiet while everything works. Each check has a
 * schedule (see scripts/healthchecks-setup.sh), so a job that stops running
 * alerts as surely as one that fails.
 *
 * Pings carry no body: nothing about households or users leaves the server.
 * Without HEALTHCHECKS_PING_KEY (dev, staging, tests) pings are skipped.
 */

import { logError } from "@/app/utils/logger";

export type HealthcheckSlug =
    | "sms-scheduler"
    | "sms-credits"
    | "sms-delivery"
    | "sms-reconciliation"
    | "anonymization"
    | "org-sync";

export async function pingHealthcheck(
    slug: HealthcheckSlug,
    outcome: "success" | "fail" = "success",
): Promise<void> {
    const pingKey = process.env.HEALTHCHECKS_PING_KEY;
    if (!pingKey) {
        return;
    }

    const url = `https://hc-ping.com/${pingKey}/${slug}${outcome === "fail" ? "/fail" : ""}`;
    try {
        const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(10_000) });
        if (!response.ok) {
            throw new Error(`healthchecks.io answered ${response.status}`);
        }
    } catch (error) {
        logError("Healthchecks.io ping failed", error, { slug, outcome });
    }
}
