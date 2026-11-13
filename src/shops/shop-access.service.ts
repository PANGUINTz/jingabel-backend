import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { User, type UserRole } from '../users/user.entity.js';
import { ShopMember } from './entities/shop-member.entity.js';
import { Shop } from './entities/shop.entity.js';
import {
  PLATFORM_ADMIN_SHOP_PERMISSIONS,
  SHOP_ROLE_PERMISSIONS,
  type ShopPermission,
} from './permissions.js';

// What the requesting user may do in one shop. Attached to the request by
// ShopPermissionsGuard; read it with @CurrentShop().
export interface ShopAccess {
  shop: Shop;
  // null when a platform admin acts in a shop they don't belong to.
  member: ShopMember | null;
  role: UserRole;
  isPlatformAdmin: boolean;
  permissions: ReadonlySet<ShopPermission>;
}

export const SHOP_NOT_FOUND_MESSAGE = 'ไม่พบร้านค้า';

export function permissionsOf(role: UserRole): readonly ShopPermission[] {
  return role === 'admin'
    ? PLATFORM_ADMIN_SHOP_PERMISSIONS
    : SHOP_ROLE_PERMISSIONS[role];
}

@Injectable()
export class ShopAccessService {
  constructor(
    @InjectRepository(Shop) private readonly shops: Repository<Shop>,
    @InjectRepository(ShopMember)
    private readonly members: Repository<ShopMember>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  // Looked up on every request rather than trusted from the JWT, so a role
  // change or removal takes effect immediately.
  async resolve(userId: string, shopSlug: string): Promise<ShopAccess> {
    const [shop, user] = await Promise.all([
      this.shops.findOneBy({ slug: shopSlug }),
      this.users.findOne({
        where: { id: userId },
        select: { id: true, role: true },
      }),
    ]);
    if (!shop || !user) throw new NotFoundException(SHOP_NOT_FOUND_MESSAGE);

    const member = await this.members.findOne({
      where: { shopId: shop.id, userId },
      relations: { branch: true },
    });
    const isPlatformAdmin = user.role === 'admin';
    // Non-members get the same answer as for a shop that doesn't exist.
    if (!member && !isPlatformAdmin) {
      throw new NotFoundException(SHOP_NOT_FOUND_MESSAGE);
    }

    return {
      shop,
      member,
      role: user.role,
      isPlatformAdmin,
      permissions: new Set(permissionsOf(user.role)),
    };
  }
}
