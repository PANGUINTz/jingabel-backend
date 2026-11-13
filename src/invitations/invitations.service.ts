import { createHash, randomBytes } from 'node:crypto';
import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, type EntityManager } from 'typeorm';
import { Env } from '../config/env.js';
import { ShopMember } from '../shops/entities/shop-member.entity.js';
import { User } from '../users/user.entity.js';
import { UserInvitation } from './user-invitation.entity.js';

export interface IssuedInvitation {
  // The raw token — only ever sent in the email, never stored.
  token: string;
  acceptUrl: string;
  expiresAt: Date;
}

export interface InvitationDetails {
  invitation: UserInvitation;
  user: User;
  member: ShopMember | null;
}

const INVALID_LINK = 'ลิงก์คำเชิญไม่ถูกต้อง';
const EXPIRED_LINK = 'ลิงก์คำเชิญหมดอายุแล้ว กรุณาขอให้ร้านส่งคำเชิญใหม่';
const USED_LINK =
  'ลิงก์คำเชิญนี้ถูกใช้ไปแล้ว เข้าสู่ระบบด้วยอีเมลและรหัสผ่านได้เลย';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class InvitationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Replaces any earlier unaccepted invitation of this user, so only the
  // newest link works.
  async issue(
    manager: EntityManager,
    input: Pick<UserInvitation, 'userId' | 'shopId' | 'invitedBy'>,
  ): Promise<IssuedInvitation> {
    const repo = manager.getRepository(UserInvitation);
    await repo.delete({ userId: input.userId, acceptedAt: IsNull() });

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(
      Date.now() + this.config.get('INVITATION_TTL', { infer: true }) * 1000,
    );
    await repo.insert({ ...input, tokenHash: hashToken(token), expiresAt });

    const acceptUrl = new URL(
      '/invite',
      this.config.get('APP_URL', { infer: true }),
    );
    acceptUrl.searchParams.set('token', token);
    return { token, acceptUrl: acceptUrl.toString(), expiresAt };
  }

  // A link that can still be accepted, or the reason it can't.
  async findUsable(
    token: string,
    manager: EntityManager = this.dataSource.manager,
    lock = false,
  ): Promise<InvitationDetails> {
    const qb = manager
      .getRepository(UserInvitation)
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.user', 'u')
      .innerJoinAndSelect('i.shop', 's')
      .where('i.tokenHash = :hash', { hash: hashToken(token) });
    if (lock) qb.setLock('pessimistic_write', undefined, ['i']);
    const invitation = await qb.getOne();

    if (!invitation) throw new NotFoundException(INVALID_LINK);
    if (invitation.acceptedAt) throw new GoneException(USED_LINK);
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new GoneException(EXPIRED_LINK);
    }
    const user = invitation.user!;
    // Suspended or otherwise changed since the invite was sent.
    if (user.status !== 'pending') throw new GoneException(INVALID_LINK);

    const member = await manager.getRepository(ShopMember).findOne({
      where: { shopId: invitation.shopId, userId: user.id },
      relations: { branch: true },
    });
    return { invitation, user, member };
  }

  // Sets the password and activates the account; the link can't be reused.
  async accept(token: string, passwordHash: string): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const { invitation, user } = await this.findUsable(token, manager, true);
      await manager
        .getRepository(User)
        .update(user.id, { passwordHash, status: 'active' });
      await manager
        .getRepository(UserInvitation)
        .update(invitation.id, { acceptedAt: new Date() });
      return { ...user, passwordHash, status: 'active' };
    });
  }
}
