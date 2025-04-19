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

Now, you choose between our two primary development modes:

1. `bun run dev`: Next.js is running locally and db in a container (faster dev experience)
2. `bun run dev:containers-only`: A similar setup as in the production environment where both Next.js and db is running in (separate) containers.

Note that in neither of these two modes will you have nginx running, as in production.

## Database Migration Workflow

The project uses Drizzle ORM with a migration-based approach:

1. **Making Schema Changes**:

    - Update the schema definition in `app/db/schema.ts`
    - Generate SQL migration files with `bun run db:generate`
    - Migration files will be created in the `migrations` directory

2. **Applying Migrations**:

    - Run `bun run db:migrate` to apply migration files to the database
    - In Docker environments, migrations run automatically on startup

3. **Custom SQL Migrations**:

    - If you want to ship custom DDL changes or seed data separately from your schema diffs, run:
      ```sh
      bunx drizzle-kit generate --custom --name=seed-users
      ```
    - This creates an empty migration file (e.g., `0006_seed-users.sql`) under your migrations folder
    - You can fill this file with custom INSERT, UPDATE, or DDL statements
    - Custom migrations are applied in sequence along with schema migrations

4. **Migration in Development**:

    - When using `bun run dev` or `bun run dev:containers-only`, migrations apply automatically before the web service starts

5. **Migration in Production**:
    - During deployment (`deploy.sh`) or updates (`update.sh`), migrations are automatically generated and applied
    - All migrations are tracked in version control for better history management

## Helpful Commands

Note that sudo is needed when executing the commands on the VPS.

- `sudo docker compose ps` – check status of Docker containers
- `sudo docker compose logs web` – view Next.js output logs
- `sudo systemctl restart nginx` - restart nginx
- `sudo docker compose exec web sh` - enter Next.js Docker container
- `sudo docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB` - enter Postgres db
- `bun run db:generate` - generate new migration files from schema changes
- `bun run db:migrate` - apply migrations to the database manually
