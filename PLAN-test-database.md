# Test Database Implementation Plan

## Executive Summary

This document analyzes the current testing infrastructure and proposes a plan to add a real test database for integration testing. The codebase currently has **~95 test files** with **~1,344 test cases** that heavily mock Drizzle ORM operations instead of using a real database.

---

## 1. Current State Analysis

### Testing Infrastructure
- **Framework**: Vitest (unit/integration) + Playwright (E2E)
- **Database**: PostgreSQL 17.5 with Drizzle ORM
- **Current approach**: All database operations are mocked at the ORM level
- **Mock strategy**: `app/db/drizzle.ts` creates a chainable mock that returns empty arrays

### The Problem with Current Mocking

The current mock in `app/db/drizzle.ts:37-79` creates a proxy that:
- Returns empty arrays for all `select()` queries
- Throws errors for `insert()`, `update()`, `delete()` operations
- Does NOT validate actual SQL/Drizzle query syntax
- Does NOT test schema constraints, foreign keys, or database triggers

**Example of current heavy mocking** (`actions.test.ts`):
```typescript
vi.mock("@/app/db/drizzle", () => ({
    db: {
        transaction: vi.fn(async (callback) => await callback(mockDb)),
        delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
        select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })) })),
        insert: vi.fn((table) => ({ values: vi.fn((values) => ({ ... })) })),
    },
}));
```

**Issues with this approach:**
1. ❌ Cannot catch SQL syntax errors
2. ❌ Cannot validate schema constraints (NOT NULL, UNIQUE, FK)
3. ❌ Cannot test complex queries (JOINs, aggregations, subqueries)
4. ❌ Cannot test database transactions properly
5. ❌ Mocks may drift from actual database behavior

---

## 2. Third-Party Library Options

### Option A: Testcontainers (Recommended)
**Package**: `@testcontainers/postgresql`

**Pros:**
- Real PostgreSQL in Docker, identical to production
- Automatic container lifecycle management
- Isolated database per test suite
- Perfect for CI/CD (GitHub Actions has Docker support)
- Tests actual Drizzle ORM queries

**Cons:**
- Slower than mocks (~2-5 seconds startup per container)
- Requires Docker in CI environment
- Slightly more complex setup

**Usage:**
```typescript
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const container = await new PostgreSqlContainer().start();
const connectionString = container.getConnectionUri();
```

### Option B: pg-mem (In-Memory PostgreSQL)
**Package**: `pg-mem`

**Pros:**
- Very fast (in-memory)
- No Docker required
- Works in any environment

**Cons:**
- Not 100% PostgreSQL compatible
- May not support all Drizzle ORM features
- Some PostgreSQL functions/extensions not available
- Can give false positives/negatives

### Option C: Docker Compose Test Database
**Approach**: Use existing `docker-compose.dev.yml` with a separate test database

**Pros:**
- Simple to implement
- Uses existing infrastructure
- Real PostgreSQL

**Cons:**
- Manual container management
- Shared database between test runs (need cleanup strategy)
- Not as isolated as testcontainers

### Recommendation
**Use Testcontainers** for integration tests because:
1. Real PostgreSQL behavior guarantees test accuracy
2. Container isolation prevents test pollution
3. Automatic cleanup after tests
4. Works in GitHub Actions (already used for CI)

---

## 3. Test Cases to Migrate to Real Database

### High Priority - Server Actions (Database-Heavy)

| Test File | Current Mocks | Migration Benefit |
|-----------|---------------|-------------------|
| `__tests__/app/households/parcels/actions.test.ts` | Full DB mock | Tests actual parcel CRUD operations |
| `__tests__/app/households/edit/actions.test.ts` | Full DB mock | Tests household updates with constraints |
| `__tests__/app/schedule/actions/schedule-actions.test.ts` | Full DB mock | Tests complex schedule queries |
| `__tests__/app/settings/parcels/actions.test.ts` | Full DB mock | Tests settings persistence |
| `__tests__/app/parcels/softDeleteParcel.test.ts` | Full DB mock | Tests soft delete behavior |

