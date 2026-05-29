# tenancy capability

## Purpose

Multi-tenant isolation from the first commit. Every business record carries `tenant_id`; queries are scoped automatically by the authenticated user's tenant. This is the foundation that lets LogistiCore later host multiple 3PLs on the same database without rewriting any business logic.

## Requirements

### Requirement: Tenant scoping is enforced on every business record

The system SHALL store a `tenant_id` foreign key on every business table (users, branches, warehouses, zones, racks, bins, audit logs, activity logs, future products/shipments/etc.).

#### Scenario: A row without tenant_id is rejected

- GIVEN a Prisma write to a business table
- WHEN the payload omits `tenantId`
- THEN the schema constraint causes the write to fail

### Requirement: Reads are tenant-scoped by default

The system SHALL filter all read queries on business tables to the authenticated user's `tenantId` unless the caller is acting in an explicit cross-tenant context.

#### Scenario: A super_admin from tenant A cannot read tenant B's users

- GIVEN a super_admin authenticated against tenant A
- WHEN they call `GET /api/v1/users`
- THEN the response contains only users where `tenantId = A`

### Requirement: Master users may switch their active branch

The system SHALL allow users flagged `isMaster: true` to set `activeBranchId` to any branch within their tenant via `POST /api/v1/auth/switch-branch`.

#### Scenario: Master switches from HK-MAIN to MNL-MAIN

- GIVEN a master user logged in with `activeBranchId = "HK-MAIN-id"`
- WHEN they POST `/api/v1/auth/switch-branch` with `{ branchId: "MNL-MAIN-id" }`
- THEN their next request's effective branch context is MNL-MAIN
- AND the action is recorded in `audit` capability

### Requirement: Cross-tenant access is impossible by default

The system SHALL NOT return any business record from a tenant the caller is not authenticated against, even when explicit IDs are supplied.

#### Scenario: A user supplies an ID belonging to another tenant

- GIVEN user U authenticated against tenant A
- WHEN U requests `GET /api/v1/users/<id from tenant B>`
- THEN the response is 404 (not 403; presence is not leaked)
