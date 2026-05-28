export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  /** When set (master only), restricts effective permissions to this single role. */
  activeRoleKey: string | null;
  /** When set, overrides the user's home branch for scoping. */
  activeBranchId: string | null;
  /** Home branch (the user record's `branchId`). */
  branchId: string | null;
  isMaster: boolean;
}

export interface JwtAccessPayload {
  sub: string;
  tenantId: string;
  type: 'access';
}
