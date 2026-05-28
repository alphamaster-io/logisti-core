# CLAUDE.md

Reference for AI agents and humans working in the **LogistiCore** repository. Read this first before touching anything.

---

## 1. Project Overview

**LogistiCore** is a multi-tenant **Warehouse & Cargo Management Platform** built as a Progressive Web App. It replaces a legacy PHP/jQuery system ("ExSpeed" — HK ↔ PH parcel logistics) that we audited prior to greenfield work. **None of the legacy code is ported**; every legacy mistake informs a design decision here (see §5).

**Current phase:** Phase 1 — Foundation (this scaffold).

| Phase | Scope | Status |
|---|---|---|
| 1. Foundation | Monorepo, auth, RBAC, users, audit, warehouse-read API, web shell | **in progress / this PR** |
| 2. Inventory | Products, SKUs, batches, receiving, stock movements, putaway | not started |
| 3. Cargo & Shipments | Shipments, dispatch, tracking, delivery | not started |
| 4. PWA & Real-time | Offline-first IndexedDB, Socket.IO, push notifications, queues | not started |
| 5. Analytics | Real KPI dashboards, reports, exports | not started |

**Target users:** branch counter staff, warehouse operators, dispatchers, drivers, inventory managers, auditors, super admins, and a **master user** (`alphabyte.master`) who can impersonate any role, switch any branch, and assign roles on behalf of others.

---

## 2. Tech Stack

| Layer | Tech | Notes |
|---|---|---|
| Monorepo | **pnpm workspaces** | Turbo can be added later if build times warrant it |
| Backend | **NestJS 10** + TypeScript 5 (strict) | Procedural-PHP→DI-modular migration |
| DB | **PostgreSQL 16** | Single DB, multi-tenant via `tenant_id` column |
| ORM | **Prisma 5** | Soft-delete middleware enforces `deletedAt` |
| Cache / locks | **Redis 7** (`ioredis`) | Login lockout, idempotency keys, future BullMQ |
| Auth | **JWT** (access 15m, refresh 7d) + **Argon2id** password hashing | Refresh tokens stored hashed in DB; revocable |
| Validation | **Zod** (shared) + **class-validator** (NestJS DTOs) | Schemas in `packages/shared` used by both sides |
| Logging | **Pino** (`nestjs-pino`) | Structured JSON in prod, pretty in dev; correlation IDs |
| Docs | **OpenAPI / Swagger UI** at `/api/v1/docs` | Bearer auth wired |
| Frontend | **Next.js 15** (App Router) + React 19 + TS strict | PWA-ready (manifest + service worker registration) |
| Styling | **Tailwind CSS 3** + **shadcn/ui** | Light/dark via `next-themes` |
| Data | **TanStack Query 5** | Server cache |
| Client state | **Zustand 4** | Lightweight UI state only |
| Forms | **react-hook-form 7** + **zod** | Schemas come from `packages/shared` |
| Infra | **Docker Compose** (Postgres + Redis + MinIO + api + web) | One-command local dev |
| CI | **GitHub Actions** | lint + typecheck + test + build + security scan |

---

## 3. Repository Layout

```
logisti-core/
├── apps/
│   ├── api/                      # NestJS backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma     # 14 models, multi-tenant by design
│   │   │   ├── migrations/
│   │   │   └── seed.ts            # tenants, roles, perms, demo users
│   │   ├── src/
│   │   │   ├── main.ts            # bootstrap, helmet, CORS, swagger
│   │   │   ├── app.module.ts      # wires everything
│   │   │   ├── config/             # env-driven AppConfigService (Zod-validated)
│   │   │   ├── prisma/             # PrismaService + soft-delete middleware
│   │   │   ├── redis/              # ioredis client
│   │   │   ├── health/             # /health (db + redis check)
│   │   │   ├── common/
│   │   │   │   ├── filters/         # ProblemDetailsFilter (RFC 7807)
│   │   │   │   ├── middleware/      # request-id, idempotency-key
│   │   │   │   ├── interceptors/    # TenantScopeInterceptor
│   │   │   │   └── decorators/      # @CurrentUser, @Public, @Permissions, @Roles
│   │   │   └── modules/
│   │   │       ├── auth/            # login, refresh, logout, reset, switch-role, switch-branch
│   │   │       ├── users/           # CRUD, /me, role assignment
│   │   │       ├── rbac/            # roles + permissions read API
│   │   │       ├── warehouse/       # branches, warehouses, zones, racks, bins (read)
│   │   │       └── audit/           # AuditInterceptor + /audit-logs query
│   │   └── test/                   # e2e tests
│   └── web/                       # Next.js frontend
│       ├── src/
│       │   ├── app/
│       │   │   ├── (auth)/login/
│       │   │   ├── (authenticated)/
│       │   │   │   ├── layout.tsx   # sidebar + topbar shell
│       │   │   │   ├── dashboard/
│       │   │   │   ├── users/
│       │   │   │   ├── warehouses/
│       │   │   │   └── audit/
│       │   │   ├── api/auth/        # cookie-setting proxy routes
│       │   │   ├── layout.tsx
│       │   │   └── globals.css
│       │   ├── components/
│       │   │   ├── ui/               # shadcn primitives
│       │   │   ├── auth/             # login form, role-switcher, branch-switcher
│       │   │   ├── data-table/
│       │   │   └── layout/           # sidebar, topbar, user-menu
│       │   ├── lib/
│       │   │   ├── api-client.ts
│       │   │   ├── auth.ts
│       │   │   └── permissions.ts
│       │   └── middleware.ts         # route protection
│       └── public/
│           ├── manifest.webmanifest
│           └── sw.js                 # placeholder; offline logic Phase 4
├── packages/
│   ├── shared/                   # Zod schemas, role/permission constants
│   ├── eslint-config/            # flat config (ESLint v9)
│   └── tsconfig/                 # base / nest / next tsconfig presets
├── docs/
│   └── decisions/                # ADRs
├── .github/workflows/             # ci.yml, security.yml
├── docker-compose.yml
├── Makefile                       # make up / down / migrate / seed / test
├── .env.example
└── README.md
```

