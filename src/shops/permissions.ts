// Shop-scoped permission catalog. Mirrors frontend/src/lib/permissions.ts
// (minus the platform.* ones, which belong to the platform admin role, not to
// a shop) — keep the two in sync.
export const SHOP_PERMISSIONS = [
  'branches.view',
  'branches.manage',
  'branches.assign_manager',
  'users.view',
  'users.invite',
  'users.change_role',
  'users.remove',
  'users.suspend',
  'users.reset_password',
  'customers.view',
  'customers.manage',
  'orders.view',
  'orders.manage',
  'products.view',
  'products.manage',
  'reports.branch',
  'reports.shop',
] as const;

export type ShopPermission = (typeof SHOP_PERMISSIONS)[number];

export function isShopPermission(value: string): value is ShopPermission {
  return (SHOP_PERMISSIONS as readonly string[]).includes(value);
}

// The fixed roles a user can hold in a shop. A user's role lives in
// users.role (one role for every shop they belong to) and shops can't define
// their own; permissions come from SHOP_ROLE_PERMISSIONS below, so adding a
// permission here takes effect without a data migration.
export const SHOP_ROLES = ['shop_owner', 'branch_manager', 'employee'] as const;

export type ShopRole = (typeof SHOP_ROLES)[number];

export function isShopRole(value: string): value is ShopRole {
  return (SHOP_ROLES as readonly string[]).includes(value);
}

export const SHOP_ROLE_NAMES: Record<ShopRole, string> = {
  shop_owner: 'Shop Owner',
  branch_manager: 'Branch Manager',
  employee: 'Employee',
};

// Higher outranks lower. Nobody can change the role of, or hand out, a role at
// or above their own.
export const SHOP_ROLE_RANK: Record<ShopRole, number> = {
  shop_owner: 3,
  branch_manager: 2,
  employee: 1,
};

export const SHOP_ROLE_PERMISSIONS: Record<
  ShopRole,
  readonly ShopPermission[]
> = {
  shop_owner: SHOP_PERMISSIONS.filter((p) => p !== 'users.reset_password'),
  branch_manager: [
    'branches.view',
    'users.view',
    'users.invite',
    'users.remove',
    'users.suspend',
    'customers.view',
    'customers.manage',
    'orders.view',
    'orders.manage',
    'products.view',
    'products.manage',
    'reports.branch',
  ],
  employee: [
    'customers.view',
    'customers.manage',
    'orders.view',
    'orders.manage',
    'products.view',
    'reports.branch',
  ],
};

// What a platform admin may do inside any shop without being a member:
// manage people, but shop data (customers/orders/products) stays read-only.
export const PLATFORM_ADMIN_SHOP_PERMISSIONS: readonly ShopPermission[] = [
  'branches.view',
  'users.view',
  'users.invite',
  'users.change_role',
  'users.remove',
  'users.suspend',
  'users.reset_password',
  'customers.view',
  'orders.view',
  'products.view',
  'reports.branch',
  'reports.shop',
];
