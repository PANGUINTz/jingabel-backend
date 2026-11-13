import { ConflictException } from '@nestjs/common';
import { In, type Repository } from 'typeorm';
import { ShopMember } from './entities/shop-member.entity.js';

export const LAST_OWNER_MESSAGE = 'ร้านต้องมี Shop Owner อย่างน้อย 1 คน';

// Throws 409 if removing `userId` as an owner would leave any of `shopIds`
// without a shop_owner. Call inside a transaction (repo from its manager).
export async function assertNotLastOwner(
  repo: Repository<ShopMember>,
  shopIds: string[],
  userId: string,
): Promise<void> {
  if (shopIds.length === 0) return;
  // Row locks (FOR UPDATE can't be combined with COUNT) so two concurrent
  // demotions/removals can't both see the other as the remaining owner.
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
  if (ownerless) throw new ConflictException(LAST_OWNER_MESSAGE);
}

// Every shop the user is a member of — the shops a role change or account
// deletion affects, since users.role applies in all of them.
export async function shopIdsOf(
  repo: Repository<ShopMember>,
  userId: string,
): Promise<string[]> {
  const rows = await repo.find({ where: { userId }, select: { shopId: true } });
  return rows.map((row) => row.shopId);
}
