import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/app/db/schema";
import * as fs from "fs";
import * as path from "path";

let pglite: PGlite | null = null;
let testDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Get or create a PGlite instance for testing.
 * Reuses the same instance across tests in a file for performance.
 */
export async function getTestDb() {
    if (!testDb) {
        // Initialize PGlite with pg_trgm extension (used for fuzzy name matching)
        pglite = new PGlite({
            extensions: { pg_trgm },
        });

        // Run actual migrations (includes partial indexes, seed data, extensions)
        await runMigrations(pglite);

        testDb = drizzle(pglite, { schema });
    }
    return testDb;
}

/**
 * Run all migration files in order.
 * This ensures test DB matches production schema exactly, including:
 * - Partial unique indexes (e.g., food_parcels soft-delete constraint)
 * - Seed data for lookup tables
 * - Custom PL/pgSQL functions
 * - pg_trgm extension
 */
async function runMigrations(pglite: PGlite) {
    const migrationsDir = path.join(process.cwd(), "migrations");
    const files = fs
        .readdirSync(migrationsDir)
        .filter(f => f.endsWith(".sql"))
        .sort(); // Ensures correct order: 0000, 0001, 0002...

    for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, "utf-8");

        // Skip empty files or comment-only files
        const cleanedSql = sql.replace(/--.*$/gm, "").trim();
        if (!cleanedSql) continue;

        try {
            await pglite.exec(sql);
        } catch (error) {
            throw new Error(`Migration ${file} failed: ${error}`);
        }
    }
}

/**
 * Clean up database between tests.
 * Truncates data tables but preserves seed data in lookup tables.
 */
export async function cleanupTestDb() {
    if (!pglite) return;

    // Truncate transactional tables (not lookup tables with seed data)
    // Order matters due to foreign key constraints - CASCADE handles it
    await pglite.exec(`
        TRUNCATE TABLE
            outgoing_sms,
            food_parcels,
            household_verification_status,
            household_dietary_restrictions,
            household_additional_needs,
            household_comments,
            household_members,
            pets,
            households,
            pickup_location_schedule_days,
            pickup_location_schedules,
            pickup_locations,
            users,
            global_settings,
            csp_violations,
            verification_questions
        RESTART IDENTITY CASCADE
    `);

    // Lookup tables preserved (seeded by migrations, never change):
    // - dietary_restrictions
    // - pet_species_types
    // - additional_needs
    //
    // Tables truncated that DO have seed data:
    // - pickup_locations (has one default location, but tests should create own)
    // - verification_questions (admin-created, not static seed data)
}

/**
 * Close PGlite instance after all tests in a file complete.
 */
export async function closeTestDb() {
    if (pglite) {
        await pglite.close();
        pglite = null;
        testDb = null;
    }
}

/**
 * Get the raw PGlite instance for direct SQL execution.
 * Useful for testing raw queries or debugging.
 */
export function getPgliteInstance() {
    return pglite;
}

export type TestDb = Awaited<ReturnType<typeof getTestDb>>;
