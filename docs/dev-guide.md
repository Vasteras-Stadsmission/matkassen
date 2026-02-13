# Development Guide

## Project Overview

Next.js 15 admin tool for managing food parcel distribution. **Production-ready, not yet released**. Pre-release status means no backwards compatibility concerns.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start dev server (includes PostgreSQL in Docker)
pnpm run dev
```

App runs at http://localhost:3000

**Note**: Never run `pnpm dev` yourself in terminal - assume it's already running.

## Local Development Modes

1. **Fast development** (recommended):
    - `pnpm run dev`
    - Next.js runs locally
    - PostgreSQL in Docker

2. **Full stack testing**:
    - `pnpm run preview:production`
    - All services in Docker
    - Mirrors production (except SSL)

## Tech Stack

- **Framework**: Next.js 15 App Router (TypeScript strict mode)
- **Database**: PostgreSQL with Drizzle ORM
- **Styling**: Mantine v8 + Tailwind CSS (via PostCSS)
- **i18n**: `next-intl` with Swedish (sv) default, English (en) support
- **Auth**: NextAuth v5 with GitHub OAuth + GitHub App for org membership
- **Deployment**: Docker Compose with Nginx reverse proxy, Certbot SSL

## Project Structure

```
app/
  [locale]/          # Localized admin routes (requires auth)
    households/      # Household management
    schedule/        # Food parcel scheduling
    handout-locations/  # Pickup location management
  p/                 # PUBLIC parcel pages (no locale, no auth)
  api/               # API routes (auth checked in middleware)
  db/                # Drizzle schema & connection
  utils/auth/        # Auth wrappers & validation
components/          # Shared React components
messages/            # i18n JSON files (en.json, sv.json, public-*.json)
migrations/          # SQL migration files (auto-generated + custom)
e2e/                 # Playwright E2E tests
```

## Database Workflow

### Schema Changes

1. Edit `app/db/schema.ts`
2. Generate migration: `pnpm run db:generate`
3. Apply migration: `pnpm run db:migrate`

### Custom SQL Migrations

For seed data or complex DDL:

```bash
pnpm exec drizzle-kit generate --custom --name=description-of-change
```

Edit the generated `.sql` file in `migrations/` directory.

### Database Conventions

- **Primary keys**: Use exported `nanoid(8)` function from `app/db/schema.ts`
- **Connection**: Import `db` from `@/app/db/drizzle` (has build-time mocks for tests)
- **Queries**: Use Drizzle ORM query builder, not raw SQL

### Example Schema Change

```typescript
// app/db/schema.ts
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "./schema"; // Use exported function

export const examples = pgTable("examples", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => nanoid()),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

## Development Commands

```bash
# Development
pnpm run dev              # Start dev server

# Database
pnpm run db:generate      # Generate migration from schema changes
pnpm run db:migrate       # Apply migrations

# Testing
pnpm test                 # Run unit tests (Vitest)
pnpm run test:e2e         # Run E2E tests (Playwright)
pnpm run test:e2e:auth    # Setup E2E authentication (first time only)

# Code Quality
pnpm run validate         # Lint, typecheck, format-check, security checks
pnpm run format           # Auto-fix formatting with Prettier
pnpm run lint             # ESLint
pnpm run typecheck        # TypeScript compiler check

# Production Preview
pnpm run preview:production  # Full Docker stack (mirrors production)
```

## React Component Patterns

### Server Components (Default)

```typescript
// app/[locale]/example/page.tsx
import { getTranslations } from "next-intl/server";

export default async function ExamplePage() {
    const t = await getTranslations("namespace");
    return <div>{t("key")}</div>;
}
```

### Client Components (Only When Needed)

```typescript
// components/ExampleClient.tsx
"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function ExampleClient() {
    const t = useTranslations("namespace");
    const [count, setCount] = useState(0);
    return <button onClick={() => setCount(count + 1)}>{t("count", { count })}</button>;
}
```

**Rule**: Default to server components. Only add `"use client"` when using:

- React hooks (`useState`, `useEffect`, etc.)
- Browser APIs (`window`, `document`, etc.)
- Event handlers (`onClick`, `onChange`, etc.)

### Navigation

```typescript
// Use locale-aware navigation
import { Link } from "@/app/i18n/navigation";

// NOT from 'next/navigation'
```

## Internationalization (i18n)

### Message Files

- **Admin UI**: `messages/en.json` and `messages/sv.json`
- **Public pages**: `messages/public-{locale}.json` (20+ languages)

### Usage Patterns

```typescript
// Server component
const t = await getTranslations("namespace");

// Client component
const t = useTranslations("namespace");

// In both
<div>{t("key")}</div>
<div>{t("keyWithParam", { name: "John" })}</div>
```

**Rule**: ALL user-facing strings must use message IDs - no hardcoded text.

### Adding New Messages

1. Add key to `messages/en.json` and `messages/sv.json`
2. For public pages, add to all `messages/public-*.json` files
3. Use in code via `t("namespace.key")`

### Default Locale

Swedish (sv) is the default. English (en) is fully supported.

## Styling

