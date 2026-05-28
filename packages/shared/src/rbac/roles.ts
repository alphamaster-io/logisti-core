export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  WAREHOUSE_ADMIN: 'warehouse_admin',
  WAREHOUSE_STAFF: 'warehouse_staff',
  DISPATCHER: 'dispatcher',
  DRIVER: 'driver',
  INVENTORY_MANAGER: 'inventory_manager',
  VIEWER: 'viewer',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: RoleKey[] = Object.values(ROLES);

export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  super_admin: 'Full system access including user management and configuration',
  warehouse_admin: 'Manages warehouse structure, staff, and operations',
  warehouse_staff: 'Operates daily warehouse tasks: receiving, picking, packing',
  dispatcher: 'Schedules dispatches and assigns drivers',
  driver: 'Mobile user; views and updates delivery assignments',
  inventory_manager: 'Owns product catalog and inventory adjustments',
  viewer: 'Read-only access for audit / oversight',
};
