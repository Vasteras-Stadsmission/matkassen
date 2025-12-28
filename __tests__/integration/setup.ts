import { beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest";
import { getTestDb, cleanupTestDb, closeTestDb } from "../db/test-db";
import { TEST_NOW } from "../test-time";

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
 * KEY: We use vi.useFakeTimers() and vi.setSystemTime() to freeze time at
 * TEST_NOW for deterministic time-based testing. This mocks Date, Date.now(),
 * and all timer functions globally.
 *
 * Lifecycle:
 * - beforeAll: Initialize PGlite, run migrations
 * - beforeEach: Set fake timers to TEST_NOW
 * - afterEach: Truncate tables, restore real timers
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

// Use fake timers for deterministic time testing
// This must be called before beforeAll/beforeEach hooks
vi.useFakeTimers();
vi.setSystemTime(TEST_NOW);

beforeAll(async () => {
    // Initialize PGlite and run all migrations.
    // Note: getTestDb() is also called in the mock above, but we call it again here
    // to ensure initialization is complete before tests run. This is safe because
    // getTestDb() uses a singleton pattern - the second call simply returns the
    // already-initialized instance.
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