### Mantine + Tailwind

```typescript
import { Button } from "@mantine/core";

<Button className="mt-4 bg-blue-500">
    Click me
</Button>
```

- Use Mantine components for complex UI (modals, tables, forms)
- Use Tailwind utility classes for spacing, colors, layout
- PostCSS config in `postcss.config.cjs` handles Mantine preset
- No standalone Tailwind config file

## Special Routes

### Public Parcel Pages (`/p/[parcelId]`)

- **No locale prefix**: Bypass i18n routing entirely
- **No authentication**: Accessible to households for QR code scanning
- **Middleware exception**: Listed in `middleware.ts` public patterns
- **Separate layout**: `app/p/layout.tsx` with minimal metadata

### API Routes

- **Protected**: All `/api/admin/*` routes require authentication
- **Public exceptions**: `/api/health`, `/api/auth/*`, `/api/csp-report`

## Background Services

Custom Next.js server (`server.js`) starts SMS scheduler automatically on production boot.

Uses PostgreSQL advisory locks for queue processing safety across multiple instances.

### Database Health Check

The custom server waits for database connectivity before starting the scheduler using `app/db/health-check.js` (CommonJS module). This prevents "database not ready" errors during container startup.

## Logging

Server-side code uses [Pino](https://getpino.io/) for structured JSON logging. Client components use `console.*` (runs in browser).

### Usage

```typescript
import { logger, logError, logCron } from "@/app/utils/logger";

// Server-side only (app/ directory)
logger.info({ userId: "123" }, "User action");
logger.warn({ count: 0 }, "No items found");
logError("Failed to process", error, { context: "data" });
logCron("anonymization", "completed", { anonymized: 10 });

// Client-side (components/ directory)
console.error("Browser error", { context });
```

### Log Levels

- **Development**: `debug` (shows all logs, pretty-printed)
- **Production**: `info` (JSON output for docker logs)
- **Override**: Set `LOG_LEVEL` env var (debug, info, warn, error, fatal)

### PII Protection (CRITICAL)

**Never log personally identifiable information.** This is critical for GDPR compliance and user privacy.

**✅ Safe to log (use these):**

- `householdId` - UUID references
- `parcelId` - UUID references
- `locationId` - UUID references
- `userId` - GitHub username (public identifier)
- Counts, timestamps, status codes

**❌ NEVER log (contains PII):**

- `firstName`, `lastName`, `name` - Real names
- `phone`, `phoneNumber` - Phone numbers
- `email` - Email addresses
- `address` - Location data
- `age`, `sex` - Demographics
- Any raw household/member objects

**Example:**

```typescript
// ❌ BAD - Logs PII
logger.info({ household }, "Household enrolled");

// ✅ GOOD - Only IDs
logger.info({ householdId: household.id }, "Household enrolled");
```

### ESLint Enforcement

The `no-console` rule prevents accidental console usage in server code. Exemptions:

- Client components (`components/**`) - browser logging
- Tests, config files, build scripts

## Code Quality Standards

### Before Committing

```bash
pnpm run validate
```

This enforces:

- ESLint rules
- TypeScript strict mode
- Prettier formatting
- Security patterns (server actions, API routes)

### Key Rules

- **No intermediate files**: Edit originals directly
- **No new markdown files**: Unless explicitly requested
- **Respect `.gitignore`**: Never edit `.next/`, `node_modules/`, etc.
- **Use protection wrappers**: All server actions and API routes (see auth guide)
- **Use i18n**: No hardcoded user-facing strings

### TypeScript Conventions

- Strict mode enforced
- Use function components with hooks (no class components)
- Prefer type inference over explicit types
- Use discriminated unions for result types (`ActionResult<T>`)

## Business Logic Patterns

### Parcel Status Display

**Important**: Status badges use **date-only** comparison, not time-based.

- Same-day parcels ALWAYS show as "upcoming" (blue badge)
- Only parcels from PREVIOUS days show as "not picked up" (red badge)

**Rationale**: Households may arrive late. Staff processes throughout the day. We don't want to prematurely mark parcels as "not picked up" while staff are actively working.

**Code location**: `app/[locale]/households/[id]/components/HouseholdDetailsPage.tsx` - `isDateInPast()` function

**Test coverage**: `__tests__/app/households/parcel-status-display.test.ts`

## Troubleshooting

### Port Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 pnpm run dev
```

### Database Connection Issues

```bash
# Restart PostgreSQL container
docker compose -f docker-compose.dev.yml restart db

# Check logs
docker compose -f docker-compose.dev.yml logs db
```

### TypeScript Errors After Schema Changes

```bash
# Regenerate Drizzle types
pnpm run db:generate

# Rebuild TypeScript
rm -rf .next
pnpm run dev
```

## Related Documentation

- **Authentication**: See `docs/auth-guide.md` for security patterns
- **Testing**: See `docs/testing-guide.md` for test setup
- **Database**: See `docs/database-guide.md` for schema patterns
- **Deployment**: See `docs/deployment-guide.md` for production setup
- **i18n**: See `docs/i18n-guide.md` for message management
