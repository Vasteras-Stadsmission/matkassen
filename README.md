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

## Authentication Setup

The application requires **two** GitHub integrations for secure authentication:

1. **GitHub OAuth App** - Handles user login

    - Create at: https://github.com/settings/developers
    - Set `Homepage URL` to your domain (e.g., `https://yourdomain.com`)
    - Set `Authorization callback URL` to `https://yourdomain.com/api/auth/callback/github`
    - Copy `Client ID` → `AUTH_GITHUB_ID`
    - Generate secret → `AUTH_GITHUB_SECRET`

2. **GitHub App** - Verifies organization membership (supports private members)
    - Create at: https://github.com/organizations/YOUR_ORG/settings/apps
    - Permissions: Organization → Members (Read-only)
    - Install the app to your organization
    - Copy `App ID` → `AUTH_GITHUB_APP_ID`
    - Copy `Installation ID` from installation URL → `AUTH_GITHUB_APP_INSTALLATION_ID`
    - Generate private key → `AUTH_GITHUB_APP_PRIVATE_KEY` (keep newlines: `\n`)

Both are required. The OAuth App authenticates users, while the GitHub App checks if they belong to your organization.

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

Run unit tests with Vitest:

```bash
pnpm test
```

### E2E Tests (Playwright)

End-to-end tests verify critical user flows and catch regressions. They run **locally only** (not in CI) and work with any database state.

**First-time setup (takes 10 seconds):**

```bash
pnpm run test:e2e:auth
```

This prompts you to copy your session cookie from DevTools:

1. Open http://localhost:3000/sv in your browser
2. Log in with GitHub
3. Open DevTools (F12 or Cmd+Option+I)
4. Go to Application → Cookies → http://localhost:3000
5. Copy the value of `next-auth.session-token.v2`
6. Paste into terminal

**Run E2E tests:**

```bash
pnpm run test:e2e           # Headless mode
pnpm run test:e2e:ui        # Interactive UI
pnpm run test:e2e:headed    # Watch browser
pnpm run test:e2e:check     # Check auth status
```

**What E2E tests cover:**

- ✅ Page loads without crashes
- ✅ Authentication persists
- ✅ Navigation flows work
- ✅ API endpoints are reachable
- ✅ Public routes work without auth

**What E2E tests DON'T cover (intentionally):**

- ❌ Data creation workflows (no seed infrastructure yet)
- ❌ Complex forms (too brittle without fixtures)
- ❌ SMS sending (requires test mode mocking)

Auth is valid for ~30 days. If tests fail with "authentication expired", re-run `pnpm run test:e2e:auth`.

### Code Quality

```bash
pnpm run validate      # Run all checks (lint, typecheck, format, security)
pnpm run format        # Auto-fix formatting
```

### Logging

