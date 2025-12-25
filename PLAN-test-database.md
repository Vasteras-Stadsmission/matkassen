# Test Database Implementation Plan (PGlite)

## Overview

Add real PostgreSQL integration tests using **PGlite** - a WASM-compiled PostgreSQL that runs in-process without Docker.

**Why PGlite over Testcontainers:**
- 3-5x faster test execution
- No Docker dependency in CI/CD
- Simpler setup, same SQL validation
- Official Drizzle ORM support

**Schema Strategy: Run Migrations (not push)**

We run actual migration files because they contain critical SQL not expressible in `schema.ts`:
- Partial unique indexes (`WHERE deleted_at IS NULL`)
- Seed data for lookup tables (dietary restrictions, pet species, etc.)
- Custom PL/pgSQL functions
- Partial indexes for soft-delete queries

---

## Phase 1: Infrastructure Setup

### 1.1 Install Dependencies

```bash
pnpm add -D @electric-sql/pglite
```

### 1.2 Create Test Database Utilities

**File: `__tests__/db/test-db.ts`**

```typescript
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/app/db/schema";
import * as fs from "fs";
import * as path from "path";

let pglite: PGlite | null = null;
let testDb: ReturnType<typeof drizzle> | null = null;

/**
 * Get or create a PGlite instance for testing.
 * Reuses the same instance across tests in a file for performance.
 */
export async function getTestDb() {
  if (!testDb) {
    pglite = new PGlite();

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
  const files = fs.readdirSync(migrationsDir)
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
      users,
      global_settings,
      csp_violations
    RESTART IDENTITY CASCADE
  `);

  // Note: We preserve these lookup tables (seeded by migrations):
  // - dietary_restrictions
  // - pet_species_types
  // - additional_needs
  // - pickup_locations (has one default location)
  // - verification_questions
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
```

### 1.3 Create Vitest Setup for Integration Tests

**File: `__tests__/integration/setup.ts`**

```typescript
import { beforeAll, afterAll, afterEach } from "vitest";
import { getTestDb, cleanupTestDb, closeTestDb } from "../db/test-db";

beforeAll(async () => {
  await getTestDb();
});

afterEach(async () => {
  await cleanupTestDb();
});

afterAll(async () => {
  await closeTestDb();
});
```

### 1.4 Update Vitest Configuration

**File: `vitest.config.ts`** (modifications)

```typescript
export default defineConfig({
  test: {
    // Existing config...

    // Add workspace for separating unit and integration tests
    workspace: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["__tests__/**/*.test.ts"],
          exclude: ["__tests__/**/*.integration.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["__tests__/**/*.integration.test.ts"],
          setupFiles: ["__tests__/integration/setup.ts"],
          // Integration tests run serially to avoid PGlite conflicts
          pool: "forks",
          poolOptions: {
            forks: { singleFork: true },
          },
        },
      },
    ],
  },
});
```

### 1.5 Add NPM Scripts

**File: `package.json`** (additions)

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:watch": "vitest --project unit",
    "test:integration:watch": "vitest --project integration"
  }
}
```

---

## Phase 2: Test Data Factories

### 2.1 Create Factory Functions

**File: `__tests__/factories/index.ts`**

```typescript
export * from "./household.factory";
export * from "./food-parcel.factory";
export * from "./pickup-location.factory";
export * from "./user.factory";
export * from "./sms.factory";
```

**File: `__tests__/factories/household.factory.ts`**

```typescript
import { getTestDb } from "../db/test-db";
import { households, householdMembers } from "@/app/db/schema";

let householdCounter = 0;

export async function createTestHousehold(overrides: Partial<typeof households.$inferInsert> = {}) {
  const db = await getTestDb();
  householdCounter++;

  const defaults = {
    first_name: `Test${householdCounter}`,
    last_name: `User${householdCounter}`,
    phone_number: `+4670000${String(householdCounter).padStart(4, "0")}`,
    locale: "sv",
    postal_code: "72345",
  };

  const [household] = await db
    .insert(households)
    .values({ ...defaults, ...overrides })
    .returning();

  return household;
}

export async function createTestHouseholdWithMembers(
  householdOverrides = {},
  members: Array<{ age: number; sex: "male" | "female" | "other" }> = []
) {
  const household = await createTestHousehold(householdOverrides);
  const db = await getTestDb();

  if (members.length > 0) {
    await db.insert(householdMembers).values(
      members.map((m) => ({
        household_id: household.id,
        age: m.age,
        sex: m.sex,
      }))
    );
  }

  return household;
}
```

