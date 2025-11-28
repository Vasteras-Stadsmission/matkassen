# Matkassen - AI Agent Instructions

## ⚠️ Critical Checklist - READ FIRST

Before making ANY changes:

- [ ] **Server actions use `protectedAction()`** - MANDATORY (enforced by `pnpm run validate`)
- [ ] **Admin API routes use `authenticateAdminRequest()`** - MANDATORY for `/api/admin/*`
- [ ] **All user-facing text uses i18n** - No hardcoded strings, use message IDs
- [ ] **Environment variables in 5 places** - `.env.example`, GitHub Secrets, 2 workflows, 2 deploy scripts
- [ ] **No intermediate files** - Edit originals directly, never create temp files
- [ ] **No new docs without permission** - Only edit existing markdown files
- [ ] **Check `.gitignore`** - Never edit `.next/`, `node_modules/`, etc.
- [ ] **Read before editing** - User may have made manual changes

**If unsure, ask first!**

**If unsure, ask first!**

---

## Project Overview

**Production-ready, not yet released** Next.js 15 admin tool for food parcel distribution. Deployed via Docker to VPS with GitHub OAuth authentication.

**Tech Stack**: Next.js 15, PostgreSQL, Drizzle ORM, Mantine v8, Tailwind, NextAuth v5, Playwright, Vitest

**Key Features**: Household management, parcel scheduling, SMS notifications, multi-language support (20+ languages), QR codes

---

## Quick Commands

```bash
# Development
pnpm run dev              # Start dev server (never run yourself - assume already running)
pnpm run validate         # Lint, typecheck, format-check, security checks (run before commit)

# Database
pnpm run db:generate      # Generate migration after schema changes
pnpm run db:migrate       # Apply migrations

# Testing
pnpm test                 # Unit tests (Vitest)
pnpm run test:e2e:auth    # E2E auth setup (one-time, valid 30 days)
pnpm run test:e2e         # Run E2E tests (Playwright)
```

---

## Critical Security Patterns

### Server Actions (MANDATORY)

```typescript
"use server";
import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";

export const myAction = protectedAction(
    async (session, formData: FormData): Promise<ActionResult<string>> => {
        // session is verified - no manual checks needed
        try {
            return success(await doSomething());
        } catch (error) {
            return failure({ code: "FAILED", message: "Operation failed" });
        }
    },
);
```

**Enforcement**: `scripts/validate-server-actions.mjs` (runs in `pnpm run validate`)

### API Routes (MANDATORY for `/api/admin/*`)

```typescript
import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";

export async function GET(request: Request) {
    const authResult = await authenticateAdminRequest();
    if (!authResult.success) return authResult.response!;

    // authResult.session is verified
    return NextResponse.json(await fetchData());
}
```

**Enforcement**: `scripts/validate-api-routes.mjs` (runs in `pnpm run validate`)

**Public exceptions**: `/api/auth/*`, `/api/health`, `/api/csp-report`

### Page Protection

```typescript
// Server components
import { AuthProtection } from "@/components/AuthProtection";
export default function Page() {
    return <AuthProtection>{/* content */}</AuthProtection>;
}

// Client components
"use client";
import { AuthProtectionClient } from "@/components/AuthProtection/client";
```

**All routes require auth except** `/auth/*` and `/p/*` (public parcel pages).

---

## Project Structure

```
app/
  [locale]/          # Admin routes (auth required)
    households/      # Household management
    schedule/        # Parcel scheduling
    handout-locations/  # Pickup locations
  p/                 # PUBLIC parcel pages (no auth, no locale)
  api/               # API routes
  db/                # Drizzle schema & connection
  utils/auth/        # Auth wrappers
components/          # Shared React components
messages/            # i18n (en.json, sv.json, public-*.json)
migrations/          # SQL migrations
e2e/                 # Playwright E2E tests
docs/                # Domain-specific guides
```

---

## Key Conventions

### React Components

- **Default to server components** - only add `"use client"` when using hooks/browser APIs
- **Navigation**: Import from `@/app/i18n/navigation` (locale-aware, NOT `next/navigation`)
- **i18n**: `const t = await getTranslations("namespace")` (server) or `useTranslations()` (client)
- **ALL user-facing text uses i18n** - no hardcoded strings

### Database

- **IDs**: Use exported `nanoid(8)` from `app/db/schema.ts`
- **Connection**: Import `db` from `@/app/db/drizzle`
- **Queries**: Drizzle ORM query builder only

### File Editing

