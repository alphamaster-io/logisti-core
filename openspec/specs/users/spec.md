# users capability

## Purpose
Lifecycle of identity records inside a tenant — create, read, update, disable, delete (soft), plus role assignment. The only place in the system that mutates the `users` table directly.

## Requirements

### Requirement: Users are scoped to a tenant
The system SHALL enforce that every user has a `tenantId` and that `(tenantId, emailNormalized)` is unique.

#### Scenario: Same email in two tenants
- GIVEN tenant A and tenant B exist
- WHEN a user `alice@example.com` is created in A
- AND a user `alice@example.com` is created in B
- THEN both succeed

### Requirement: Email comparison is case-insensitive
The system SHALL normalise emails to lowercase + trimmed on write and SHALL match on the normalised form.

#### Scenario: Login with different casing
- GIVEN a user with email `Alice@Example.com`
- WHEN they POST `/api/v1/auth/login` with `alice@example.com`
- THEN authentication succeeds

### Requirement: Cursor-based pagination
The system SHALL paginate `GET /api/v1/users` with cursor + limit (default 50, max 200). The response SHALL contain `{ data, nextCursor, hasMore }`.

#### Scenario: Paginating through 100 users
- GIVEN 100 users in the tenant
- WHEN `GET /api/v1/users?limit=20`
- THEN the response has 20 entries, `nextCursor` set, `hasMore: true`
- AND the next page returns the next 20 etc.

### Requirement: Soft delete
The system SHALL set `deletedAt` (not remove the row) on `DELETE /api/v1/users/:id`. Soft-deleted users SHALL be excluded from all default queries.

#### Scenario: Deleted user disappears from list
- GIVEN a user U
- WHEN `DELETE /api/v1/users/<U.id>`
- THEN `GET /api/v1/users` does not include U
- AND `U.deletedAt` is set in the database

### Requirement: Disable vs delete are separate operations
The system SHALL distinguish `POST /api/v1/users/:id/disable` (`isActive = false`; user cannot log in but remains in lists) from `DELETE /api/v1/users/:id` (soft delete; user is hidden).

#### Scenario: Disabled user blocked at login
- GIVEN a disabled user
- WHEN they POST `/api/v1/auth/login` with the correct password
- THEN the response is 401 with detail `"account disabled"`

### Requirement: Role assignment endpoints
The system SHALL expose `POST /api/v1/users/:id/roles` and `DELETE /api/v1/users/:id/roles/:roleKey` for callers with `users.update` permission.

#### Scenario: Granting a role
- GIVEN a user U without the `driver` role
- WHEN a super_admin POSTs `/api/v1/users/<U.id>/roles` with `{ roleKey: "driver" }`
- THEN U's roles include `driver`
- AND U's next `/auth/refresh` returns an updated permission set

### Requirement: Master user protection
The system SHALL refuse to disable or delete a user with `isMaster: true` unless the caller is themselves a master user. (See `master-impersonation`.)

#### Scenario: Non-master tries to delete master
- GIVEN a super_admin who is not a master
- WHEN they `DELETE /api/v1/users/<masterId>`
- THEN the response is 403 with detail `"master users may only be modified by other masters"`

### Requirement: `/me` endpoints
The system SHALL expose `GET /api/v1/users/me` (returns the caller's profile + effective permissions) and `PATCH /api/v1/users/me` (lets the caller update their own name and password).

#### Scenario: Self-update password
- GIVEN an authenticated user
- WHEN they PATCH `/api/v1/users/me` with `{ password: "NewStr0ng!Pass-2026" }`
- THEN the response is 200
- AND their old refresh tokens are revoked