### High Priority - Integration Tests

| Test File | Current Mocks | Migration Benefit |
|-----------|---------------|-------------------|
| `__tests__/app/households/user-profile-data.integration.test.ts` | ORM chain mock | Tests actual user upsert |
| `__tests__/app/auth/auth-flow.test.ts` | Auth mock | Tests session persistence |
| `__tests__/app/auth/session-callbacks.test.ts` | Callback mock | Tests token refresh with DB |

### High Priority - API Routes

| Test File | Current Mocks | Migration Benefit |
|-----------|---------------|-------------------|
| `__tests__/app/api/admin/sms/statistics.test.ts` | Full chain mock | Tests aggregation queries |
| `__tests__/app/api/admin/sms/dashboard/route.test.ts` | Full chain mock | Tests dashboard data |
| `__tests__/app/api/admin/parcels/upcoming/route.test.ts` | Full chain mock | Tests parcel queries |
| `__tests__/app/api/admin/verification-questions/route.test.ts` | Full chain mock | Tests question management |

### Medium Priority - Validation with DB Lookups

| Test File | Current Approach | Migration Benefit |
|-----------|------------------|-------------------|
| `__tests__/utils/validation/parcel-assignment.test.ts` | Pure functions | Could test with real constraints |
| `__tests__/app/households/enroll/capacity.test.ts` | Mock capacity | Test real capacity calculations |
| `__tests__/app/utils/anonymization/anonymize-household.test.ts` | Mock DB | Test actual anonymization |

### Keep as Unit Tests (No DB needed)

These tests should remain mock-based as they test pure logic:
- `__tests__/utils/date-utils-dst.test.ts` - Date calculations
- `__tests__/utils/deep-equal.test.ts` - Utility functions
- `__tests__/utils/schedule/*.test.ts` - Schedule logic (pure functions)
- `__tests__/translations/*.test.ts` - i18n validation
- `__tests__/middleware.test.ts` - Next.js middleware logic

---

## 4. Important Implementation Considerations

### 4.1 Test Isolation Strategies

**Option A: Transaction Rollback (Fastest)**
```typescript
beforeEach(async () => {
  await db.execute(sql`BEGIN`);
});

afterEach(async () => {
  await db.execute(sql`ROLLBACK`);
});
```
- ✅ Very fast (no data cleanup needed)
- ❌ Cannot test transaction behavior in code

**Option B: Truncate Tables (Recommended)**
```typescript
afterEach(async () => {
  await db.execute(sql`TRUNCATE TABLE households, food_parcels, ... RESTART IDENTITY CASCADE`);
});
```
- ✅ Clean state for each test
- ✅ Can test transactions
- ❌ Slower than rollback

**Option C: Separate Database per Test**
- ✅ Perfect isolation
- ❌ Very slow (not recommended)

### 4.2 Test Data Seeding

Create factory functions for consistent test data:
```typescript
// __tests__/factories/household.ts
export const createTestHousehold = async (overrides = {}) => {
  const defaults = {
    first_name: 'Test',
    last_name: 'User',
    phone_number: '+46701234567',
    // ...
  };
  const [household] = await db.insert(households).values({ ...defaults, ...overrides }).returning();
  return household;
};
```

### 4.3 CI/CD Integration

**GitHub Actions already supports Docker**, so testcontainers will work:
```yaml
# .github/workflows/build.yml
- name: Run integration tests
  run: pnpm test:integration
  env:
    TESTCONTAINERS_RYUK_DISABLED: true  # For CI environments
```

### 4.4 Performance Considerations

| Approach | Speed | Use Case |
|----------|-------|----------|
| Current mocks | ~5-10s total | Keep for unit tests |
| Testcontainers (reused) | +5-10s startup | Integration tests |
| Testcontainers (per suite) | +2-5s per suite | Heavy isolation needs |

**Strategy**: Run unit tests and integration tests separately:
```json
{
  "test": "vitest run",
  "test:unit": "vitest run --exclude '**/*.integration.test.ts'",
  "test:integration": "vitest run --include '**/*.integration.test.ts'"
}
```

