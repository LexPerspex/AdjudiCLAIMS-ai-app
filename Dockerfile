# =============================================================================
# AdjudiCLAIMS Production Docker Image
# =============================================================================
# Multi-stage build: deps → build → production
# Supports: API server, document worker, LLM worker (via CMD override)
# =============================================================================

ARG NODE_VERSION=20

# ---- Stage 1: Install dependencies ----
FROM node:${NODE_VERSION}-slim AS deps

WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci --legacy-peer-deps --ignore-scripts && npx prisma generate

# ---- Stage 2: Build application ----
FROM node:${NODE_VERSION}-slim AS build

# Sentry source map upload (optional — only if SENTRY_AUTH_TOKEN is provided)
ARG SENTRY_RELEASE=""
ARG SENTRY_ORG=""
ARG SENTRY_PROJECT=""

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV SENTRY_RELEASE=${SENTRY_RELEASE}
RUN npm run build

# ---- Stage 3: Production image ----
FROM node:${NODE_VERSION}-slim AS production

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Core application files
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY --from=build /app/prisma ./prisma

# Temporal worker files (needed for worker processes)
COPY --from=build /app/server/temporal ./server/temporal
COPY --from=build /app/server/constants ./server/constants
COPY --from=build /app/server/lib ./server/lib
COPY --from=build /app/server/services ./server/services
COPY --from=build /app/server/data ./server/data
COPY --from=build /app/server/prompts ./server/prompts
COPY --from=build /app/server/middleware ./server/middleware
COPY --from=build /app/server/db.ts ./server/db.ts
COPY --from=build /app/server/index.ts ./server/index.ts
COPY --from=build /app/server/production.ts ./server/production.ts
COPY --from=build /app/server/routes ./server/routes

# Non-root user
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 --ingroup appgroup appuser
USER appuser

EXPOSE 4901

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:4901/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Default: run the API server. Override for workers:
#   docker run ... adjudiclaims npx tsx server/temporal/document/worker.ts
#   docker run ... adjudiclaims npx tsx server/temporal/llm/worker.ts
CMD ["npm", "run", "start"]
