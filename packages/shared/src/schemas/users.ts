import { z } from 'zod';
import { passwordSchema } from './auth';

export const userRoleSchema = z.enum([
  'super_admin',
  'warehouse_admin',
  'warehouse_staff',
  'dispatcher',
  'driver',
  'inventory_manager',
  'viewer',
]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: passwordSchema,
  roles: z.array(userRoleSchema).min(1, 'At least one role is required'),
  branchId: z.string().optional(),
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  roles: z.array(userRoleSchema).min(1).optional(),
  branchId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserDto = z.infer<typeof updateUserSchema>;

export const userResponseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  email: z.string(),
  name: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  branchId: z.string().nullable(),
  branchName: z.string().nullable(),
  isActive: z.boolean(),
  mfaEnabled: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserResponse = z.infer<typeof userResponseSchema>;