### 4.5 Database Schema Synchronization

Ensure test database has correct schema:
```typescript
// __tests__/db/setup.ts
import { migrate } from 'drizzle-orm/postgres-js/migrator';

export const setupTestDb = async (connectionString: string) => {
  const client = postgres(connectionString);
  const testDb = drizzle(client);
  await migrate(testDb, { migrationsFolder: './migrations' });
  return testDb;
};
```

---

## 5. Implementation Phases

### Phase 1: Infrastructure Setup
1. Install `@testcontainers/postgresql`
2. Create `__tests__/db/test-container.ts` - Container management
3. Create `__tests__/db/setup.ts` - Schema migration for test DB
4. Create `__tests__/db/cleanup.ts` - Table truncation utilities
5. Update `vitest.config.ts` with integration test configuration

### Phase 2: Factory Functions
1. Create `__tests__/factories/` directory
2. Implement factories for main entities:
   - `household.factory.ts`
   - `food-parcel.factory.ts`
   - `pickup-location.factory.ts`
   - `user.factory.ts`
   - `sms-message.factory.ts`

### Phase 3: Migrate High-Priority Tests
1. Convert `parcels/actions.test.ts` → `parcels/actions.integration.test.ts`
2. Convert `user-profile-data.integration.test.ts` to use real DB
3. Convert SMS statistics API tests
4. Convert schedule action tests

### Phase 4: CI/CD Updates
1. Update GitHub Actions workflow
2. Add separate test commands for unit vs integration
3. Configure test timeouts for integration tests

### Phase 5: Documentation & Patterns
1. Document testing patterns for the team
2. Create example tests as templates
3. Update contribution guidelines

---

## 6. File Structure Proposal

```
__tests__/
├── db/
│   ├── test-container.ts     # Testcontainers setup
│   ├── setup.ts              # Schema migration
│   ├── cleanup.ts            # Table truncation
│   └── connection.ts         # Test DB connection
├── factories/
│   ├── household.factory.ts
│   ├── food-parcel.factory.ts
│   ├── pickup-location.factory.ts
│   ├── user.factory.ts
│   └── index.ts              # Export all factories
├── integration/              # New integration tests
│   ├── households/
│   ├── parcels/
│   ├── api/
│   └── auth/
└── unit/                     # Existing unit tests (reorganized)
```

---

## 7. Dependencies to Add

```json
{
  "devDependencies": {
    "@testcontainers/postgresql": "^10.x.x"
  }
}
```

No other third-party libraries are strictly required. Testcontainers provides everything needed for container management.

---

## 8. Estimated Effort

| Phase | Effort | Description |
|-------|--------|-------------|
| Phase 1 | 1-2 days | Infrastructure setup |
| Phase 2 | 1 day | Factory functions |
| Phase 3 | 3-5 days | Migrate ~15-20 high-priority tests |
| Phase 4 | 0.5 day | CI/CD updates |
| Phase 5 | 0.5 day | Documentation |

**Total: ~6-9 days of work**

---

## 9. Success Criteria

- [ ] Integration tests run against real PostgreSQL
- [ ] All migrations apply correctly in test environment
- [ ] Test isolation prevents data leakage between tests
- [ ] CI/CD pipeline runs integration tests successfully
- [ ] Test suite completes in reasonable time (<5 minutes for integration)
- [ ] Clear separation between unit tests (fast, mocked) and integration tests (real DB)

---

## 10. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Slower test execution | Separate unit/integration test runs |
| Docker not available in some CI environments | Use GitHub Actions with Docker support (already in use) |
| Test data cleanup failures | Use TRUNCATE CASCADE, add cleanup verification |
| Schema drift between test and production | Run same migrations, add schema validation |
| Flaky tests from timing issues | Use proper async/await, add retries for container startup |

---

## Next Steps

1. Confirm this approach with the team
2. Start with Phase 1 infrastructure
3. Pick one test file as a pilot (suggest: `parcels/actions.test.ts`)
4. Validate the pattern works before scaling

Would you like me to proceed with implementing Phase 1?
