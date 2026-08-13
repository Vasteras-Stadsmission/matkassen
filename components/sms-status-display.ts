export type SmsInternalStatus = "queued" | "sending" | "sent" | "retrying" | "failed" | "cancelled";

export type SmsProviderStatus = string | null;

export interface SmsStatusDisplayRecord {
    status: SmsInternalStatus;
    intent: string;
    providerStatus?: SmsProviderStatus;
    sentAt?: string;
}

export type SmsStatusDisplay =
    | {
          source: "internal";
          key: Exclude<SmsInternalStatus, "sent">;
          color: "blue" | "gray" | "red";
      }
    | {
          source: "provider";
          key:
              | "delivered"
              | "failed"
              | "notDelivered"
              | "awaiting"
              | "waiting"
              | "expired"
              | "outOfCredits"
              | "unexpected"
              | "stale";
          color: "gray" | "green" | "orange" | "red" | "yellow";
      };

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function isStaleUnconfirmedSms(record: SmsStatusDisplayRecord, now: number): boolean {
    if (
        record.status !== "sent" ||
        (record.providerStatus !== null &&
            record.providerStatus !== undefined &&
            record.providerStatus !== "waiting") ||
        !record.sentAt
    ) {
        return false;
    }

    return now - new Date(record.sentAt).getTime() > TWENTY_FOUR_HOURS_MS;
}

export function getSmsStatusDisplay(record: SmsStatusDisplayRecord, now: number): SmsStatusDisplay {
    if (record.status !== "sent") {
        const color =
            record.status === "failed" ? "red" : record.status === "queued" ? "blue" : "gray";

        return {
            source: "internal",
            key: record.status,
            color,
        };
    }

    if (isStaleUnconfirmedSms(record, now)) {
        return { source: "provider", key: "stale", color: "orange" };
    }

    switch (record.providerStatus) {
        case null:
        case undefined:
            return { source: "provider", key: "awaiting", color: "gray" };
        case "delivered":
            return { source: "provider", key: "delivered", color: "green" };
        case "failed":
            return { source: "provider", key: "failed", color: "red" };
        case "not delivered":
            return { source: "provider", key: "notDelivered", color: "orange" };
        case "waiting":
            return { source: "provider", key: "waiting", color: "yellow" };
        case "expired":
            return { source: "provider", key: "expired", color: "red" };
        case "out_of_credits":
            return { source: "provider", key: "outOfCredits", color: "red" };
        case "received":
            return { source: "provider", key: "unexpected", color: "orange" };
        default:
            return { source: "provider", key: "unexpected", color: "orange" };
    }
}

export function shouldShowSmsIntentLabels(
    records: readonly Pick<SmsStatusDisplayRecord, "intent">[],
): boolean {
    return records.length > 1 || records.some(record => record.intent !== "pickup_reminder");
}
