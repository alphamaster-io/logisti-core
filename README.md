# LogistiCore

End-to-end **Warehouse & Cargo Management Platform** — built as a multi-tenant, offline-capable PWA.

> **Status:** Phase 1 — Foundation. See [`CLAUDE.md`](./CLAUDE.md) for architecture and conventions, [`openspec/`](./openspec/) for the spec-driven workflow, and [`docs/decisions/`](./docs/decisions/) for the ADR trail.

---

## Quick Start

Three commands to a working local stack:

```bash
cp .env.example .env
make up
make migrate && make seed
```

Then:

- Web UI: **http://localhost:3000**
- API: **http://localhost:4000/api/v1/health**
- API docs (Swagger): **http://localhost:4000/api/v1/docs**
- MinIO console: **http://localhost:9001**

Sign in with the **master** account:

```
alphabyte.master@logisti-core.local
AlphabyteMaster!2026
```

The master can impersonate any role, switch any branch, and assign roles to others. Other demo accounts are seeded for each role — see [`CLAUDE.md`](./CLAUDE.md) §7.

---

## Architecture (Phase 1)

```
                 ┌─────────────────────────────────────────────┐
                 │  Browser (PWA)                              │
                 │   Next.js 15 + React 19 + Tailwind          │
                 │   TanStack Query · Zustand · react-hook-form │
                 └────────────┬────────────────────────────────┘
                              │ httpOnly cookies (lc_access / lc_refresh)
                              ▼
                 ┌─────────────────────────────────────────────┐
                 │  Next.js API routes (server)                 │
                 │   /api/auth/*   proxy + cookie management    │
                 └────────────┬────────────────────────────────┘
                              │ Authorization: Bearer <JWT>
                              ▼
                 ┌─────────────────────────────────────────────┐
                 │  NestJS API (Node 22)                        │
                 │   AuthN · RBAC · Audit · Idempotency         │
                 │   Pino logs · OpenAPI · RFC 7807 errors      │
                 └────┬─────────────────────────────────┬──────┘
                      ▼                                  ▼
              ┌─────────────────┐                ┌──────────────┐
              │ PostgreSQL 16   │                │ Redis 7      │
              │ Prisma 5        │                │ lockout +    │
              │ soft delete +   │                │ idempotency  │
              │ multi-tenant    │                │ (BullMQ P4)  │
              └─────────────────┘                └──────────────┘
                                                          │
                                                          ▼
                                                 ┌──────────────┐
                                                 │ MinIO / S3   │
                                                 │ (file Phase 2)│
                                                 └──────────────┘
```

---

## Repo Layout

```
apps/
  api/      NestJS backend (Prisma, JWT, RBAC, audit)
  web/      Next.js frontend (PWA-ready)
packages/
  shared/        Zod schemas + RBAC constants (used by both)
  eslint-config/ Flat config presets
  tsconfig/      base / nest / next tsconfig presets
docs/decisions/  ADRs
.github/workflows/  CI + security pipelines
docker-compose.yml  postgres + redis + minio + api + web
Makefile            common dev commands
.env.example
CLAUDE.md            architecture & conventions reference
```

---

## Core Module Map

| Layer | Module                            | Purpose                                                                    |
| ----- | --------------------------------- | -------------------------------------------------------------------------- |
| API   | `auth`                            | Login, refresh, logout, password reset, **role-switch**, **branch-switch** |
| API   | `users`                           | CRUD, `/me`, role assignment                                               |
| API   | `rbac`                            | Roles + permissions read                                                   |
| API   | `warehouse`                       | Branches, warehouses, zones, racks, bins (read)                            |
| API   | `audit`                           | Audit logs + the interceptor that records them                             |
| API   | `health`                          | DB + Redis readiness checks                                                |
| Web   | `(auth)/login`                    | Login form                                                                 |
| Web   | `(authenticated)/dashboard`       | Placeholder KPIs                                                           |
| Web   | `(authenticated)/users`           | Real data table + create/edit/disable                                      |
| Web   | `(authenticated)/warehouses`      | Hierarchical drill-down (Phase 1 placeholder)                              |
| Web   | `(authenticated)/audit`           | Audit log viewer                                                           |
| Web   | `components/auth/role-switcher`   | Master-only role impersonation                                             |
| Web   | `components/auth/branch-switcher` | Branch context switch                                                      |

---

## Common Commands

```bash
make up              # Start postgres + redis + minio + api + web
make down            # Stop everything
make migrate         # Apply pending Prisma migrations
make seed            # Seed roles, permissions, demo users, demo data
make test            # All unit tests
make test-e2e        # API e2e tests
make lint            # Lint all workspaces
make typecheck       # tsc --noEmit across the monorepo
make build           # Build api + web
make fresh           # Nuke and rebuild from zero
```

---

## Test User Matrix

| Email                                 | Role              | What they see                                |
| ------------------------------------- | ----------------- | -------------------------------------------- |
| `alphabyte.master@logisti-core.local` | **MASTER**        | Everything + role-switcher + branch-switcher |
| `admin@logisti-core.local`            | super_admin       | Everything except role impersonation         |
| `wh.admin@logisti-core.local`         | warehouse_admin   | Warehouse ops, inventory, shipments, reports |
| `wh.staff@logisti-core.local`         | warehouse_staff   | Daily warehouse tasks                        |
| `dispatcher@logisti-core.local`       | dispatcher        | Schedules, shipments, driver assignment      |
| `driver@logisti-core.local`           | driver            | Read shipments, mark delivered               |
| `inventory@logisti-core.local`        | inventory_manager | Products, inventory, reports                 |
| `viewer@logisti-core.local`           | viewer            | Read-only                                    |

Master password: `AlphabyteMaster!2026`. Super-admin password: `ChangeMe!Now-2026`. Demo password: `DemoUser!Pass-2026`. **Rotate before deploying anywhere.**

---

## Roadmap

| Phase                | Scope                                                        | Status      |
| -------------------- | ------------------------------------------------------------ | ----------- |
| 1. Foundation        | Auth, RBAC, users, audit, warehouse-read, web shell          | **this PR** |
| 2. Inventory         | Products, SKUs, batches, receiving, putaway, stock movements | next        |
| 3. Cargo & Shipments | Shipments, dispatch, tracking, delivery proof                |             |
| 4. PWA & Real-time   | Offline IndexedDB, Socket.IO, push, BullMQ                   |             |
| 5. Analytics         | KPI dashboards, reports, exports                             |             |

---

## Contributing

1. Branch from `main` with a descriptive name.
2. `make fresh` to confirm your environment is clean.
3. Add tests for new behaviour. CI runs lint + typecheck + unit + e2e.
4. Update [`CLAUDE.md`](./CLAUDE.md) when you change architecture or conventions.
5. Open a PR against `main`. One reviewer minimum.

See `CLAUDE.md` §9 for the **Do Not** list — these are hard constraints carried over from the legacy audit.

---

## License

UNLICENSED — internal project. (Replace before any external distribution.)
