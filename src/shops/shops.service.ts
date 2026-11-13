import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { generateString } from '../common/utils/generate-string.js';
import type { UserRole } from '../users/user.entity.js';
import type { MyShopResponse, RoleSummary } from './dto/shop.dto.js';
import { ShopMember } from './entities/shop-member.entity.js';
import { SHOP_SLUG_LENGTH, Shop } from './entities/shop.entity.js';
import { SHOP_ROLE_LABELS_TH, isShopRole } from './permissions.js';
import { permissionsOf, type ShopAccess } from './shop-access.service.js';
import { ShopBranchesService } from './shop-branches.service.js';

// null for a platform admin, who has no shop role.
export function toRoleSummary(role: UserRole): RoleSummary | null {
  return isShopRole(role) ? { key: role, name: SHOP_ROLE_LABELS_TH[role] } : null;
}

@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(ShopMember)
    private readonly members: Repository<ShopMember>,
    private readonly branches: ShopBranchesService,
  ) {}

  // Runs inside the registration transaction, so the user (already created
  // with role 'shop_owner'), the shop, its first branch ('สาขาหลัก') and the
  // membership are created together or not at all.
  async createWithOwner(
    manager: EntityManager,
    ownerUserId: string,
    name: string,
  ): Promise<Shop> {
    const shop = await manager.getRepository(Shop).save(
      manager.getRepository(Shop).create({
        name,
        // 62^10 values: a collision is practically impossible, and the unique
        // constraint still guards it (the registration would just fail).
        slug: generateString(SHOP_SLUG_LENGTH),
      }),
    );
    const branch = await this.branches.createDefault(manager, shop.id);
    await manager
      .getRepository(ShopMember)
      .insert({ shopId: shop.id, userId: ownerUserId, branchId: branch.id });
    return shop;
  }

  async listMine(userId: string): Promise<MyShopResponse[]> {
    const memberships = await this.members.find({
      where: { userId },
      relations: { shop: true, user: true, branch: true },
      order: { createdAt: 'ASC' },
    });
    return memberships.map((m) => ({
      slug: m.shop!.slug,
      name: m.shop!.name,
      role: toRoleSummary(m.user!.role),
      branch: { slug: m.branch!.slug, name: m.branch!.name },
      permissions: [...permissionsOf(m.user!.role)],
    }));
  }

  describe(access: ShopAccess): MyShopResponse {
    return {
      slug: access.shop.slug,
      name: access.shop.name,
      role: toRoleSummary(access.role),
      branch: access.member?.branch
        ? { slug: access.member.branch.slug, name: access.member.branch.name }
        : null,
      permissions: [...access.permissions],
    };
  }
}
