import { beforeAll, afterAll, afterEach, vi } from "vitest";
import { getTestDb, cleanupTestDb, closeTestDb } from "../db/test-db";

/**
 * Integration test setup for PGlite.
 *
 * This file is automatically loaded by Vitest for integration tests
 * (files matching *.integration.test.ts).
 *
 * KEY: We mock @/app/db/drizzle to use the test database instead of the
 * production mock. This allows integration tests to call real action functions
 * that import `db` from @/app/db/drizzle.
 *
 * Lifecycle:
 * - beforeAll: Initialize PGlite, run migrations, and inject test db
 * - afterEach: Truncate transactional tables (preserves lookup/seed data)
 * - afterAll: Close PGlite connection
 */

// Mock the drizzle module to use the test database
// This must be done before any imports that use @/app/db/drizzle
vi.mock("@/app/db/drizzle", async () => {
    const testDb = await getTestDb();
    return {
        db: testDb,
        client: null, // Not needed for PGlite
    };
});

beforeAll(async () => {
    // Initialize PGlite and run all migrations
    // (already done by the mock above, but we call it again to ensure it's ready)
    await getTestDb();
});

afterEach(async () => {
    // Clean up data between tests while preserving lookup tables
    await cleanupTestDb();
});

afterAll(async () => {
    // Close PGlite connection when all tests in file complete
    await closeTestDb();
});
