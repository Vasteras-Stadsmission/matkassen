import { db } from "@/app/db/drizzle";
import { globalSettings } from "@/app/db/schema";
import { inArray, sql } from "drizzle-orm";
import {
    NOSHOW_FOLLOWUP_ENABLED_KEY,
    NOSHOW_CONSECUTIVE_THRESHOLD_KEY,
    NOSHOW_TOTAL_THRESHOLD_KEY,
    NOSHOW_CONSECUTIVE_MIN,
    NOSHOW_CONSECUTIVE_MAX,
    NOSHOW_CONSECUTIVE_DEFAULT,
    NOSHOW_TOTAL_MIN,
    NOSHOW_TOTAL_MAX,
    NOSHOW_TOTAL_DEFAULT,
    parseThreshold,
} from "@/app/constants/noshow-settings";

type NoShowConfig = {
    enabled: boolean;
    consecutiveThreshold: number;
    totalThreshold: number;
};

export type NoShowFollowupRow = {
    household_id: string;
    first_name: string;
    last_name: string;
    total_no_shows: number;
    consecutive_no_shows: number;
    last_no_show_at: Date | string;
    total_count: number;
};

/**
 * Fetch no-show follow-up settings from globalSettings and parse thresholds.
 */
export async function getNoShowFollowupConfig(): Promise<NoShowConfig> {
    const settings = await db
        .select()
        .from(globalSettings)
        .where(
            inArray(globalSettings.key, [
                NOSHOW_FOLLOWUP_ENABLED_KEY,
                NOSHOW_CONSECUTIVE_THRESHOLD_KEY,
                NOSHOW_TOTAL_THRESHOLD_KEY,
            ]),
        );

    const settingsMap = new Map(settings.map(s => [s.key, s.value]));
    const enabledValue = settingsMap.get(NOSHOW_FOLLOWUP_ENABLED_KEY);
    const enabled =
        enabledValue === null || enabledValue === undefined ? true : enabledValue === "true";

    const consecutiveThreshold = parseThreshold(
        settingsMap.get(NOSHOW_CONSECUTIVE_THRESHOLD_KEY),
        NOSHOW_CONSECUTIVE_DEFAULT,
        NOSHOW_CONSECUTIVE_MIN,
        NOSHOW_CONSECUTIVE_MAX,
    );
    const totalThreshold = parseThreshold(
        settingsMap.get(NOSHOW_TOTAL_THRESHOLD_KEY),
        NOSHOW_TOTAL_DEFAULT,
        NOSHOW_TOTAL_MIN,
        NOSHOW_TOTAL_MAX,
    );

    return { enabled, consecutiveThreshold, totalThreshold };
}

/**
 * Build the no_show_stats CTE as a reusable SQL fragment.
 * Includes first_name/last_name so it works for both count and full-row queries.
 */
