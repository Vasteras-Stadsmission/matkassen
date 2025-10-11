# Matkassen - Food Parcel Distribution System

## ⚠️ AI Agent Checklist - READ BEFORE TAKING ACTION

Before making any changes, verify:

- [ ] **No new markdown files** - Only edit existing docs unless explicitly requested
- [ ] **No intermediate files** - Edit originals directly, never create temp files
- [ ] **Check `.gitignore`** - Never edit generated files (`.next/`, `node_modules/`, etc.)
- [ ] **Server actions use `protectedAction()`** - MANDATORY security wrapper
- [ ] **All user-facing text uses i18n** - No hardcoded strings, use message IDs
- [ ] **Environment variables in 5 places** - `.env.example`, GitHub Secrets, workflows, deploy scripts
- [ ] **Read file before editing** - User may have made manual changes
- [ ] **Multi-replace for efficiency** - Use `multi_replace_string_in_file` when possible

If unsure, ask first!

---

## Project Overview

This is a **production-ready, not yet released** Next.js 15 admin tool for managing food parcel distribution, deployed via Docker to VPS. Uses GitHub OAuth for authentication with organization membership verification. Pre-release status means no backwards compatibility concerns.

## Core Architecture

### Tech Stack

- **Framework**: Next.js 15 App Router (TypeScript strict mode, server components by default)
- **Database**: PostgreSQL with Drizzle ORM + migrations via `drizzle-kit`
- **Styling**: Mantine v8 + Tailwind CSS (PostCSS, no standalone Tailwind config)
- **i18n**: `next-intl` with Swedish (sv) default, English (en) support
- **Auth**: NextAuth v5 with GitHub OAuth + GitHub App for org membership
- **Deployment**: Docker Compose with Nginx reverse proxy, Certbot SSL
- **Testing**: Vitest (unit tests) + Playwright (E2E tests)

### Project Structure

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

## Setup Commands

### Development

```bash
# Install dependencies
pnpm install

# Start dev server (includes PostgreSQL in Docker)
pnpm run dev

# Database commands
pnpm run db:generate  # Generate migration from schema changes
pnpm run db:migrate   # Apply migrations

# Testing
pnpm test             # Run unit tests (Vitest)
pnpm run test:e2e     # Run E2E tests (Playwright)

# Validation (run before committing)
pnpm run validate     # Lint, typecheck, format-check, security checks
```

### E2E Testing with Playwright

```bash
# First-time setup: Authenticate once for E2E tests
pnpm run test:e2e:auth
# Browser opens → Click "Sign in with GitHub" → Complete OAuth → Wait on dashboard

# Run E2E tests
pnpm run test:e2e          # Headless mode
pnpm run test:e2e:ui       # Interactive UI
pnpm run test:e2e:headed   # Watch browser
pnpm run test:e2e:check    # Check setup status

# Re-authenticate if session expires
rm -rf .auth && pnpm run test:e2e:auth
```

**Important**: E2E tests require GitHub OAuth authentication. The session is saved to `.auth/user.json` (gitignored) and reused by all tests. Valid for ~30 days.

## Critical Security Patterns

### Authentication Requirements

**EVERY page must be protected except `/auth/*` and `/p/*` (public parcel pages).**

- **Server components**: Wrap with `<AuthProtection>` (see `components/AuthProtection/index.tsx`)
- **Client components**: Wrap with `<AuthProtectionClient>` (see `components/AuthProtection/client.tsx`)
- **API routes**: Auth checked in `middleware.ts` via cookie presence, full validation in route handlers
- **Server actions**: MANDATORY `protectedAction()` or `protectedHouseholdAction()` wrappers

### Server Action Security Pattern

All server actions return `ActionResult<T>` (discriminated union) and use protection wrappers:

```typescript
// app/[locale]/example/actions.ts
"use server";
import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";

export const myAction = protectedAction(
    async (session, formData: FormData): Promise<ActionResult<string>> => {
        // session is verified - no manual auth checks needed
        try {
            const result = await doSomething();
            return success(result);
        } catch (error) {
            return failure({ code: "FAILED", message: "Operation failed" });
        }
    },
);
```

**Build validation** (`pnpm run validate`) enforces this pattern via `scripts/validate-server-actions.mjs`.

## Development Workflows

### Local Development Modes

1. **Fast development** (recommended): `pnpm run dev` - Next.js runs locally, PostgreSQL in Docker
2. **Full stack testing**: `pnpm run preview:production` - All services in Docker (mirrors production except SSL)

Never run `pnpm dev` yourself - assume it's already running on http://localhost:3000.

### Database Workflow