---

## 4. Architecture & Conventions

### Multi-tenant from day 1
Every business table has `tenant_id`. `TenantScopeInterceptor` reads the tenant from the authenticated user and constrains queries. Phase 1 ships single-tenant in seed data, but the wire is there.

### Auth model
- Password hashing: **Argon2id** (`argon2` package). No bcrypt.
- Access token: 15 min JWT signed with `JWT_ACCESS_SECRET`.
- Refresh token: 7-day random opaque token; **hashed in DB** (`refresh_tokens` table); rotated on every refresh; revocable.
- Login lockout: tracked in Redis. 5 failed attempts → 15-min lockout (configurable via env).
- Password policy: min 12 chars, mixed case, digit, symbol (enforced by `passwordSchema` in `packages/shared`).
- MFA: schema fields present (`mfaSecret`, `mfaEnabled`). TOTP flow lands in a future phase.

### RBAC
- Tables: `roles`, `permissions`, `role_permissions`, `user_roles`.
- 7 seeded roles: `super_admin`, `warehouse_admin`, `warehouse_staff`, `dispatcher`, `driver`, `inventory_manager`, `viewer`.
- ~30 atomic permissions: `users.create`, `inventory.adjust`, `shipments.dispatch`, etc. (see `packages/shared/src/rbac/permissions.ts`).
- Effective permission set is the union of all role permissions for the user — **unless** the user is acting as a specific `activeRoleKey` (master impersonation), in which case it's restricted to that role only.
- **No hardcoded user whitelists anywhere.** Authorization is purely permission-key driven.

### Master user (`alphabyte.master`)
A special account with `isMaster: true`. Capabilities:
- **Has every role** attached, so its full-permission set is the union of all roles.
- **`POST /auth/switch-role`** — set `activeRoleKey` on the session. While set, effective permissions are restricted to that single role. Use to test how an operator sees the app.
- **`POST /auth/switch-branch`** — set `activeBranchId`. The `TenantScopeInterceptor` honours this when filtering branch-scoped data.
- **`POST /users/:id/roles`** / **`DELETE /users/:id/roles/:roleKey`** — assign or revoke roles. (Also available to `super_admin` via `users.update` permission.)
- All master actions still pass through the audit interceptor.
- Seed credentials in `.env.example`.

### Soft delete
All business tables have `deletedAt`. A Prisma middleware filters them out by default. Hard delete is super_admin-only and explicitly audited.

### Audit
`AuditInterceptor` records every mutating HTTP request (`POST`, `PATCH`, `PUT`, `DELETE`) to `audit_logs` with: `action`, `entityType`, `entityId`, `before`/`after` (jsonb), `ip`, `userAgent`, `requestId`. Use `@SkipAudit()` decorator only when truly necessary (and document why).

### Money / amounts
Stored as **bigint minor units** + currency code string. Never floats. Phase 1 doesn't transact money yet, but schema and config are ready.

### Idempotency
`Idempotency-Key` header middleware stores `key → response` in Redis (24h). Phase 1 wires the skeleton; Phase 2 intake endpoints will require it.

### Error format
All errors return **RFC 7807 problem+json** via `ProblemDetailsFilter`. Include `requestId` for correlation.

### Validation
- All DTOs use `class-validator` (server-side authoritative).
- The same Zod schemas in `packages/shared` are used by the web `react-hook-form` resolvers.
- **The server never trusts the client.** Even if the web form validates, the API re-validates.

