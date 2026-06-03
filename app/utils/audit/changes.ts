import type { JsonObject, JsonValue } from "@/app/utils/audit/log";

export interface FieldChange {
    [key: string]: JsonValue;
    before: JsonValue;
    after: JsonValue;
}

export interface FieldChanges {
    [key: string]: FieldChange;
}

export function buildChanges(
    before: Record<string, JsonValue>,
    after: Record<string, JsonValue>,
): FieldChanges {
    const changes: FieldChanges = {};

    for (const key of Object.keys(after)) {
        const beforeValue = before[key] ?? null;
        const afterValue = after[key] ?? null;

        if (beforeValue !== afterValue) {
            changes[key] = {
                before: beforeValue,
                after: afterValue,
            };
        }
    }

    return changes;
}

export function auditDetailsForChanges(changes: FieldChanges): JsonObject | undefined {
    return Object.keys(changes).length > 0 ? { changes } : undefined;
}

export function isoDate(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
