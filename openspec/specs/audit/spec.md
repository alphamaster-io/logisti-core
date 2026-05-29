# audit capability

## Purpose

Tamper-evident record of every state change in the system. Carried over from the legacy audit's #1 finding: the previous platform had untraced state changes that fed shrinkage and disputes. The interceptor-driven model means the audit log can't be forgotten.

## Requirements

### Requirement: Every mutating HTTP request is audited

The system SHALL record every `POST`, `PATCH`, `PUT`, `DELETE` request to `audit_logs` with: `tenantId`, `userId`, `action`, `entityType`, `entityId`, `before`, `after`, `ip`, `userAgent`, `requestId`, `createdAt`.

#### Scenario: Creating a user produces an audit row

- GIVEN a super_admin
- WHEN they POST `/api/v1/users` with `{ email: "x@y", ... }`
- THEN one new row exists in `audit_logs` with `entityType = "user"`, `entityId = <new id>`, `action = "post /api/v1/users"`, and `after` containing the created user

### Requirement: Audit writes never fail the request

The system SHALL fire-and-forget audit writes. An audit-write failure SHALL be logged at WARN but SHALL NOT change the user-visible response.

#### Scenario: DB write fails after a successful POST

- GIVEN the audit insert path throws
- WHEN the user POSTs `/api/v1/users` with a valid payload
- THEN the response is still 201
- AND the failure is logged with `audit write failed: ...`

### Requirement: SkipAudit must be explicit + documented

The system SHALL provide a `@SkipAudit('reason')` decorator. Endpoints SHALL only use it with a documented reason; CI SHALL fail PRs that introduce `@SkipAudit()` with an empty or absent reason.

#### Scenario: Empty-reason SkipAudit is rejected

- GIVEN a PR diff containing `@SkipAudit('')`
- WHEN CI runs
- THEN CI fails with a diagnostic pointing at the line

### Requirement: Audit logs are read-only via API

The system SHALL expose `GET /api/v1/audit-logs` (gated by `audit.read`) with cursor pagination and filtering by `tenantId`, `userId`, `entityType`, `entityId`, time range. The system SHALL NOT expose any endpoint that updates or deletes an audit row.

#### Scenario: Querying audit logs by entity

- GIVEN audit rows for user U
- WHEN an auditor calls `GET /api/v1/audit-logs?entityType=user&entityId=<U.id>`
- THEN the response lists the rows in reverse chronological order

### Requirement: requestId correlates audit with logs

The system SHALL include `requestId` on every audit row, set from the `X-Request-ID` middleware. The same value SHALL appear in the Pino structured log entry for the same request.

#### Scenario: Find the log for an audit row

- GIVEN an audit row with `requestId = R`
- WHEN an operator searches Pino logs for `requestId:R`
- THEN they find the request entry for the same operation
