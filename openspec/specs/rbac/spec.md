# rbac capability

## Purpose
Role-based access control driven entirely by the database — `roles`, `permissions`, `role_permissions`, `user_roles`. No code path checks user identity directly; every protected endpoint declares the permission(s) it requires and the guard resolves the caller's effective permission set.

## Requirements

### Requirement: 7 seeded roles
The system SHALL seed the following roles: `super_admin`, `warehouse_admin`, `warehouse_staff`, `dispatcher`, `driver`, `inventory_manager`, `viewer`. Each SHALL have a non-empty `description`.

#### Scenario: All roles present after seed
- GIVEN a freshly seeded database
- WHEN `GET /api/v1/rbac/roles`
- THEN the response contains exactly these 7 role keys

### Requirement: Atomic permission catalog
The system SHALL define ~30 atomic permission keys grouped by domain (`users.*`, `roles.*`, `tenants.*`, `branches.*`, `warehouses.*`, `inventory.*`, `products.*`, `receiving.*`, `picking.*`, `shipments.*`, `reports.*`, `audit.*`). Codes SHALL be lowercase `<domain>.<verb>`.

#### Scenario: New permission added without DB migration is rejected
- GIVEN a new permission key referenced by a `@Permissions()` decorator but missing from the seed
- WHEN the server boots
- THEN the boot SHALL fail with a clear error referring to the missing key

### Requirement: Effective permissions are the union of granted roles
The system SHALL compute a user's effective permission set as the union of permissions across all roles assigned to them — except when an `activeRoleKey` is set, in which case the effective set is restricted to that single role's permissions (see `master-impersonation`).

#### Scenario: A dispatcher has dispatcher's permissions
- GIVEN a user assigned only the `dispatcher` role
- WHEN they call `GET /api/v1/users/me`
- THEN the response's `permissions[]` equals `ROLE_PERMISSIONS[dispatcher]`

### Requirement: Protected endpoints declare required permissions
The system SHALL deny any request whose authenticated caller is missing all of the permissions declared by the endpoint's `@Permissions(...)` decorator.

#### Scenario: A driver tries to create a user
- GIVEN a user with only the `driver` role
- WHEN they POST `/api/v1/users`
- THEN the response is 403 with detail referencing the missing permission

### Requirement: There are no identity-based authorization checks
The system SHALL NOT contain any authorization logic that checks user identity (email, id, name) directly. Authorization is purely permission-key driven.

#### Scenario: Permission revocation immediately takes effect on next request
- GIVEN a user U with role R that grants `users.delete`
- WHEN R loses `users.delete` (manually or via `users.update` revocation)
- AND U next calls `DELETE /api/v1/users/<id>` with their existing access token
- THEN the response is 403 (the guard reads from the DB, not the JWT claims)
