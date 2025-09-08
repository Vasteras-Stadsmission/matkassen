# matkassen

Matkassen is a web application for a food parcel system.
Matkassen is based on https://github.com/leerob/next-self-host: Next.js, Postgres, Nginx, docker and deploying strategy for a VPS.

## Repository rules

This repository has a protected `main` branch. To have something pushed to `main` you will have to create a pull request.
To keep the git commit history in `main` clean, we use the **squash and merge** pattern using PR title and body as commit title and body.

## Prerequisites

1. Purchase a domain name
2. Purchase a Linux Ubuntu server (e.g. [droplet](https://www.digitalocean.com/products/droplets))
3. Create an `A` DNS record pointing to your server IPv4 address

## Continuous integration and deployment

This project runs on both a staging and production environment.

This repo contains GitHub actions which will automatically deploy your app to the staging environment when you push to the `main` branch (see `.github/workflows/continuous_deployment.yml`). To deploy to the production environment, you need to manually allow the deployment (requires certain GitHub privileges).

Note, first-time deployment to a VPS is handled using GitHub action `./.github/workflows/init_deploy.yml`, which is triggered manually in GitHub.

## Local Development Modes

First you need to setup your environment:

1. Copy the `.env.example` file to create your own `.env` file:
    ```bash
    cp .env.example .env
    ```
2. Update the values in the .env file accordingly.

Now, you choose between our two development modes:

### Mode 1: Fast Development

```bash
pnpm run dev
```

- Next.js runs locally (fastest hot reload)
- PostgreSQL runs in Docker container
- Access: http://localhost:3000
- **Use this for**: Daily development, making changes, debugging

### Mode 2: Full Stack Testing

```bash
pnpm run preview:production
```

- Nginx + Next.js + PostgreSQL all run in Docker containers
- Mirrors production environment (excluding SSL)
- Access: http://localhost:8080
- **Use this for**: Testing nginx configuration, rate limiting, proxy behavior, or any container-specific issues

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
    - When using `pnpm run dev:nginx`, migrations run automatically when the containers start

5. **Migration in Production**:
    - During deployment (`deploy.sh`) or updates (`update.sh`), migrations are automatically generated and applied
    - All migrations are tracked in version control for better history management

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

## Helpful Commands

Note that sudo is needed when executing the commands on the VPS.

- `sudo docker compose ps` – check status of Docker containers
- `sudo docker compose logs web` – view Next.js output logs
- `sudo systemctl restart nginx` - restart nginx
- `sudo docker compose exec web sh` - enter Next.js Docker container
- `sudo docker compose exec db bash -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB"` - enter Postgres db (uses container's environment)
- `pnpm run db:generate` - generate new migration files from schema changes
- `pnpm run db:migrate` - apply migrations to the database manually
