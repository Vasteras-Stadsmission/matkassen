# Database Guide

## Overview

PostgreSQL database with Drizzle ORM for type-safe queries and migrations.

## Connection

```typescript
// Import db instance (has build-time mocks for tests)
import { db } from "@/app/db/drizzle";
import { households } from "@/app/db/schema";

// Use Drizzle query builder
const result = await db.select().from(households);
```

## Schema Patterns

### Primary Keys

**Always use the exported `nanoid(8)` function**:

```typescript
// app/db/schema.ts
import { pgTable, text } from "drizzle-orm/pg-core";
import { customAlphabet } from "nanoid";

// Exported function - use this everywhere
export const nanoid = customAlphabet(
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    8,
);

export const examples = pgTable("examples", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => nanoid()),
    // ... other fields
});
```

### Foreign Keys

```typescript
export const parcels = pgTable("parcels", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => nanoid()),
    householdId: text("household_id")
        .notNull()
        .references(() => households.id, { onDelete: "cascade" }),
});
```

### Timestamps

```typescript
import { timestamp } from "drizzle-orm/pg-core";

export const examples = pgTable("examples", {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### Enums

```typescript
import { pgEnum } from "drizzle-orm/pg-core";

export const parcelStatusEnum = pgEnum("parcel_status", ["pending", "picked_up", "cancelled"]);

export const parcels = pgTable("parcels", {
    status: parcelStatusEnum("status").notNull().default("pending"),
});
```

## Migration Workflow

### 1. Schema Changes

Edit `app/db/schema.ts`:

```typescript
export const households = pgTable("households", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => nanoid()),
    name: text("name").notNull(),
    // Add new field
    phoneNumber: text("phone_number"),
});
```

### 2. Generate Migration

```bash
pnpm run db:generate
```

This creates a timestamped SQL file in `migrations/` directory.

### 3. Review Migration

Open the generated `.sql` file and verify:

- Column additions/removals
- Index creation
- Constraint changes

### 4. Apply Migration

```bash
pnpm run db:migrate
```

This runs all pending migrations against the database.

### 5. Verify

```bash
# Check schema in PostgreSQL
docker exec -it matkassen-db psql -U matkassen -d matkassen -c "\d households"
```

## Deploy-Window Backward Compatibility

Schema migrations run _during_ deployment, while nginx keeps serving
traffic from the new web container. There is a window — from when the
new container becomes healthy until `drizzle-kit migrate` finishes —
where the new code runs against the old schema. This window can be up
to 5 minutes for slow migrations (the timeout in `update.sh`).

**Rule: every migration must be additive and backward-compatible with the
previous deploy's code.** Specifically:

Safe in a single migration:

- Add a new column that is nullable, or has a default value
- Add a new table, index, function, or view
- Drop a column _only if_ the previous deploy already stopped reading and
  writing it

Will break users mid-deploy if shipped in a single migration:

- Drop or rename a column the previous deploy's code still reads
- Add `NOT NULL` to an existing column without a default
- Change a column's type (`ALTER COLUMN ... TYPE`)
- Drop or rename a table the previous deploy's code still references

For breaking changes, use the **expand → migrate → contract** pattern
across two deploys:

1. **Expand:** add the new column/table alongside the old one. Code
   reads old, writes both. Deploy.
2. **Migrate (data):** backfill the new column from the old one. Run
   as a separate migration or background job once expand is in prod.
3. **Contract:** switch code to read the new, stop writing the old,
   then drop the old in a follow-up migration. Deploy.

This rule is enforced socially today; a future PR may add a CI guard
that greps generated SQL for destructive DDL. The corresponding
deploy-side logic lives in `update.sh` near the migration step.

## Custom Migrations

For seed data, complex DDL, or data transformations:

```bash
pnpm exec drizzle-kit generate --custom --name=seed-initial-locations
```

Edit the generated file:

```sql
-- migrations/0001_seed-initial-locations.sql
INSERT INTO handout_locations (id, name, address, created_at)
VALUES
    ('loc12345', 'Main Office', '123 Main St', NOW()),
    ('loc67890', 'North Branch', '456 North Ave', NOW());
```

Then apply:

```bash
pnpm run db:migrate
```

## Query Patterns

### Basic Select

```typescript
import { db } from "@/app/db/drizzle";
import { households } from "@/app/db/schema";

const allHouseholds = await db.select().from(households);
```

### Where Clause

```typescript
import { eq } from "drizzle-orm";

const household = await db.select().from(households).where(eq(households.id, "abc123"));
```

### Joins

```typescript
import { parcels, households } from "@/app/db/schema";

const parcelsWithHouseholds = await db
    .select()
    .from(parcels)
    .innerJoin(households, eq(parcels.householdId, households.id));
```

### Insert

```typescript
import { nanoid } from "@/app/db/schema";

await db.insert(households).values({
    id: nanoid(),
    name: "Smith Family",
    phoneNumber: "+46701234567",
});
```

### Update

```typescript
await db.update(households).set({ phoneNumber: "+46709876543" }).where(eq(households.id, "abc123"));
```

### Delete

```typescript
await db.delete(households).where(eq(households.id, "abc123"));
```

## Transactions

```typescript
import { db } from "@/app/db/drizzle";
import { households, parcels } from "@/app/db/schema";

