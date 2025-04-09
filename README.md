# matkassen

Matkassen is a web application for a food parcel system.
Matkassen is based on https://github.com/leerob/next-self-host: Next.js, Postgres, Nginx, docker and deploying strategy for a VPS.

## Repository rules

This repository has a protected `main` branch. To have something pushed to `main` you will have to create a pull request.
To keep the git commit history in `main` clean, we use the **squash and merge** pattern using PR title and body as commit title and body.

# Next.js Self Hosting Example

This repo shows how to deploy a Next.js app and a PostgreSQL database on a Ubuntu Linux server using Docker and Nginx. It showcases using several features of Next.js like caching, ISR, environment variables, and more.

[**📹 Watch the tutorial (45m)**](https://www.youtube.com/watch?v=sIVL4JMqRfc)

[![Self Hosting Video Thumbnail](https://img.youtube.com/vi/sIVL4JMqRfc/0.jpg)](https://www.youtube.com/watch?v=sIVL4JMqRfc)

## Prerequisites

1. Purchase a domain name
2. Purchase a Linux Ubuntu server (e.g. [droplet](https://www.digitalocean.com/products/droplets))
3. Create an `A` DNS record pointing to your server IPv4 address

## Quickstart

1. **SSH into your server**:

    ```bash
    ssh -i ~/.ssh/your.pem ubuntu@185.24.134.140
    ```

2. **Download the deployment script**:

    ```bash
    curl -o ~/deploy.sh https://github.com/Vasteras-Stadsmission/matkassen/blob/main/deploy.sh
    ```

    You can then modify the email and domain name variables inside of the script to use your own.

3. **Run the deployment script**:

    ```bash
    chmod +x ~/deploy.sh
    ./deploy.sh
    ```

## Supported Features

This demo tries to showcase many different Next.js features.

- Image Optimization
- Streaming
- Talking to a Postgres database
- Caching
- Incremental Static Regeneration
- Reading environment variables
- Using Middleware
- Running code on server startup
- A cron that hits a Route Handler

View the demo at https://nextselfhost.dev to see further explanations.

## Deploy Script

I've included a Bash script which does the following:

1. Installs all the necessary packages for your server
1. Installs Docker, Docker Compose, and Nginx
1. Clones this repository
1. Generates an SSL certificate
1. Builds your Next.js application from the Dockerfile
1. Sets up Nginx and configures HTTPS and rate limting
1. Sets up a cron which clears the database every 10m
1. Creates a `.env` file with your Postgres database creds

Once the deployment completes, your Next.js app will be available at:

```
http://your-provided-domain.com
```

Both the Next.js app and PostgreSQL database will be up and running in Docker containers. To set up your database, you could install `npm` inside your Postgres container and use the Drizzle scripts, or you can use `psql`:

```bash
docker exec -it myapp-db-1 sh
apk add --no-cache postgresql-client
psql -U myuser -d mydatabase -c '
CREATE TABLE IF NOT EXISTS "todos" (
  "id" serial PRIMARY KEY NOT NULL,
  "content" varchar(255) NOT NULL,
  "completed" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now()
);'
```

For pushing subsequent updates, I also provided an `update.sh` script as an example.

## Developing Locally with hot reloads

When devloping locally you can use a similar setup as in the production environment. However, instead of using `./docker-compose.yml` which makes use of `./Dockerfile`, you will instead use the combo `./docker-compose.dev.yml` and `.Dockerfile.dev`.

Here are some useful commands

```sh
# Start containers
docker compose -f docker-compose.dev.yml up

# Rebuild and start (delegate builds to bake for better performance)
COMPOSE_BAKE=true docker compose -f docker-compose.dev.yml up --build

# Stop containers
docker compose -f docker-compose.dev.yml down

# View logs
docker compose -f docker-compose.dev.yml logs
```

## Handling Postgres DB

Updating `schema.ts` followed by running `bun run db:push` outside the docker container will migrate the database directly without the need for migration `.sql` files (see https://orm.drizzle.team/docs/drizzle-kit-push).

## Helpful Commands

- `docker-compose ps` – check status of Docker containers
- `docker-compose logs web` – view Next.js output logs
- `docker-compose logs cron` – view cron logs
- `docker-compose down` - shut down the Docker containers
- `docker-compose up -d` - start containers in the background
- `sudo systemctl restart nginx` - restart nginx
- `docker exec -it myapp-web-1 sh` - enter Next.js Docker container
- `docker exec -it myapp-db-1 psql -U myuser -d mydatabase` - enter Postgres db

## Other Resources

- [Kubernetes Example](https://github.com/ezeparziale/nextjs-k8s)
- [Redis Cache Adapter for Next.js](https://github.com/vercel/next.js/tree/canary/examples/cache-handler-redis)
- [ipx – Image optimization library](https://github.com/unjs/ipx)
- [OrbStack - Fast Docker desktop client](https://orbstack.dev/)
