FROM oven/bun:alpine AS base

# Stage 1: Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Stage 2: Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Stage 3: Create the production image
FROM base AS runner
WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Auth.js requirements
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# The below are needed for drizzle to work (db migrations inside the container)
COPY drizzle.config.ts ./
COPY --from=builder /app/migrations ./migrations
COPY --from=deps /app/node_modules ./node_modules

EXPOSE 3000
CMD ["bun", "run", "server.js"]
