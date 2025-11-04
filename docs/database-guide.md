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

Production backups are **always encrypted** for GDPR compliance.

#### Prerequisites

1. **DB_BACKUP_PASSPHRASE** - Get from team lead or GitHub Secrets
2. **Encrypted backup file** - `.sql.gpg` format
3. **Server access** - SSH to production server

#### Restore Procedure

**⚠️ WARNING:** This will **REPLACE ALL DATA** in the target database.

```bash
# 1. SSH to production server
ssh matkassen-production

# 2. Set required environment variables
export DB_BACKUP_PASSPHRASE="your-passphrase-from-github-secrets"
export POSTGRES_HOST=localhost
export POSTGRES_USER=matkassen
export POSTGRES_DB=matkassen
export POSTGRES_PASSWORD="production-db-password"

# 3. Restore from encrypted backup (requires --force flag for safety)
./scripts/db-restore.sh /var/backups/matkassen/matkassen_backup_20250101_120000.sql.gpg --force
```

#### What the Restore Script Does

1. ✅ Validates all environment variables are set
2. ✅ Verifies backup file exists
3. ✅ Checks SHA256 checksum (if `.sha256` file exists)
4. ✅ Decrypts using GPG (no intermediate plaintext files)
5. ✅ Pipes directly to `pg_restore` → database
6. ✅ Uses `--clean --if-exists` (drops existing objects first)

#### Post-Restore Steps

```bash
# 1. Verify application health
curl https://matcentralen.com/api/health

# 2. Run pending migrations (if schema changed)
cd ~/matkassen
pnpm run db:migrate

# 3. Restart application containers
docker compose restart web

# 4. Test critical functionality
# - Login as admin
# - View households list
# - Create test parcel
```

#### Troubleshooting

**Wrong passphrase:**
```
gpg: decryption failed: Bad session key
```
→ Double-check `DB_BACKUP_PASSPHRASE` value

**Checksum verification failed:**
```
ERROR: Checksum verification failed
The backup file may be corrupted or tampered with
```
→ Re-download backup file from backup storage

**Permission denied:**
```
ERROR: must be owner of extension plpgsql
```
→ Use `--no-owner --no-privileges` (already included in script)

#### Creating Manual Backups

```bash
# Set environment variables
export DB_BACKUP_PASSPHRASE="..."
export POSTGRES_PASSWORD="..."

# Run backup script
./scripts/db-backup.sh

# Output:
# /var/backups/matkassen/matkassen_backup_YYYYMMDD_HHMMSS.sql.gpg
# /var/backups/matkassen/matkassen_backup_YYYYMMDD_HHMMSS.sql.gpg.sha256
```

#### Backup Testing

Test restore procedure every 6 months (GDPR compliance):

```bash
# 1. Create test database
docker exec -it matkassen-db psql -U matkassen -c "CREATE DATABASE matkassen_restore_test"

# 2. Restore to test database
export POSTGRES_DB=matkassen_restore_test
./scripts/db-restore.sh /path/to/backup.sql.gpg --force

# 3. Verify data integrity
docker exec -it matkassen-db psql -U matkassen -d matkassen_restore_test -c "SELECT COUNT(*) FROM households"

# 4. Clean up
docker exec -it matkassen-db psql -U matkassen -c "DROP DATABASE matkassen_restore_test"
```

**For automated backup configuration and initial setup:** See `docs/deployment-guide.md`

## Related Documentation

- **Development**: See `docs/dev-guide.md` for setup
- **Deployment**: See `docs/deployment-guide.md` for production database configuration
