# Matkassen

Matkassen is an admin portal for coordinating food parcel distribution. It helps organizations manage households, schedule pickups, coordinate pickup locations, and send automated multilingual SMS reminders.

## Features

- Secure admin UI for managing households, schedules, and handout locations
- Automated SMS notifications with reminder logic and SMS-management page
- Locale-aware interface (Swedish default, English available) powered by `next-intl`
- GitHub OAuth sign-in with organization membership enforcement
- Public parcel lookup pages for households without authentication

## Tech Stack

- Next.js 15 (App Router, TypeScript strict mode)
- PostgreSQL with Drizzle ORM migrations
- Mantine UI + Tailwind CSS styling
- NextAuth v5 with GitHub OAuth and GitHub App membership checks
- Vitest unit tests and Playwright end-to-end tests

## White-Label Configuration

The project is designed to be branded for different organizations with minimal changes.

1. Fork the repository and set your deployment secrets.
2. Update the branded environment variables listed in `.env.example` (such as `BRAND_NAME`, `DOMAIN_NAME`, `SMS_SENDER`).
3. Configure your GitHub OAuth App using your deployed domain for the homepage and callback URLs.

Once these values are updated, the UI labels, SMS sender, and public pages reflect your organization automatically.

## Getting Started

### Prerequisites

- Node.js 20 and [pnpm](https://pnpm.io/)
- Docker (for PostgreSQL and full-stack preview)
- GitHub OAuth credentials for local authentication

### Setup

1. Install dependencies:
    ```bash
    pnpm install
    ```
2. Copy the environment template and fill in the required values:
    ```bash
    cp .env.example .env
    ```
3. Ensure Docker is running so the bundled PostgreSQL service can start when needed.

## Local Development

### Fast Development

```bash
pnpm run dev
```

- Runs Next.js locally with Dockerized PostgreSQL
- Ideal for day-to-day development on http://localhost:3000

### Full Stack Preview

```bash
pnpm run preview:production
```

- Runs Nginx, Next.js, and PostgreSQL in Docker
- Mirrors the production stack on http://localhost:8080 for integration testing

## Testing

### Unit Tests

```bash
pnpm test
pnpm run test:watch
pnpm run test:ui
```

### End-to-End Tests

Playwright tests run locally and require a stored GitHub session.

```bash
pnpm run test:e2e:auth  # One-time authentication helper
pnpm run test:e2e       # Headless run
pnpm run test:e2e:ui    # Interactive mode
```

If authentication expires, rerun the auth helper to refresh the session. Playwright stores the cookie in `.auth/user.json` (gitignored).

### Code Quality

```bash
pnpm run validate  # Lint, typecheck, formatting, security checks
pnpm run format    # Prettier auto-fix
```

## Deployment

Continuous deployment is configured for staging with manual promotion to production. GitHub Actions workflows in `.github/workflows/` handle the Docker-based VPS deployments, while `deploy.sh` and `update.sh` control on-server rollout. Update environment variables across these entry points when introducing new configuration.

## Documentation

- `docs/user-manual.md` – operator guide for the admin portal
- `docs/user-flows.md` – key workflows for volunteers and staff
- `AGENTS.md` – contribution guidance for AI assistants
