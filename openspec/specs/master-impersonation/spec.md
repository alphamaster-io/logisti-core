# master-impersonation capability

## Purpose
A controlled mechanism for super-power users to **see what an operator sees** without sharing credentials. Used for training, support reproductions, and access reviews. Distinct from `super_admin` (super admin always has its own full permissions; master can voluntarily restrict to a single role's permissions for the duration of a session).

## Requirements

### Requirement: isMaster is a separate flag
The system SHALL track master status as a boolean column `users.isMaster`. Master status SHALL be independent from the user's roles (a master is typically also assigned every role).

#### Scenario: Master flag is independent
- GIVEN a user with `isMaster: true` and only the `viewer` role
- WHEN they call `GET /api/v1/users/me`
- THEN `isMaster` is `true` and `permissions[]` is the viewer's permission set

### Requirement: Switch-role narrows effective permissions
The system SHALL accept `POST /api/v1/auth/switch-role` from master users only. It SHALL set `users.activeRoleKey`. While `activeRoleKey` is non-null, the user's effective permissions SHALL equal that single role's permissions — not the union of all assigned roles.

#### Scenario: Master impersonates a driver
- GIVEN master M with all roles assigned
- WHEN they POST `/api/v1/auth/switch-role` with `{ roleKey: "driver" }`
- THEN their next `/users/me` returns `permissions[]` equal to driver's permission set
- AND `users.activeRoleKey = "driver"`

### Requirement: Switch-branch sets active branch context
The system SHALL accept `POST /api/v1/auth/switch-branch` from master users to set `users.activeBranchId` to any branch within their tenant.

#### Scenario: Master switches branch
- GIVEN master M
- WHEN they POST `/api/v1/auth/switch-branch` with `{ branchId: B }`
- THEN `users.activeBranchId = B`
- AND subsequent branch-scoped reads default-filter to B

### Requirement: Non-masters are rejected from switch endpoints
The system SHALL return 403 when a non-master attempts `switch-role` or `switch-branch`.

#### Scenario: Super-admin can't impersonate
- GIVEN a super_admin with `isMaster: false`
- WHEN they POST `/api/v1/auth/switch-role` with any payload
- THEN the response is 403

### Requirement: All impersonation actions are audited
The system SHALL record `switch-role` and `switch-branch` calls in the audit log including the previous and new values.

#### Scenario: Impersonation produces an audit trail
- GIVEN master M with `activeRoleKey = null`
- WHEN they POST `/auth/switch-role` with `{ roleKey: "driver" }`
- THEN one audit row exists with `action = "post /api/v1/auth/switch-role"`, `before = { activeRoleKey: null }`, `after = { activeRoleKey: "driver" }`

### Requirement: Masters are protected from non-master changes
The system SHALL prevent users without `isMaster: true` from disabling, deleting, or changing the role assignments of a master user. See `users` capability for the protected operations.

#### Scenario: Super-admin attempts to demote master
- GIVEN super_admin A (not a master) and master M
- WHEN A DELETEs `/api/v1/users/<M.id>/roles/super_admin`
- THEN the response is 403

### Requirement: Logout clears impersonation
The system SHALL set `activeRoleKey = null` and `activeBranchId = null` on `POST /api/v1/auth/logout`.

#### Scenario: Cleared on logout
- GIVEN a master with `activeRoleKey = "driver"`
- WHEN they POST `/api/v1/auth/logout`
- AND they log back in
- THEN `activeRoleKey` is `null`
