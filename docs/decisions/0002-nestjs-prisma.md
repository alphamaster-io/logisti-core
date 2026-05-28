# ADR-0002: NestJS + Prisma for the backend

**Status:** Accepted
**Date:** 2026-05-28

## Context

We're replacing a procedural PHP / mysqli legacy app. We need DI, modular structure, OpenAPI, validation, guards, and a typesafe ORM. The team is TS-native.

## Decision

**NestJS 10** with **Prisma 5** on **PostgreSQL 16**.

## Rationale

- **NestJS:** Module system maps cleanly to bounded contexts (auth, users, warehouse, inventory, shipments). DI makes testing easy. Built-in support for guards, interceptors, pipes — needed for our RBAC + audit pattern.
- **Prisma:** Type-safe queries, migrations, single source of schema truth, generated client with full TS inference. Migration story is mature.
- **PostgreSQL:** JSONB for audit payloads, partition support for the future, mature operational tooling. We picked PG over MySQL because legacy's MySQL pain points (no native JSON ergonomics, schema migration tooling) won't repeat.

## Alternatives considered

- **Fastify + custom DI:** Lighter but we'd rebuild what Nest gives us.
- **Drizzle ORM:** Promising, lighter; Prisma's migration tooling won.
- **TypeORM:** Older API, decorator-driven entities, mixed reviews. Rejected.
- **MySQL 8:** Familiar to ops, but PG's feature set is a better fit.

## Consequences

- We're tied to NestJS lifecycle (`OnModuleInit`, etc.).
- Prisma's query layer abstracts away raw SQL; complex reports may need `$queryRaw`.
- Migration files go through code review.