**File: `__tests__/factories/pickup-location.factory.ts`**

```typescript
import { getTestDb } from "../db/test-db";
import { pickupLocations, pickupLocationSchedules, pickupLocationScheduleDays } from "@/app/db/schema";

let locationCounter = 0;

export async function createTestPickupLocation(overrides = {}) {
  const db = await getTestDb();
  locationCounter++;

  const defaults = {
    name: `Test Location ${locationCounter}`,
    street_address: `Test Street ${locationCounter}`,
    postal_code: "72345",
    default_slot_duration_minutes: 15,
    max_parcels_per_slot: 4,
  };

  const [location] = await db
    .insert(pickupLocations)
    .values({ ...defaults, ...overrides })
    .returning();

  return location;
}

export async function createTestLocationWithSchedule(locationOverrides = {}) {
  const location = await createTestPickupLocation(locationOverrides);
  const db = await getTestDb();

  // Create a schedule valid for next 30 days
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 30);

  const [schedule] = await db
    .insert(pickupLocationSchedules)
    .values({
      pickup_location_id: location.id,
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      name: "Test Schedule",
    })
    .returning();

  // Add weekday hours (Mon-Fri 9-17)
  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
  await db.insert(pickupLocationScheduleDays).values(
    weekdays.map((day) => ({
      schedule_id: schedule.id,
      weekday: day,
      is_open: true,
      opening_time: "09:00",
      closing_time: "17:00",
    }))
  );

  return { location, schedule };
}
```

**File: `__tests__/factories/food-parcel.factory.ts`**

```typescript
import { getTestDb } from "../db/test-db";
import { foodParcels } from "@/app/db/schema";

export async function createTestParcel(overrides: {
  household_id: string;
  pickup_location_id: string;
  pickup_date_time_earliest?: Date;
  pickup_date_time_latest?: Date;
  is_picked_up?: boolean;
}) {
  const db = await getTestDb();

  const now = new Date();
  const earliest = overrides.pickup_date_time_earliest ?? new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const latest = overrides.pickup_date_time_latest ?? new Date(earliest.getTime() + 30 * 60 * 1000);

  const [parcel] = await db
    .insert(foodParcels)
    .values({
      household_id: overrides.household_id,
      pickup_location_id: overrides.pickup_location_id,
      pickup_date_time_earliest: earliest,
      pickup_date_time_latest: latest,
      is_picked_up: overrides.is_picked_up ?? false,
    })
    .returning();

  return parcel;
}
```

---

## Phase 3: Migrate Priority Tests

### 3.1 High Priority Tests to Convert

| Current File | New File | Reason |
|--------------|----------|--------|
| `households/parcels/actions.test.ts` | `households/parcels/actions.integration.test.ts` | Heavy DB mocking, tests CRUD |
| `households/user-profile-data.integration.test.ts` | Keep name, update impl | Already "integration" but uses mocks |
| `api/admin/sms/statistics.test.ts` | `api/admin/sms/statistics.integration.test.ts` | Tests aggregation queries |
| `households/edit/actions.test.ts` | `households/edit/actions.integration.test.ts` | Tests updates with constraints |
| `parcels/softDeleteParcel.test.ts` | `parcels/softDeleteParcel.integration.test.ts` | Tests partial index behavior |

### 3.2 Example Migration: `parcels/actions.test.ts`

**Before (mocked):**
```typescript
vi.mock("@/app/db/drizzle", () => ({
  db: {
    transaction: vi.fn(async (callback) => await callback(mockDb)),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ ... })) })),
    // ... 50+ lines of mock setup
  },
}));
```

