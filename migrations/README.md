# Database Migrations

This project uses [Drizzle ORM](https://orm.drizzle.team/) for database migrations.

## How to Create a Migration

**NEVER create migration files manually.** Always use the Drizzle Kit CLI.

### Step-by-step process:

1. **Modify the schema** in `app/db/schema.ts`
   - Add new tables, columns, indexes, etc.
   - Drizzle will detect the diff automatically

2. **Generate the migration** by running:
   ```bash
   npx drizzle-kit generate
   ```

3. **Verify the generated files:**
   - A new SQL file will be created: `migrations/XXXX_random_name.sql`
   - A snapshot JSON will be created: `migrations/meta/XXXX_snapshot.json`
   - The journal will be updated: `migrations/meta/_journal.json`

4. **Review the generated SQL** to ensure it matches your intentions

5. **Commit all generated files** together

## What NOT to do

- Do NOT manually create `.sql` files in this folder
- Do NOT manually edit `_journal.json`
- Do NOT manually create snapshot JSON files
- Do NOT rename the auto-generated migration files

## Why?

Drizzle Kit maintains consistency between:
- Your TypeScript schema (`app/db/schema.ts`)
- The migration SQL files
- The snapshot JSON files (used for diffing)
- The journal (tracks migration order)

Manually creating files breaks this consistency and can cause migration failures.

## Running Migrations

Migrations are automatically applied when the application starts (see `app/db/migrate.ts`).

## Seeding Data

For seeding initial data (like default privacy policies, verification questions, etc.):
- Use the admin UI after deployment, OR
- Create a separate seed script in `scripts/` folder
- Do NOT use migrations for seed data
