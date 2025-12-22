# syntax=docker/dockerfile:1.7
FROM node:22.19.0-alpine3.22 AS base

LABEL org.opencontainers.image.source=https://github.com/Vasteras-Stadsmission/matkassen

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

# Stage 1: Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# Enable build cache and install with better caching
RUN --mount=type=cache,target=/app/.pnpm-store \
    pnpm install --frozen-lockfile --store-dir=/app/.pnpm-store

# Stage 1b: Install only production dependencies
FROM base AS deps-prod
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Stage 2: Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Set Node.js memory limit to prevent OOM errors during Next.js build
ARG NODE_MAX_OLD_SPACE_SIZE=4096
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}"
RUN --mount=type=cache,target=/app/.next/cache \
    pnpm run build

# Stage 3: Create the production image
FROM base AS runner
WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Ensure pnpm is available in the final stage
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

# Create non-root user for security
# Running as non-root mitigates container escape vulnerabilities (CVE-2025-55183, CVE-2025-55184)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs && \
    mkdir -p /home/nextjs/.cache/node/corepack && \
    chown -R nextjs:nodejs /home/nextjs

# Auth.js requirements
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy standalone build with correct ownership
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/server-build ./server-build

# The below are needed for drizzle to work (db migrations inside the container)
COPY --chown=nextjs:nodejs drizzle.config.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/migrations ./migrations
COPY --from=deps-prod --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy database health check module (needed by server.js)
COPY --from=builder --chown=nextjs:nodejs /app/app/db/health-check.js ./app/db/health-check.js

# Copy entrypoint script that conditionally runs migrations on startup (when RUN_MIGRATIONS_ON_STARTUP=true)
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Switch to non-root user
USER nextjs

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
