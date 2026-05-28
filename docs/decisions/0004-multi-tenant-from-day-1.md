# ADR-0004: Multi-tenant from day 1

**Status:** Accepted
**Date:** 2026-05-28

## Context
Legacy ExSpeed was single-tenant by design. When opportunities emerged to license the platform to other operators, retrofitting tenancy would have meant rewriting every query. We will not repeat that mistake.

## Decision
Every business table has a `tenant_id` column. A `TenantScopeInterceptor` reads the tenant from the authenticated user's JWT and enforces scoping in queries. Phase 1 ships single-tenant data via seed, but the wire is in place.

## Rationale
- **Cheapest now, prohibitively expensive later.** Adding `tenant_id` to 25 tables retroactively is a multi-week migration. Today it's one column.
- **Future revenue path.** White-label / SaaS licensing depends on this.
- **Compliance.** Data residency obligations become tenant-scoped automatically.

## Alternatives considered
- **Schema-per-tenant (PG schemas):** Cleaner isolation but operationally complex (migrations × N schemas). Postponed until first paying multi-tenant customer arrives.
- **DB-per-tenant:** Even harder ops. Reject unless a large enterprise demands.
- **Single-tenant now, refactor later:** Repeating the legacy mistake. Rejected.

## Consequences
- All Prisma queries must filter by `tenantId`. The interceptor enforces this; bypassing it requires explicit justification.
- Background jobs must carry tenant context.
- Reports must always group by tenant first.
- Cross-tenant operations (e.g. global system admin views) require explicit, audited bypasses.