- **Never create intermediate/temp files** - edit originals directly
- **No new markdown files** unless explicitly requested
- **Respect `.gitignore`** - never touch `.next/`, `node_modules/`, etc.
- **No SEO arguments** - This is internal tooling for ~dozen users, SEO is irrelevant

---

## Domain-Specific Documentation

**For detailed information, read these guides**:

- **Authentication & Security**: `docs/auth-guide.md` - Auth patterns, GitHub OAuth, security checklist
- **Development Workflows**: `docs/dev-guide.md` - Local setup, React patterns, database workflow, troubleshooting
- **Testing**: `docs/testing-guide.md` - Unit tests, E2E setup, Playwright patterns, MCP integration
- **Database**: `docs/database-guide.md` - Schema patterns, migrations, query examples, backups
- **Deployment**: `docs/deployment-guide.md` - Environment variables, Docker, CI/CD, monitoring
- **Internationalization**: `docs/i18n-guide.md` - Message management, usage patterns, language switching
- **Business Logic**: `docs/business-logic.md` - Parcel status rules, verification questions, SMS queue

**Human-readable docs**:

- `README.md` - Quick start for humans
- `docs/user-manual.md` - End-user documentation
- `docs/user-flows.md` - User workflows

---

## Common Workflows

### Adding a Server Action

1. Read `docs/auth-guide.md` for patterns
2. Create action with `protectedAction()` wrapper
3. Return `ActionResult<T>` type
4. Run `pnpm run validate` (enforces pattern)

### Schema Change / Database Migration

**⚠️ NEVER create manual SQL migration files!** Always use Drizzle to generate them:

1. Edit `app/db/schema.ts`
2. Run `pnpm run db:generate`
3. Review generated SQL in `migrations/`
4. Run `pnpm run db:migrate`
5. See `docs/database-guide.md` for details

**Why?** Drizzle tracks migrations via `migrations/meta/_journal.json`. Manual SQL files are invisible to Drizzle and won't be applied during deploy. The deploy will "succeed" but your migration won't run.

**For non-schema changes** (indexes, extensions, constraints): Still use `db:generate` after modifying `schema.ts`. Do not create manual SQL migrations or edit `_journal.json` directly—always use Drizzle's migration workflow.

### Adding Environment Variable

**Must update 5 places** (or it won't work in production):

1. `.env.example` - with description
2. GitHub Secrets (if sensitive)
3. `.github/workflows/init_deploy.yml`
4. `.github/workflows/continuous_deployment.yml`
5. Both `deploy.sh` and `update.sh`

See `docs/deployment-guide.md` for examples.

### Adding i18n Messages

1. Add to `messages/en.json` and `messages/sv.json`
2. For public pages: add to all `messages/public-*.json` files
3. Use via `t("namespace.key")`
4. See `docs/i18n-guide.md` for patterns

### Writing E2E Tests

1. Run `pnpm run test:e2e:auth` (first time only, valid 30 days)
2. Use `[data-testid]` selectors (preferred)
3. Test static behavior only (no data mutations without seed infrastructure)
4. See `docs/testing-guide.md` for philosophy and patterns

---

## Special Notes

### Parcel Status Display Logic

**Date-only comparison** (not time-based):

- Same-day parcels ALWAYS show "upcoming" (blue), even if pickup window passed
- Only previous-day parcels show "not picked up" (red)
- Staff MUST manually mark as picked up

**Rationale**: Households may arrive late. Staff processes throughout the day. Don't prematurely mark as "not picked up."

**Code**: `app/[locale]/households/[id]/components/HouseholdDetailsPage.tsx` - `isDateInPast()`

**Tests**: `__tests__/app/households/parcel-status-display.test.ts`

See `docs/business-logic.md` for full explanation.

### Background Services

SMS scheduler runs automatically via custom Next.js server (`server.js`). Uses PostgreSQL advisory locks for safety across instances.

**Monitor**: `curl https://your-domain.com/api/health`

---

## When You Need More Context

1. **Check domain guides first** - They have detailed patterns and examples
2. **Use `semantic_search`** - Search codebase for similar implementations
3. **Use `grep_search`** - Find exact patterns in code
4. **Read the actual files** - User may have made manual changes

**Don't make assumptions** - gather context before acting.

---

## Build Validation

Always run before committing:

```bash
pnpm run validate
```

This enforces:

- ESLint rules
- TypeScript strict mode
- Prettier formatting
- Server action security patterns (`scripts/validate-server-actions.mjs`)
- API route security patterns (`scripts/validate-api-routes.mjs`)

**CI/CD gate** - Deployment fails if validation fails.