1. **Schema changes**: Edit `app/db/schema.ts` → run `pnpm run db:generate` (creates SQL migration)
2. **Apply migrations**: `pnpm run db:migrate` (or automatic in Docker/dev)
3. **Custom SQL**: Use `pnpm exec drizzle-kit generate --custom --name=description` for seed data/DDL

Schema uses **nanoid(8)** for primary keys (see `app/db/schema.ts` for the custom nanoid export).

### Testing & Validation

- `pnpm run validate` - Runs lint, typecheck, format-check, security validation (CI/CD gate)
- `pnpm test` - Vitest unit test runner
- `pnpm run test:e2e` - Playwright E2E tests (LOCAL ONLY, see below)
- `pnpm run format` - Prettier auto-fix

## E2E Testing Strategy

**Status**: ⚠️ **LOCAL ONLY** - Not CI-ready

E2E tests require GitHub OAuth authentication and run against a local database. They are **intentionally minimal** to avoid flakiness from database state assumptions.

### Philosophy

- ✅ Test that pages load without crashes
- ✅ Verify authentication state persists
- ✅ Check navigation flows work
- ✅ Validate API endpoints are reachable
- ❌ Do NOT test data mutations (no seed infrastructure yet)
- ❌ Do NOT make assumptions about DB content
- ❌ Do NOT test complex multi-step workflows

### Running E2E Tests

```bash
# ONE-TIME SETUP: Authenticate via copy/paste (valid ~30 days)
pnpm run test:e2e:auth
# Prompts you to copy session cookie from DevTools (takes 10 seconds)

# Run all tests
pnpm run test:e2e

# Run specific test file
pnpm run test:e2e e2e/navigation.spec.ts

# Interactive mode
pnpm run test:e2e:ui

# Watch browser (debugging)
pnpm run test:e2e:headed

# Check auth status
pnpm run test:e2e:check

# Re-authenticate if session expires
rm -rf .auth && pnpm run test:e2e:auth
```

### What E2E Tests Cover

**Current coverage** (stable, non-flaky):

1. **Authentication** (`auth-verification.spec.ts`)

    - Session loads correctly
    - User avatar visible
    - Auth persists across refreshes

2. **Admin Pages** (`admin.spec.ts`)

    - Dashboard, households, schedule, handout locations, SMS dashboard load
    - No crashes (500 errors)
    - No assumptions about content

3. **Navigation** (`navigation.spec.ts`)

    - Sequential navigation through all sections
    - Back/forward browser navigation
    - Direct URL navigation
    - English locale navigation

4. **Public Pages** (`public-parcel.spec.ts`)

    - `/p/*` routes accessible without auth
    - Graceful handling of invalid parcel IDs
    - Multi-language support via query params
    - Protected routes correctly reject unauthenticated users

5. **API Health** (`api-health.spec.ts`)

    - Admin endpoints return 2xx/4xx (never 500 or 404)
    - Proper JSON responses
    - Protected endpoints require auth
    - Public health endpoint accessible

6. **Locale Switching** (`locale-toggle.spec.ts`)
    - Currently SKIPPED (needs `data-testid` on LanguageSwitcher)
    - Will test Swedish ↔ English switching once implemented

### What E2E Tests DON'T Cover (Intentionally)

These require data seeding infrastructure (future work):

- ❌ Household creation workflows
- ❌ Parcel creation and management
- ❌ SMS sending functionality
- ❌ Complex form submissions
- ❌ Data validation with server responses

### Test File Structure

```
e2e/
├── auth.setup.ts                # Authentication setup (required)
├── test-helpers.ts              # Shared utilities
├── auth-verification.spec.ts    # Auth smoke tests
├── admin.spec.ts                # Page load tests
├── navigation.spec.ts           # Navigation flows
├── public-parcel.spec.ts        # Public route tests
├── api-health.spec.ts           # API endpoint checks
└── locale-toggle.spec.ts        # Language switching (skipped)
```

### Writing New E2E Tests

**DO**:

- Use `[data-testid]` selectors when available
- Test static behavior (navigation, page loads)
- Expect pages to work with empty OR full databases
- Use `expectAuthenticated(page)` helper
- Write screenshots to `test-results/` directory

**DON'T**:

- Assume specific data exists (households, locations, parcels)
- Test data mutations without cleanup/seed infrastructure
- Use text content for selectors (breaks with i18n)
- Wait for `networkidle` (use specific element visibility instead)
- Create data during tests (no cleanup mechanism yet)

### Helper Functions

Import from `e2e/test-helpers.ts`:

```typescript
import {
    navigateToLocale,
    expectAuthenticated,
    waitForPageLoad,
    takeScreenshot,
    expectVisibleByTestId,
    clickByTestId,
} from "./test-helpers";

test("example test", async ({ page }) => {
    await navigateToLocale(page, "/households");
    await expectAuthenticated(page);
    await takeScreenshot(page, "households-page");
});
```

### Locator Strategies (Priority Order)

1. **Test IDs** (most reliable): `page.locator('[data-testid="user-avatar"]')`
2. **Accessible Roles**: `page.getByRole('button', { name: 'Sign in' })`
3. **Labels** (for forms): `page.getByLabel('Name')`
4. **Text content**: `page.getByText('Households')` (last resort - breaks with i18n)
5. **CSS selectors**: Avoid unless absolutely necessary

### Future: Data Seeding Infrastructure

When we implement `scripts/e2e-seed.ts`:

1. Pre-seed predictable test data (households, locations, parcels)
2. Use test-specific schema or cleanup between runs
3. Make seeding idempotent (safe to run multiple times)
4. Then enable workflow tests (parcel creation, SMS sending, etc.)

Until then, E2E tests remain minimal smoke tests only.

## Playwright E2E Testing (AI Agent Instructions)

### Overview

The project uses Playwright with MCP (Model Context Protocol) for E2E testing. This allows AI agents to interact with the running application.

### Authentication Context

**Critical**: The application uses GitHub OAuth. Tests require manual authentication once:

1. Run `pnpm run test:e2e:auth` (terminal prompt)
2. Copy session cookie from browser DevTools
3. Paste into terminal
4. Done! Session saved to `.auth/user.json`

All subsequent tests automatically use this saved session. Session expires in ~30 days.

### Protected vs Public Routes

**Protected Routes** (require auth in tests):

- `/[locale]/*` - All admin routes (households, schedule, handout-locations)

**Public Routes** (no auth needed):

- `/p/[parcelId]` - Public parcel pages
- `/auth/*` - Authentication pages

### MCP (Model Context Protocol) Integration

AI agents can control Playwright via MCP. Configuration is in `.github/copilot-mcp.json`:

```json
{
    "mcpServers": {
        "playwright": {
            "command": "pnpm",
            "args": ["exec", "mcp-server-playwright", "--storage-state=.auth/user.json"],
            "env": { "PLAYWRIGHT_BASE_URL": "http://localhost:3000" }
        }
    }
}
```

**For users**: This is automatically configured. Just restart VS Code after first auth setup.

### When AI Agents Are Asked to Test

1. **Check prerequisites**: Verify auth is set up (`pnpm run test:e2e:check`)
2. **Navigate and interact**: Use Playwright MCP tools to control browser
3. **Take screenshots**: Capture visual evidence (writes to `test-results/`)
4. **Report results**: Show errors, screenshots, or success
5. **Suggest improvements**: Recommend `data-testid` attributes if selectors are fragile

**Common requests**:

- "Take a screenshot of [page]"
- "Test if [feature] works"
- "Verify all navigation links work"
- "Check if form validation works correctly"

### Debugging Failed Tests

When tests fail:

1. Check screenshot in `test-results/` directory
2. Check video recording (also in `test-results/`)
3. Verify authentication (if redirected to `/auth/signin`, session expired)
4. Ensure dev server is running on localhost:3000
5. Use `await page.pause()` for interactive debugging

### Mantine UI Components

The app uses Mantine v8. Common patterns:

```typescript
// Modals/Dialogs
await expect(page.locator('[role="dialog"]')).toBeVisible();
await page.locator('[role="dialog"] input[name="name"]').fill("Test");

// Notifications
await expect(page.locator('[class*="mantine-Notification"]')).toContainText("Success");

// Tables (mantine-datatable)
const row = page.locator("tbody tr", { hasText: "John Doe" });
await row.locator('button[aria-label="Edit"]').click();
```

### When AI Agents Are Asked to Test

1. **Check prerequisites**: Verify auth is set up (`pnpm run test:e2e:check`)
2. **Navigate and interact**: Use Playwright MCP tools to control browser
3. **Take screenshots**: Capture visual evidence
4. **Report results**: Show errors, screenshots, or success
5. **Suggest improvements**: Recommend `data-testid` attributes if selectors are fragile

**Common requests**:

- "Take a screenshot of [page]"
- "Test if [feature] works"
- "Verify all navigation links work"
- "Check if form validation works correctly"

### Debugging Failed Tests

When tests fail:

1. Check screenshot in `test-results/` directory
2. Check video recording (also in `test-results/`)
3. Verify authentication (if redirected to `/auth/signin`, session expired)
4. Ensure dev server is running on localhost:3000
5. Use `await page.pause()` for interactive debugging