### Pagination
Cursor-based by default (`?cursor=&limit=&q=&sort=`). Response shape: `{ data, nextCursor, hasMore }`.

---

## 5. Lessons from the Legacy Audit — Non-Negotiables

These rules exist because the legacy app paid the price for ignoring them:

1. **No hardcoded user lists.** Authorization is database-driven. Never `if (user.email === 'admin@...')`.
2. **No year-suffixed tables.** Legacy had `xe_list_bag_21q1`. We use `created_at` + partition later if needed.
3. **No hardcoded enums in code for business data.** Branches, regions, statuses, drivers, surcharges all live in DB tables. Adding a branch is a config change, not a code deploy.
4. **All state changes through audit log.** Don't write code that bypasses `AuditInterceptor`.
5. **Soft delete via `deletedAt`** with Prisma middleware. Never `is_deleted='Y'`.
6. **Multi-tenant from day 1.** Every business table has `tenant_id`. `TenantScopeInterceptor` enforces it.
7. **Server-side validation only.** Web Zod schemas are duplicated convenience; never authoritative.
8. **Idempotency-Key** middleware ready for intake endpoints. The legacy bug "operator double-clicked → two boxes" must not be possible.
9. **No plaintext secrets in repo.** All secrets via env vars. `.env` is in `.gitignore`. `.env.example` is the only committed env file.
10. **Password hashing = Argon2id**, not bcrypt, not SHA. Tunable cost via env.

---

## 6. Common Tasks

| Task | Where |
|---|---|
| Run locally | `make up` (postgres + redis + minio + api + web) |
| Apply migrations | `make migrate` |
| Seed demo data | `make seed` |
| Add a permission | `packages/shared/src/rbac/permissions.ts` → update `ROLE_PERMISSIONS` → re-seed |
| Add a role | `packages/shared/src/rbac/roles.ts` → update `ROLE_PERMISSIONS` → re-seed |
| Add a NestJS module | `apps/api/src/modules/<name>/` → import into `AppModule` |
| Add a protected endpoint | `@Permissions(PERMISSIONS.X_Y)` decorator on the handler |
| Add a new page | `apps/web/src/app/(authenticated)/<name>/page.tsx` + sidebar entry |
| Add a shared schema | `packages/shared/src/schemas/<name>.ts` + re-export from `index.ts` |
| Skip audit on an endpoint | `@SkipAudit('reason')` — document why |

---

## 7. Local Dev Quick Start

```bash
cp .env.example .env
pnpm install
make up           # postgres + redis + minio + api + web
make migrate
make seed
open http://localhost:3000/login
```

Default credentials (from `.env.example`):

| Account | Email | Password | Notes |
|---|---|---|---|
| **Master** | `alphabyte.master@logisti-core.local` | `AlphabyteMaster!2026` | All roles, all branches, can impersonate + assign |
| Super Admin | `admin@logisti-core.local` | `ChangeMe!Now-2026` | Full perms but cannot impersonate |
| Warehouse Admin | `wh.admin@logisti-core.local` | `DemoUser!Pass-2026` | |
| Warehouse Staff | `wh.staff@logisti-core.local` | `DemoUser!Pass-2026` | |
| Dispatcher | `dispatcher@logisti-core.local` | `DemoUser!Pass-2026` | |
| Driver | `driver@logisti-core.local` | `DemoUser!Pass-2026` | |
| Inventory Manager | `inventory@logisti-core.local` | `DemoUser!Pass-2026` | |
| Viewer | `viewer@logisti-core.local` | `DemoUser!Pass-2026` | |

**Rotate all of these before deploying anywhere.**

---

## 8. Current State / WIP

- Phase 1 scaffold being landed. After merge:
  - `make up && make migrate && make seed` is the canonical first-run flow.
  - Web UI at `/login` is the entry; logging in lands on `/dashboard` (placeholder).
  - `/users` is the only fully-implemented page (data table powered by `GET /users`).
  - `/warehouses`, `/audit`, role-switcher, branch-switcher have UI in place; Phase 2 expands them.
- **Tests are skeleton-level** (proof of testability, not coverage). Phase 2 raises the bar.
- **No production deployment infra yet.** Docker images build, CI is green; cloud target (Cloud Run / ECS / k8s) is a Phase 4 decision.

---

## 9. Do NOT (without explicit approval)

- Bypass the `AuditInterceptor` without `@SkipAudit('reason')` and a code comment.
- Add a role or permission directly in a migration without updating `packages/shared/src/rbac/`.
- Store any secret in source. Use `AppConfigService` env vars.
- Use floats for money. Use bigint minor units.
- Introduce a global mutable state in `apps/web` that bypasses TanStack Query.
- Add a database table without `tenant_id` (unless it's truly global like `roles`/`permissions`).
- Reach into `apps/api/src/generated/` — that's Prisma's output.
- Commit a `.env` file. Ever.
