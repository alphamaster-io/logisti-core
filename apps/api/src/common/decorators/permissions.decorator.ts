import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@logisti-core/shared';

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...perms: PermissionKey[]) => SetMetadata(PERMISSIONS_KEY, perms);