await db.transaction(async tx => {
    const household = await tx.insert(households).values({ name: "New Family" }).returning();

    await tx.insert(parcels).values({
        householdId: household[0].id,
        scheduledDate: new Date(),
    });
});
```

## Testing with Mocked Database

The `db` instance has build-time mocks for tests:

```typescript
// __tests__/example.test.ts
import { db } from "@/app/db/drizzle";
import { vi } from "vitest";

// Mock database query
vi.spyOn(db, "select").mockReturnValue({
    from: vi.fn().mockResolvedValue([{ id: "test123", name: "Test" }]),
});
```

## Database Conventions

### Naming

- **Tables**: Plural, snake_case (`households`, `parcel_schedules`)
- **Columns**: snake_case (`phone_number`, `created_at`)
- **Enums**: Singular, snake_case (`parcel_status`, `user_role`)

### Schema Organization

Group related tables in `app/db/schema.ts`:

```typescript
// Households
export const households = pgTable(/* ... */);
export const householdMembers = pgTable(/* ... */);

// Parcels
export const parcels = pgTable(/* ... */);
export const parcelSchedules = pgTable(/* ... */);

// Locations
export const handoutLocations = pgTable(/* ... */);
```

### Indexes

Add indexes for frequently queried columns:

```typescript
export const parcels = pgTable(
    "parcels",
    {
        householdId: text("household_id").notNull(),
        scheduledDate: timestamp("scheduled_date").notNull(),
    },
    table => ({
        householdIdx: index("parcels_household_idx").on(table.householdId),
        dateIdx: index("parcels_date_idx").on(table.scheduledDate),
    }),
);
```

## PostgreSQL Advisory Locks

For background job processing (SMS scheduler):

```typescript
import { db } from "@/app/db/drizzle";
import { sql } from "drizzle-orm";

// Acquire lock (returns true if successful)
const lockAcquired = await db.execute(sql`SELECT pg_try_advisory_lock(123456)`);

// Release lock
await db.execute(sql`SELECT pg_advisory_unlock(123456)`);
```

**Used in**: `server.js` - SMS scheduler (prevents duplicate processing across instances)

## Environment Variables

```bash
# .env
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

Required in:

1. `.env` (local development)
2. `.env.example` (documentation)
3. GitHub Secrets (if sensitive)
4. CI/CD workflows (see deployment guide)
5. Deploy scripts (`deploy.sh`, `update.sh`)

## Troubleshooting

### Migration Fails

```bash
# Check migration history
docker exec -it matkassen-db psql -U matkassen -d matkassen -c "SELECT * FROM drizzle_migrations"

# Rollback (manual)
# Edit migrations table to remove failed migration
# Fix schema.ts
# Regenerate migration
```

### Connection Pool Exhausted

```typescript
// app/db/drizzle.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20, // Increase pool size
});

export const db = drizzle(pool);
```

### Slow Queries

```sql
-- Enable query logging (PostgreSQL)
ALTER DATABASE matkassen SET log_statement = 'all';
ALTER DATABASE matkassen SET log_duration = on;
```

Then check Docker logs:

```bash
docker compose logs db | grep "duration:"
```

## Backup & Restore

### Local Development (Unencrypted)

For local development and testing:

```bash
# Backup
docker exec matkassen-db pg_dump -U matkassen matkassen > backup.sql

# Restore
docker exec -i matkassen-db psql -U matkassen matkassen < backup.sql
```

### Production (Encrypted with GPG) 🔒

Production backups are encrypted with symmetric AES256 GPG before they leave the host. The full pipeline (`pg_dump → gpg → rclone → Swift`) plus the round-trip validation that runs after each upload lives in `scripts/backup-db.sh`. See `docs/deployment-guide.md` for setup, monitoring, troubleshooting, and passphrase rotation.

#### Restore Procedure

**⚠️ WARNING:** This will **REPLACE ALL DATA** in the target database.

```bash
# 1. SSH to production server
ssh matkassen-production
cd ~/matkassen

# 2. Gate the restore on the production marker. The passphrase is
#    already in the db-backup container's env via docker-compose.backup.yml
#    — no local export needed.
export ENV_NAME=production

# 3. List available backups
./scripts/backup-restore.sh
# (running with no arg prints the last 20 backups in Swift)

# 4. Restore by filename — the script downloads from Swift and prompts y/N
./scripts/backup-restore.sh matkassen_backup_20250101_020000.dump.gpg
```

#### Post-Restore Steps

```bash
# 1. Verify application health
curl https://matcentralen.com/api/health

# 2. Run pending migrations (if schema changed)
pnpm run db:migrate

# 3. Restart application containers
docker compose restart web

# 4. Sanity-check critical flows: login, households list, create parcel
```

#### Restore Drill

The nightly backup job restores every backup into a throwaway `matkassen_nightly_validate` database on the same Postgres instance and runs a sentinel query against it. A failed nightly restore is a Slack alert, so there is no separate manual drill cadence — the drill is the job.

**Caveat**: this validates "the backup is restorable to this Postgres cluster." It does NOT validate "we can rebuild on a fresh host." A true cross-host DR drill (provision a new VPS, install Postgres, restore from Swift, bring the app up against the restored DB) is a separate exercise that is not automated.

## Related Documentation

- **Development**: See `docs/dev-guide.md` for setup
- **Deployment**: See `docs/deployment-guide.md` for production database configuration
