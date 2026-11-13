import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../users/user.entity.js';

export const ROLES_KEY = 'roles';

// Roles from users.role. For anything inside a specific shop prefer
// @RequireShopPermissions() from src/shops — it also checks shop membership.
export const Role = {
  ADMIN: 'admin',
  SHOP_OWNER: 'shop_owner',
  BRANCH_MANAGER: 'branch_manager',
  EMPLOYEE: 'employee',
} as const satisfies Record<string, UserRole>;

export const Roles = (...roles: UserRole[]) =>
  SetMetadata(ROLES_KEY, roles);