**After (real DB):**
```typescript
import { getTestDb } from "../../db/test-db";
import { createTestHousehold, createTestPickupLocation } from "../../factories";

describe("updateHouseholdParcels", () => {
  it("should include parcels scheduled for later today", async () => {
    // Arrange - create real test data
    const household = await createTestHousehold();
    const { location } = await createTestLocationWithSchedule();

    // Act - call the real action
    const result = await updateHouseholdParcels(household.id, {
      pickupLocationId: location.id,
      parcels: [{ pickupDate: today, pickupEarliestTime: later, pickupLatestTime: end }],
    });

    // Assert - query real database
    const db = await getTestDb();
    const parcels = await db.select().from(foodParcels).where(eq(foodParcels.household_id, household.id));

    expect(result.success).toBe(true);
    expect(parcels).toHaveLength(1);
  });
});
```

---

## Phase 4: CI/CD Updates

### 4.1 GitHub Actions Workflow

**File: `.github/workflows/build.yml`** (modifications)

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install pnpm
        uses: pnpm/action-setup@v2

      - name: Install dependencies
        run: pnpm install

      - name: Run unit tests
        run: pnpm test:unit

      - name: Run integration tests
        run: pnpm test:integration
```

No Docker setup needed - PGlite runs as a regular npm package.

---

## Phase 5: Documentation

### 5.1 Update CONTRIBUTING.md or README

Add section explaining:
- How to run unit vs integration tests
- When to write integration tests (DB interactions)
- How to use factories
- Pattern for new integration tests

---

## Implementation Order

```
Week 1:
├── Day 1-2: Phase 1 (Infrastructure)
│   ├── Install @electric-sql/pglite
│   ├── Create test-db.ts utilities
│   ├── Configure vitest workspaces
│   └── Verify pg_trgm works
│
├── Day 3: Phase 2 (Factories)
│   ├── Create household factory
│   ├── Create pickup-location factory
│   └── Create food-parcel factory
│
└── Day 4-5: Phase 3 (Migrate 2-3 tests)
    ├── Convert parcels/actions.test.ts
    ├── Convert user-profile-data.integration.test.ts
    └── Validate pattern works

Week 2:
├── Continue Phase 3 (remaining tests)
├── Phase 4 (CI/CD)
└── Phase 5 (Documentation)
```

---

## Success Criteria

- [ ] PGlite instance starts in <2 seconds
- [ ] pg_trgm extension works (similarity function)
- [ ] Schema applies correctly (all CHECK constraints pass)
- [ ] Integration tests pass with real DB
- [ ] Unit tests remain fast (mocked)
- [ ] CI pipeline runs both test types
- [ ] No Docker required for tests

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| PGlite behavior differs from PostgreSQL | Low | Add targeted Testcontainers tests if found |
| Migration fails in PGlite | Low | Check for unsupported syntax, adjust if needed |
| Test isolation issues | Low | Use TRUNCATE CASCADE between tests |
| pg_trgm not working | Low | Already confirmed supported |
| Migrations slow down tests | Low | ~1s overhead is acceptable for correctness |

---

## Files to Create/Modify

### New Files
```
__tests__/
├── db/
│   └── test-db.ts              # PGlite setup & utilities
├── factories/
│   ├── index.ts                # Export all factories
│   ├── household.factory.ts
│   ├── pickup-location.factory.ts
│   ├── food-parcel.factory.ts
│   ├── user.factory.ts
│   └── sms.factory.ts
└── integration/
    └── setup.ts                # Vitest setup for integration tests
```

### Modified Files
```
vitest.config.ts                # Add workspace configuration
package.json                    # Add test:unit, test:integration scripts
.github/workflows/build.yml     # Update test commands
```

---

## Decisions Made

1. **Schema application strategy**: ✅ **Run migrations**
   - Migrations contain critical SQL not in schema.ts (partial indexes, seed data, extensions)
   - ~1s slower but ensures test DB matches production exactly

2. **Test file organization**: ✅ **Use `.integration.test.ts` suffix**
   - Keep tests next to the code they test (Next.js colocation principle)
   - Vitest workspaces handle separation via glob patterns

3. **Factory IDs**: ✅ **Use counters for unique fields, nanoid for IDs**
   - IDs auto-generated by schema via `$defaultFn(() => nanoid(8))`
   - Phone numbers use incrementing counters for predictability
