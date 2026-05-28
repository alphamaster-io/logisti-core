# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

FROM base AS builder
COPY . .
RUN pnpm install --frozen-lockfile=false
# shared's package.json points at dist/, so it must be built before the web build
RUN pnpm --filter @logisti-core/shared build
RUN pnpm --filter @logisti-core/web build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public
# Cloud Run injects PORT; default to 3000 for local docker run.
ENV PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