function buildNoShowStatsCte(consecutiveThreshold: number, totalThreshold: number) {
    return sql`
        SELECT
            h.id AS household_id,
            h.first_name,
            h.last_name,
            h.noshow_followup_dismissed_at,
            COUNT(fp.id) FILTER (WHERE fp.no_show_at IS NOT NULL) AS total_no_shows,
            MAX(fp.no_show_at) AS last_no_show_at,
            (
                SELECT COUNT(*)
                FROM (
                    SELECT fp2.no_show_at,
                           ROW_NUMBER() OVER (ORDER BY fp2.pickup_date_time_earliest DESC) AS rn
                    FROM food_parcels fp2
                    WHERE fp2.household_id = h.id
                      AND fp2.deleted_at IS NULL
                      AND (fp2.is_picked_up = true OR fp2.no_show_at IS NOT NULL)
                ) recent_parcels
                WHERE recent_parcels.no_show_at IS NOT NULL
                  AND recent_parcels.rn <= (
                      SELECT COUNT(*)
                      FROM (
                          SELECT fp3.no_show_at
                          FROM food_parcels fp3
                          WHERE fp3.household_id = h.id
                            AND fp3.deleted_at IS NULL
                            AND (fp3.is_picked_up = true OR fp3.no_show_at IS NOT NULL)
                      ) sub
                      WHERE sub.no_show_at IS NOT NULL
                  )
                  AND NOT EXISTS (
                      SELECT 1
                      FROM (
                          SELECT fp4.no_show_at,
                                 ROW_NUMBER() OVER (ORDER BY fp4.pickup_date_time_earliest DESC) AS rn2
                          FROM food_parcels fp4
                          WHERE fp4.household_id = h.id
                            AND fp4.deleted_at IS NULL
                            AND (fp4.is_picked_up = true OR fp4.no_show_at IS NOT NULL)
                      ) check_parcels
                      WHERE check_parcels.rn2 < recent_parcels.rn
                        AND check_parcels.no_show_at IS NULL
                  )
            ) AS consecutive_no_shows
        FROM households h
        INNER JOIN food_parcels fp ON fp.household_id = h.id
        WHERE h.anonymized_at IS NULL
          AND fp.deleted_at IS NULL
        GROUP BY h.id, h.first_name, h.last_name, h.noshow_followup_dismissed_at
        HAVING COUNT(fp.id) FILTER (WHERE fp.no_show_at IS NOT NULL) >= ${totalThreshold}
           OR (
               SELECT COUNT(*)
               FROM (
                   SELECT fp2.no_show_at,
                          ROW_NUMBER() OVER (ORDER BY fp2.pickup_date_time_earliest DESC) AS rn
                   FROM food_parcels fp2
                   WHERE fp2.household_id = h.id
                     AND fp2.deleted_at IS NULL
                     AND (fp2.is_picked_up = true OR fp2.no_show_at IS NOT NULL)
               ) recent
               WHERE recent.no_show_at IS NOT NULL
                 AND recent.rn <= ${consecutiveThreshold}
           ) >= ${consecutiveThreshold}
    `;
}

/**
 * Extract rows from a db.execute result, handling both PGlite ({ rows }) and postgres-js (array) formats.
 */
function extractRows<T>(result: unknown): T[] {
    const raw = result as T[] | { rows: T[] };
    return Array.isArray(raw) ? raw : raw.rows;
}

/**
 * Count households that exceed no-show thresholds and haven't been dismissed.
 * Returns 0 if no matches.
 */
export async function countNoShowFollowups(
    consecutiveThreshold: number,
    totalThreshold: number,
): Promise<number> {
    const cte = buildNoShowStatsCte(consecutiveThreshold, totalThreshold);
    const result = await db.execute(sql`
        WITH no_show_stats AS (${cte})
        SELECT COUNT(*)::int AS count
        FROM no_show_stats
        WHERE noshow_followup_dismissed_at IS NULL
           OR last_no_show_at > noshow_followup_dismissed_at
    `);

    type CountRow = { count: number };
    const rows = extractRows<CountRow>(result);
    return rows.length > 0 ? Number(rows[0].count) : 0;
}

/**
 * Query households that exceed no-show thresholds (full rows for the issues page).
 * Returns up to 100 rows plus an accurate totalCount via COUNT(*) OVER().
 */
export async function queryNoShowFollowups(
    consecutiveThreshold: number,
    totalThreshold: number,
): Promise<{ rows: NoShowFollowupRow[]; totalCount: number }> {
    const cte = buildNoShowStatsCte(consecutiveThreshold, totalThreshold);
    const result = await db.execute(sql`
        WITH no_show_stats AS (${cte})
        SELECT
            household_id,
            first_name,
            last_name,
            total_no_shows::int,
            consecutive_no_shows::int,
            last_no_show_at,
            COUNT(*) OVER() AS total_count
        FROM no_show_stats
        WHERE noshow_followup_dismissed_at IS NULL
           OR last_no_show_at > noshow_followup_dismissed_at
        ORDER BY last_no_show_at DESC
        LIMIT 100
    `);

    const rows = extractRows<NoShowFollowupRow>(result);
    const totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0;
    return { rows, totalCount };
}
