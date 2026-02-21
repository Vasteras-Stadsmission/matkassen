/**
 * Maps a dietary restriction severity value to a Mantine color.
 * "required" (allergies, religious, medical) → red
 * Everything else (preferences, nice-to-have) → orange
 */
export function severityToColor(value: string | null | undefined): string {
    return value === "required" ? "red" : "orange";
}
