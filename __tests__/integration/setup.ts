import { beforeAll, afterAll, afterEach } from "vitest";
import { getTestDb, cleanupTestDb, closeTestDb } from "../db/test-db";

/**
 * Integration test setup for PGlite.
 *
 * This file is automatically loaded by Vitest for integration tests
 * (files matching *.integration.test.ts).
 *
 * Lifecycle:
 * - beforeAll: Initialize PGlite and run migrations (once per test file)
 * - afterEach: Truncate transactional tables (preserves lookup/seed data)
 * - afterAll: Close PGlite connection
 */

beforeAll(async () => {
    // Initialize PGlite and run all migrations
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
