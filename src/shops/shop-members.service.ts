import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, type Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { User } from '../users/user.entity.js';
import type { ShopMemberResponse } from './dto/shop.dto.js';
import { ShopMember } from './entities/shop-member.entity.js';
import { SHOP_ROLE_RANK, isShopRole, type ShopRole } from './permissions.js';
import type { ShopAccess } from './shop-access.service.js';
import { toRoleSummary } from './shops.service.js';

const MEMBER_NOT_FOUND = 'ไม่พบผู้ใช้งานในร้านนี้';

function toMemberResponse(member: ShopMember): ShopMemberResponse {
  const user = member.user!;
  return {
    user: {
      slug: user.slug,
      fullName: user.fullName,
      email: user.email,
      status: user.status,
    },
    role: toRoleSummary(user.role),
    joinedAt: member.createdAt,
  };
}

@Injectable()
export class ShopMembersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(shopId: string): Promise<ShopMemberResponse[]> {
    const members = await this.dataSource.getRepository(ShopMember).find({
      where: { shopId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
    return members.map(toMemberResponse);
  }

  // Sets users.role, so the new role applies in every shop the member
  // belongs to, not just this one.
  async changeRole(
    access: ShopAccess,
    actorUserId: string,
    userSlug: string,
    newRole: ShopRole,
  ): Promise<ShopMemberResponse> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ShopMember);
      const member = await repo.findOne({
        where: { shopId: access.shop.id, user: { slug: userSlug } },
        relations: { user: true },
      });
      if (!member) throw new NotFoundException(MEMBER_NOT_FOUND);
      const oldRole = member.user!.role;

      if (member.userId === actorUserId) {
        throw new BadRequestException('เปลี่ยนบทบาทของตัวเองไม่ได้');
      }
      if (!isShopRole(oldRole)) {
        throw new ForbiddenException('เปลี่ยนบทบาทของผู้ดูแลระบบไม่ได้');
      }
      if (oldRole === newRole) return toMemberResponse(member);

      if (!access.isPlatformAdmin) {
        const actorRank = isShopRole(access.role)
          ? SHOP_ROLE_RANK[access.role]
          : 0;
        if (SHOP_ROLE_RANK[oldRole] >= actorRank) {
          throw new ForbiddenException(
            'เปลี่ยนบทบาทได้เฉพาะผู้ใช้ที่อยู่ในระดับต่ำกว่าตัวเอง',
          );
        }
        if (SHOP_ROLE_RANK[newRole] >= actorRank) {
          throw new ForbiddenException(
            'มอบบทบาทได้เฉพาะบทบาทที่อยู่ในระดับต่ำกว่าตัวเอง',
          );
        }
      }

      if (oldRole === 'shop_owner') {
        await this.assertNotLastOwner(repo, member.userId);
      }

      await manager.getRepository(User).update(member.userId, { role: newRole });
      await this.audit.record(
        {
          actorUserId,
          shopId: access.shop.id,
          action: 'shop_member.change_role',
          targetId: member.userId,
          details: { from: oldRole, to: newRole },
        },
        manager,
      );
      return toMemberResponse({
        ...member,
        user: { ...member.user!, role: newRole },
      });
    });
  }

  // The role is per user, so demoting an owner affects every shop they are in:
  // each of those shops must keep another owner.
  private async assertNotLastOwner(
    repo: Repository<ShopMember>,
    userId: string,
  ): Promise<void> {
    const shopIds = (
      await repo.find({ where: { userId }, select: { shopId: true } })
    ).map((m) => m.shopId);
    if (shopIds.length === 0) return;

    // Row locks (FOR UPDATE can't be combined with COUNT) so two concurrent
    // demotions can't both see the other as the remaining owner.
    const members = await repo
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.user', 'u')
      .where({ shopId: In(shopIds) })
      .setLock('pessimistic_write', undefined, ['m'])
      .getMany();
    const ownerless = shopIds.some(
      (shopId) =>
        !members.some(
          (m) =>
            m.shopId === shopId &&
            m.userId !== userId &&
            m.user!.role === 'shop_owner',
        ),
    );
    if (ownerless) {
      throw new ConflictException('ร้านต้องมี Shop Owner อย่างน้อย 1 คน');
    }
  }
}