## Internationalization (i18n)

### Message Management

- **Admin UI**: `messages/en.json` and `messages/sv.json`
- **Public pages**: `messages/public-{locale}.json` (20+ languages)
- **Usage in client components**: `const t = useTranslations("namespace");`
- **Usage in server components**: `const t = await getTranslations("namespace");`

ALL user-facing strings must use message IDs - no hardcoded text. Default locale is Swedish (sv).

## Deployment Architecture

### Environment Variable Management

Adding new env vars requires updates in **5 places** (or they won't work in production):

1. `.env.example` - Documentation with clear descriptions
2. GitHub Secrets (if sensitive)
3. `.github/workflows/init_deploy.yml` - Export in env section
4. `.github/workflows/continuous_deployment.yml` - Export in env section
5. Both `deploy.sh` and `update.sh` - Add to .env file creation

**Never hardcode in `docker-compose.yml`** - use .env file pattern.

### Deployment Flow

- **Staging**: Auto-deploys on push to `main` via `.github/workflows/continuous_deployment.yml`
- **Production**: Manual approval required after staging deployment succeeds
- **First-time setup**: Manual trigger of `.github/workflows/init_deploy.yml`

### Background Services

Custom Next.js server (`server.js`) starts SMS scheduler automatically on production boot. Uses PostgreSQL advisory locks for queue processing safety across multiple instances.

## Key Conventions

### File Editing

- **Never create intermediate files** - edit originals directly
- **Never create additional markdown files** unless explicitly requested
- **Respect `.gitignore`** - never edit `.next/`, `node_modules/`, etc.

### React Component Patterns

- **Default to server components** - only add `"use client"` when using browser APIs (hooks, event handlers)
- **Use function components with hooks** - no class components
- **Navigation**: Import from `@/app/i18n/navigation` (not `next/navigation`) for locale-aware routing

### Database Patterns

- **Connection**: Import `db` from `@/app/db/drizzle` (has build-time mocks for tests)
- **IDs**: Use exported `nanoid(8)` function from `app/db/schema.ts`
- **Queries**: Use Drizzle ORM query builder, not raw SQL

### Styling

- Use Mantine components + Tailwind utility classes
- PostCSS config in `postcss.config.cjs` handles Mantine preset
- No standalone Tailwind config file

### Testing Conventions

- **Unit tests**: Use Vitest with React Testing Library
- **E2E tests**: Use Playwright, prefer semantic selectors
- **Add `data-testid`**: When semantic selectors aren't available
- **Test independence**: Each test should work standalone

## Business Logic & UX Patterns

### Parcel Status Display Logic

**Important:** Parcel status badges use **date-only** comparison, not time-based.

**Intentional behavior:**

- Same-day parcels ALWAYS show as "upcoming" (blue badge), even if pickup window has passed
- Only parcels from PREVIOUS days show as "not picked up" (red badge)

**Rationale:**

- Households may arrive late throughout the day
- Staff may be processing multiple arrivals
- Pickup windows are guidelines, not hard cutoffs
- We don't want to prematurely mark parcels as "not picked up" while staff are actively processing handouts

**Staff workflow:**

- Staff must MANUALLY mark parcels as picked up via the admin dialog
- System only auto-shows "not picked up" for parcels from previous days that were never marked

**Test coverage:** See `__tests__/app/households/parcel-status-display.test.ts` for documented test cases.

**Code location:** `app/[locale]/households/[id]/components/HouseholdDetailsPage.tsx` - `isDateInPast()` function

- **Clean up**: Remove test data when possible

## Special Routes

### Public Parcel Pages (`/p/[parcelId]`)

- **No locale prefix**: Bypass i18n routing entirely
- **No authentication**: Accessible to households for QR code scanning
- **Middleware exception**: Listed in `middleware.ts` public patterns
- **Separate layout**: `app/p/layout.tsx` with minimal metadata

### API Routes

- **Authentication**: Basic cookie check in middleware, full validation in handlers
- **Public exceptions**: `/api/health`, `/api/auth/*`, `/api/csp-report`
- **Protected**: All other API routes require valid session token

## Code Quality

- Annotate non-obvious logic in comments for AI learning
- TypeScript strict mode enforced
- Run `pnpm run validate` before committing
- All server actions must use protection wrappers
- All user-facing text must use i18n message IDs

## Documentation

- **Quick start**: `README.md` (for humans)
- **This file**: `AGENTS.md` (for AI agents)
- **User manual**: `docs/user-manual.md`
- **User flows**: `docs/user-flows.md`
