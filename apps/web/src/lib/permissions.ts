import type { AuthUser } from '@/store/auth-store';

export function hasPermission(
  user: Pick<AuthUser, 'permissions'> | null | undefined,
  perm: string,
): boolean {
  if (!user) return false;
  return user.permissions.includes(perm);
}

export function hasAnyPermission(
  user: Pick<AuthUser, 'permissions'> | null | undefined,
  perms: readonly string[],
): boolean {
  if (!user) return false;
  return perms.some((p) => user.permissions.includes(p));
}

export function hasAllPermissions(
  user: Pick<AuthUser, 'permissions'> | null | undefined,
  perms: readonly string[],
): boolean {
  if (!user) return false;
  return perms.every((p) => user.permissions.includes(p));
}
