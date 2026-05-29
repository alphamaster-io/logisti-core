# warehouse-structure capability

## Purpose

The physical hierarchy goods live in: a tenant has Branches, each Branch has Warehouses, each Warehouse has Zones, each Zone has Racks, each Rack has Bins. Phase 1 ships this as a read-only API; full CRUD lands in Phase 2 alongside inventory.

## Requirements

### Requirement: 5-level hierarchy

The system SHALL model the warehouse structure as `Tenant → Branch → Warehouse → Zone → Rack → Bin`. Every level except Tenant SHALL have `tenantId`, a tenant-unique `code`, and `deletedAt`.

#### Scenario: Hierarchy is queryable end to end

- GIVEN a seeded tenant with HK-MAIN branch
- WHEN `GET /api/v1/branches` then `/warehouses?branchId=<id>` then `/warehouses/<id>/zones` then `/zones/<id>/racks` then `/racks/<id>/bins`
- THEN each call returns the children for that parent

### Requirement: Read endpoints require `warehouses.read` or `branches.read`

The system SHALL require the caller to hold `warehouses.read` for warehouse / zone / rack / bin reads, and `branches.read` for branch reads.

#### Scenario: Viewer can read branches but not warehouses if scoped down

- GIVEN a `viewer` user with `branches.read` but no `warehouses.read`
- WHEN they call `GET /api/v1/branches`
- THEN the response is 200
- AND `GET /api/v1/warehouses` returns 403

### Requirement: Codes are stable identifiers

The system SHALL allow callers to fetch by `code` within scope (`HK-MAIN`, `HK-MAIN-WH1`, etc.) in addition to UUIDs.

#### Scenario: Lookup by code

- GIVEN a branch with `code = "HK-MAIN"`
- WHEN `GET /api/v1/branches?code=HK-MAIN`
- THEN the response is the branch row

### Requirement: Hierarchy reads respect soft delete

The system SHALL exclude rows where `deletedAt IS NOT NULL` from default read responses.

#### Scenario: Soft-deleted zone is hidden

- GIVEN a zone marked `deletedAt`
- WHEN `GET /api/v1/warehouses/<id>/zones`
- THEN that zone is not in the response

### Requirement: Branch context is honoured for branch-scoped data

The system SHALL honour a master user's `activeBranchId` when filtering branch-scoped reads (e.g. lists default to that branch). See `master-impersonation` and `tenancy`.

#### Scenario: Branch filter from session

- GIVEN a master with `activeBranchId = HK-MAIN-id`
- WHEN they `GET /api/v1/warehouses`
- THEN only warehouses belonging to HK-MAIN are returned (unless an explicit `branchId` query param overrides)
