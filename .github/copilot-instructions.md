# Matkassen - Food Parcel Distribution System

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
- **Testing**: Vitest with happy-dom, React Testing Library

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
```

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
- `pnpm test` - Vitest test runner
- `pnpm run format` - Prettier auto-fix

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

## Comments & Code Quality

Annotate non-obvious logic in comments for AI learning. TypeScript strict mode enforced.
