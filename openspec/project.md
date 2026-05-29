# LogistiCore — Project Brief (for OpenSpec)

## What this project is

**LogistiCore** is a multi-tenant Warehouse & Cargo Management Platform delivered as a Progressive Web App. It replaces a legacy PHP/jQuery system (ExSpeed — HK ↔ PH parcel forwarding) and generalises that single-operator workflow into a platform that other 3PLs / freight forwarders can run on.

## Audience

| Persona                    | What they do in the system                                         |
| -------------------------- | ------------------------------------------------------------------ |
| Branch counter staff       | Receive customer drop-offs, weigh/measure, issue receipts          |
| Warehouse operators        | Putaway, picking, packing, cycle counts                            |
| Dispatchers                | Build shipments, assign drivers, schedule routes                   |
| Drivers                    | View assignments on mobile (PWA), capture proof of delivery        |
| Inventory managers         | Own the product catalog, approve adjustments                       |
| Auditors                   | Read-only view of every state change in the system                 |
| Super admins               | Tenant-wide configuration, user management                         |
| Master users               | Cross-cutting impersonation + branch switching (training, support) |
| Future: shipping customers | Self-service intake + tracking portal (Phase 4)                    |

## What the platform must guarantee

Carried over from the legacy audit; non-negotiable:

1. **Multi-tenant from day 1** — `tenant_id` on every business table; one customer's data never leaks to another's
2. **All state changes are audited** — every mutation hits the audit log automatically
3. **No hardcoded user lists in code** — authorization is database-driven via roles + permissions
4. **Soft delete** — `deletedAt` everywhere; hard delete is super-admin-only and audited
5. **Server-side validation only** — frontend Zod schemas are duplicates; the API never trusts them
6. **Idempotency by Idempotency-Key** — intake endpoints must not double-process a retry
7. **Money is bigint minor units + currency code** — never floats; multi-currency aware
8. **No year-suffixed tables** — `created_at` is the rolling axis; partition only if needed
9. **Argon2id for passwords** — not bcrypt, not SHA
10. **No plaintext secrets in repo** — `.env.example` is the only committed env file

## Technology baseline

- **Backend**: NestJS 10 + Prisma 5 + PostgreSQL 16
- **Frontend**: Next.js 15 + React 19 + Tailwind + shadcn/ui (PWA-ready)
- **Auth**: JWT access (15m) + refresh (7d, hashed in DB); Argon2id; Redis-backed login lockout
- **Logging**: Pino structured + correlation IDs
- **Error format**: RFC 7807 problem+json
- **Hosting**: Cloud Run + Cloud SQL + Secret Manager (asia-east1)

## Roadmap by phase

| Phase                   | Scope                                                             | Status                                            |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| 1 — Foundation          | Monorepo, auth, RBAC, users, audit, warehouse-read API, web shell | **shipped (live on Cloud Run)**                   |
| 2 — Inventory           | Products, SKUs, batches, receiving, putaway, stock movements      | proposed (see `changes/add-inventory-management`) |
| 3 — Cargo & Shipments   | Shipments, dispatch, tracking, delivery proof                     | not started                                       |
| 4 — PWA & Real-time     | Offline-first IndexedDB, Socket.IO, BullMQ, push, customer portal | not started                                       |
| 5 — Analytics & Billing | KPI dashboards, reports, multi-currency invoicing, surcharges     | not started                                       |

See [`README.md`](../README.md) and [`CLAUDE.md`](../CLAUDE.md) for the technical reference. See `openspec/AGENTS.md` for how to propose and land new capabilities.
