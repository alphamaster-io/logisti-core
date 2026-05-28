# ---------- builder ----------
FROM node:22-alpine AS builder
RUN corepack enable

WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @logisti-core/api db:generate
RUN pnpm --filter @logisti-core/shared build
RUN pnpm --filter @logisti-core/api build

# ---------- runtime ----------
FROM node:22-alpine AS runtime
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/apps/api/package.json ./apps/api/
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/apps/api/prisma ./apps/api/prisma
COPY --from=builder /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /repo/node_modules ./node_modules

WORKDIR /app/apps/api
# Cloud Run injects PORT; locally docker uses 4000.
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
