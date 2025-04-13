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

## Developing locally

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

## Handling Postgres DB

Updating `schema.ts` followed by running `bun run db:push --force` inside the docker container will migrate the database directly without the need for migration `.sql` files (see https://orm.drizzle.team/docs/drizzle-kit-push).

To trigger the update from outside the container run:

```sh
sudo docker compose exec web bun run db:push --force
```

This is made automatically on deployment (initial and incremental).

However, you might want to use the above command when devloping locally.

## Helpful Commands

Note that sudo is needed when executing the commands on the VPS.

- `sudo docker compose ps` – check status of Docker containers
- `sudo docker compose logs web` – view Next.js output logs
- `sudo systemctl restart nginx` - restart nginx
- `sudo docker compose exec web sh` - enter Next.js Docker container
- `sudo docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB` - enter Postgres db
- `sudo docker compose exec web bun run db:push` - perform DB schema update, prompts user to accept data loss, if any