Server-side code uses [Pino](https://getpino.io/) for structured JSON logging. Client components use `console.*` (browser-only). Set `LOG_LEVEL` env var to control verbosity (debug, info, warn, error). See `docs/dev-guide.md` for details.

## Authentication

Matkassen uses GitHub OAuth for user authentication and a GitHub App for organization membership verification. This approach eliminates the need to handle user credentials, passwords, or email verification—GitHub handles all of that.

### Setup

1. **Create a GitHub OAuth App** for user sign-in
2. **Create a GitHub App** with organization member permissions
3. **Configure environment variables** (see `.env.example` for required variables)

For detailed GitHub setup instructions, see:

- [Creating an OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
- [Creating a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)

### How It Works

- Users sign in with their existing GitHub account (OAuth)
- The app verifies organization membership using GitHub App credentials
- Only `vasteras-stadsmission` organization members can access the application
- Non-members see a clear access denied message

## SMS Notifications

Matkassen includes automated SMS notifications to inform households about their food parcel pickups. The system uses HelloSMS as the SMS provider and supports both test and production modes.

### Features

- **Automated Notifications**: Initial SMS when parcels are scheduled, reminder SMS closer to pickup time
- **Multi-language Support**: SMS templates in Swedish, English, Arabic, and Somali
- **Queue Processing**: Background scheduler processes SMS queue every 30 seconds
- **Rate Limiting**: 5-minute cooldown between SMS to prevent spam
- **Test Mode**: Safe testing environment with HelloSMS test mode
- **Admin Interface**: SMS management panel for sending/resending individual messages

### How It Works

1. **Scheduling**: SMS are automatically queued when food parcels are created
2. **Processing**: Background scheduler sends queued SMS via HelloSMS API
3. **Delivery**: One-way SMS delivery - recipients cannot reply to notifications
4. **Tracking**: All SMS delivery status and history is logged in the database

### Background Processing

The SMS system uses a custom Next.js server (`server.js`) that automatically starts the SMS scheduler when the application boots. This approach ensures reliable background processing without external dependencies:

**Automatic Scheduler**:

- Starts immediately when the application launches
- Enqueues reminder SMS every 30 minutes
- Processes SMS queue every 30 seconds
- Includes health monitoring every 5 minutes

**Queue Protection**:

- Uses PostgreSQL advisory locks to prevent concurrent processing
- Safe for multiple server instances or manual triggers
- Automatic retry logic with exponential backoff (5s, 15s, 60s)

**Reliability Features**:

- Automatic startup with application
- Comprehensive error handling and logging
- Health checks integrated into `/api/health` endpoint
- Test mode for safe development

### SMS Content

SMS messages include:

- Household name and personalized greeting
- Pickup date and time window
- Pickup location name and address
- Link to public parcel page with QR code for verification

**Note**: SMS notifications are transactional (pickup reminders), not marketing messages. Recipients who no longer want notifications should be removed from the system entirely by an administrator.

### Configuration

Set these environment variables for SMS functionality:

- `HELLO_SMS_USERNAME` / `HELLO_SMS_PASSWORD` - HelloSMS API credentials
- `HELLO_SMS_TEST_MODE=true/false` - Enable test mode for development
- `HELLO_SMS_FROM=Matkassen` - Sender name displayed to recipients

### Operational Triggers

The SMS system is designed for automatic operation, but includes manual triggers for flexibility:

**Default Operation (Docker/VPS Deployment)**:

- Background scheduler runs automatically with the application
- No external cron jobs needed
- Recommended for production Docker deployments

### Production Deployment

**SMS System Reliability**:

- Custom Next.js server ensures automatic scheduler startup
- PostgreSQL advisory locks prevent concurrent processing overlap
- Health monitoring integrated into Docker health checks
- Comprehensive error handling with retry logic

**Monitoring**:

- SMS health status available via `/api/health` endpoint
- Docker health checks curl `/api/health` every 30 seconds
- Logs include detailed SMS processing information
- Slack notifications for health alerts in production

**Scaling Considerations**:

- Single scheduler instance per deployment (controlled by advisory locks)
- Safe to run multiple application instances
- Manual trigger endpoint allows external monitoring tools to force processing
- Queue processing scales automatically with database performance

## Server Action Security

All server actions must be wrapped with `protectedAction()` or `protectedHouseholdAction()` for automatic authentication enforcement.

All protected actions return `ActionResult<T>`, a discriminated union that ensures type-safe error handling:

```typescript
import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";

export const myAction = protectedAction(
    async (session, data: FormData): Promise<ActionResult<string>> => {
        // session is already verified - no manual auth checks needed

        try {
            // Your business logic here
            const result = await doSomething(data);

            // Return success with data
            return success(result);
        } catch (error) {
            // Return typed error
            return failure({
                code: "OPERATION_FAILED",
                message: "Failed to perform operation",
            });
        }
    },
);
```

**Calling server actions from components:**

```typescript
const result = await myAction(formData);

if (result.success) {
    // TypeScript knows result.data exists here
    console.log(result.data);
} else {
    // TypeScript knows result.error exists here
    console.error(result.error.message);
}
```

The build validation (`pnpm run validate`) will fail if server actions are missing protection wrappers.

## Database Migration Workflow

The project uses Drizzle ORM with a migration-based approach:

1. **Making Schema Changes**:

    - Update the schema definition in `app/db/schema.ts`
    - Generate SQL migration files with `pnpm run db:generate`
    - Migration files will be created in the `migrations` directory

2. **Applying Migrations**:

    - Run `pnpm run db:migrate` to apply migration files to the database
    - In Docker environments, migrations run automatically on startup

3. **Custom SQL Migrations**:

    - If you want to ship custom DDL changes or seed data separately from your schema diffs, run:
        ```sh
        pnpm exec drizzle-kit generate --custom --name=seed-users
        ```
    - This creates an empty migration file (e.g., `0006_seed-users.sql`) under your migrations folder
    - You can fill this file with custom INSERT, UPDATE, or DDL statements
    - Custom migrations are applied in sequence along with schema migrations

4. **Migration in Development**:

    - When using `pnpm run dev`, migrations apply automatically before the web service starts
    - When using `pnpm run preview:production`, migrations run automatically when the containers start

5. **Migration in Production**:
    - During deployment (`deploy.sh`) or updates (`update.sh`), migrations are automatically generated and applied
    - All migrations are tracked in version control for better history management

## Environment Variables Management

Adding new environment variables requires updates across multiple deployment files due to the application's multi-stage deployment architecture.

### Quick Guide

1. **Document in `.env.example`** with description and example value
2. **Add to GitHub Secrets** (if sensitive data)
3. **Update 4 deployment files** by finding similar variables and copying the pattern:
    - `.github/workflows/init_deploy.yml`
    - `.github/workflows/continuous_deployment.yml`
    - `deploy.sh`
    - `update.sh`

### Troubleshooting

**Variable missing in production?** Check that all 4 files above include your variable.

**Need different values per environment?** Use different GitHub Secret names or add environment-specific logic in the deployment scripts.

### Best Practices

- Start with `.env.example` documentation first
- Never hardcode secrets in `docker-compose.yml`
- Test locally before deploying

## Database Security

### Separate Passwords per Environment

Staging and production databases use separate passwords for security isolation:

- `POSTGRES_PASSWORD_STAGING` - Staging database only
- `POSTGRES_PASSWORD_PRODUCTION` - Production database only

**Benefits**: Compromised staging credentials don't affect production. Passwords can be rotated independently per environment.

**Important**: When generating passwords, use URL-safe characters only (no `+`, `/`, or `=`):

```bash
openssl rand -base64 32 | tr -d '+/=' | head -c 32
```

## Database Backups

The system includes automated nightly PostgreSQL backups to Elastx Object Store:

- **Schedule**: 2:00 AM Europe/Stockholm
- **Format**: PostgreSQL custom format (.dump) with built-in compression
- **Retention**: 14 days Swift automatic expiry
- **Validation**: Each backup includes integrity validation
- **Notifications**: Slack alerts on success/failure

### Setup (Production Only)

1. Create Application Credentials in Elastx Dashboard (Identity → Application Credentials)
2. Add to `.env`: `OS_APPLICATION_CREDENTIAL_ID`, `OS_APPLICATION_CREDENTIAL_SECRET`, `SWIFT_CONTAINER`
3. Deploy - backups start automatically on production

### Management

```bash
./scripts/backup-manage.sh start|stop|status|logs|test
./scripts/backup-restore.sh <filename>  # Restore from backup
```

## Production Logs

Matkassen uses structured JSON logging with Pino. For viewing and analyzing production logs on your VPS:

### Quick Setup

```bash
# On your VPS, run once to install log viewing shortcuts
bash scripts/setup-vps-aliases.sh
```

### Common Commands

```bash
logs-simple          # Easy to read format
logs-errors-simple   # Just errors, clean format
logs-tail            # Live tail
logs-search "text"   # Find text with context
logs-1h              # Last hour
```

See [docs/production-logs.md](./docs/production-logs.md) for complete documentation on log viewing, filtering, and analysis.

## Helpful Commands

Note that sudo is needed when executing the commands on the VPS.

- `sudo docker compose ps` – check status of Docker containers
- `sudo docker logs matkassen-web-1` – view Next.js output logs (raw)
- `sudo systemctl restart nginx` - restart nginx
- `sudo docker compose exec web sh` - enter Next.js Docker container
- `sudo docker compose exec db bash -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB"` - enter Postgres db (uses container's environment)
- `pnpm run db:generate` - generate new migration files from schema changes
- `pnpm run db:migrate` - apply migrations to the database manually

## Deployment

Continuous deployment is configured for staging with manual promotion to production. GitHub Actions workflows in `.github/workflows/` handle the Docker-based VPS deployments, while `deploy.sh` and `update.sh` control on-server rollout. Update environment variables across these entry points when introducing new configuration.

## Documentation

- `docs/user-manual.md` – operator guide for the admin portal
- `docs/user-flows.md` – key workflows for volunteers and staff
- `AGENTS.md` – contribution guidance for AI assistants
