# ADR-0001: Monorepo with pnpm workspaces

**Status:** Accepted
**Date:** 2026-05-28

## Context

We're building a TypeScript backend (NestJS) and TypeScript frontend (Next.js). Both consume shared schemas (Zod) and shared types. We need fast installs, deterministic builds, and the ability to evolve packages together.

## Decision

Use **pnpm workspaces** for the monorepo. Three workspace groups: `apps/*`, `packages/*`. No Turbo for now — pnpm filter is sufficient at current scale.

## Alternatives considered

- **Turborepo:** Adds build caching but extra moving parts. Revisit when build times warrant.
- **Nx:** Powerful but heavyweight; we don't need its plugin system yet.
- **Polyrepo:** Cross-cutting schema/type changes would require version dance. Rejected.

## Consequences

- Single `pnpm-lock.yaml` at root.
- `pnpm --filter @logisti-core/<name>` targets a workspace.
- When build times exceed ~2 min we'll layer Turbo on top without restructuring.
