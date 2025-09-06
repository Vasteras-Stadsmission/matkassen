FROM node:22.19.0-alpine3.22 AS base

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@latest --activate

# Stage 1: Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# Enable build cache and install with better caching
RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile

# Stage 2: Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Optimize build with environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN pnpm run build

# Stage 3: Create the production image
FROM base AS runner
WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Ensure pnpm is available in the final stage
RUN corepack enable && corepack prepare pnpm@latest --activate

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
CMD ["node", "server.js"]
