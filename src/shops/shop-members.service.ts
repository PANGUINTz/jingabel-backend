import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, type EntityManager } from 'typeorm';
import { escapeLike } from '../common/utils/escape-like.js';
import { assertNotLastOwner, shopIdsOf } from './last-owner.js';
import { AuditService } from '../audit/audit.service.js';
import { InvitationsService } from '../invitations/invitations.service.js';
import { MailService } from '../mail/mail.service.js';
import { invitationMail } from '../mail/templates/invitation.template.js';
import { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import type {
  InviteMemberDto,
  ShopMemberResponse,
  ShopMembersPageResponse,
  ShopMembersQueryDto,
} from './dto/shop.dto.js';
import { ShopBranch } from './entities/shop-branch.entity.js';
import { ShopMember } from './entities/shop-member.entity.js';
import {
  SHOP_ROLE_LABELS_TH,
  SHOP_ROLE_RANK,
  isShopRole,
  type ShopRole,
} from './permissions.js';
import type { ShopAccess } from './shop-access.service.js';
import { toRoleSummary } from './shops.service.js';

const MEMBER_NOT_FOUND = 'ไม่พบผู้ใช้งานในร้านนี้';
const EMAIL_TAKEN = 'อีเมลนี้ถูกใช้งานแล้ว';
const MAIL_FAILED = 'ส่งอีเมลคำเชิญไม่สำเร็จ กรุณาลองอีกครั้ง';
const PG_UNIQUE_VIOLATION = '23505';

function toMemberResponse(member: ShopMember): ShopMemberResponse {
  const user = member.user!;
  const branch = member.branch!;
  return {
    user: {
      slug: user.slug,
      fullName: user.fullName,
      email: user.email,
      status: user.status,
    },
    role: toRoleSummary(user.role),
    branch: { slug: branch.slug, name: branch.name },
    joinedAt: member.createdAt,
  };
}

@Injectable()
export class ShopMembersService {
  private readonly logger = new Logger(ShopMembersService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly invitations: InvitationsService,
    private readonly mail: MailService,
  ) {}

  // Creates a 'pending' account in this shop and emails a link to set its
  // password. The email is sent inside the transaction: if it fails, nothing
  // is kept and the caller can simply try again.
  async invite(
    access: ShopAccess,
    actorUserId: string,
    dto: InviteMemberDto,
  ): Promise<ShopMemberResponse> {
    if (
      !access.isPlatformAdmin &&
      SHOP_ROLE_RANK[dto.role] >= actorRank(access)
    ) {
      throw new ForbiddenException(
        'เชิญได้เฉพาะบทบาทที่อยู่ในระดับต่ำกว่าตัวเอง',
      );
    }
    if (await this.users.findByEmail(dto.email)) {
      throw new ConflictException(EMAIL_TAKEN);
    }

    return this.dataSource
      .transaction(async (manager) => {
        const branch = await manager
          .getRepository(ShopBranch)
          .findOneBy({ shopId: access.shop.id, slug: dto.branchSlug });
        if (!branch) throw new NotFoundException('ไม่พบสาขานี้');
        // Branch Managers work within their own branch only.
        if (
          !access.isPlatformAdmin &&
          access.role === 'branch_manager' &&
          branch.id !== access.member?.branchId
        ) {
          throw new ForbiddenException('เชิญได้เฉพาะสาขาของตัวเอง');
        }

        const user = await this.users.create(
          {
            email: dto.email,
            fullName: dto.fullName,
            // Unusable until the invitee sets their own password.
            passwordHash: await argon2.hash(randomUUID()),
            role: dto.role,
            status: 'pending',
          },
          manager,
        );
        const repo = manager.getRepository(ShopMember);
        await repo.insert({
          shopId: access.shop.id,
          userId: user.id,
          branchId: branch.id,
        });
        const member = await repo.findOneOrFail({
          where: { shopId: access.shop.id, userId: user.id },
          relations: { user: true, branch: true },
        });

        await this.audit.record(
          {
            actorUserId,
            shopId: access.shop.id,
            action: 'shop_member.invite',
            targetId: user.id,
            details: { role: dto.role, branch: branch.slug },
          },
          manager,
        );
        await this.sendInvitation(manager, access, actorUserId, member);
        return toMemberResponse(member);
      })
      .catch((error: unknown) => {
        // Two concurrent invites of the same email can both pass the check.
        if (
          error instanceof QueryFailedError &&
          (error.driverError as { code?: string }).code === PG_UNIQUE_VIOLATION
        ) {
          throw new ConflictException(EMAIL_TAKEN);
        }
        throw error;
      });
  }

  // A new link for a member who hasn't accepted yet; earlier links stop working.
  async resendInvitation(
    access: ShopAccess,
    actorUserId: string,
    userSlug: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const member = await this.findMember(manager, access, userSlug);
      assertCanManage(access, actorUserId, member);
      if (member.user!.status !== 'pending') {
        throw new BadRequestException('ผู้ใช้นี้ยืนยันคำเชิญแล้ว');
      }
      await this.audit.record(
        {
          actorUserId,
          shopId: access.shop.id,
          action: 'shop_member.resend_invitation',
          targetId: member.userId,
        },
        manager,
      );
      await this.sendInvitation(manager, access, actorUserId, member);
    });
  }

  private async sendInvitation(
    manager: EntityManager,
    access: ShopAccess,
    actorUserId: string,
    member: ShopMember,
  ): Promise<void> {
    const user = member.user!;
    const inviter = await manager
      .getRepository(User)
      .findOneByOrFail({ id: actorUserId });
    const { acceptUrl, expiresAt } = await this.invitations.issue(manager, {
      userId: user.id,
      shopId: access.shop.id,
      invitedBy: actorUserId,
    });
    const role = user.role;
    try {
      await this.mail.send(
        user.email,
        invitationMail({
          inviteeName: user.fullName,
          inviterName: inviter.fullName,
          shopName: access.shop.name,
          branchName: member.branch!.name,
          roleLabel: isShopRole(role) ? SHOP_ROLE_LABELS_TH[role] : role,
          acceptUrl,
          expiresAt,
        }),
      );
    } catch (error) {
      this.logger.error(`Invitation email to ${user.email} failed`, error);
      throw new ServiceUnavailableException(MAIL_FAILED);
    }
  }

  async list(
    shopId: string,
    query: ShopMembersQueryDto,
  ): Promise<ShopMembersPageResponse> {
    const { page, limit, search, role, status, branch } = query;
    const qb = this.dataSource
      .getRepository(ShopMember)
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.user', 'u')
      .innerJoinAndSelect('m.branch', 'b')
      .where('m.shopId = :shopId', { shopId });
    if (search) {
      qb.andWhere('(u.fullName ILIKE :search OR u.email ILIKE :search)', {
        search: `%${escapeLike(search)}%`,
      });
    }
    if (role) qb.andWhere('u.role = :role', { role });
    if (status) qb.andWhere('u.status = :status', { status });
    if (branch) qb.andWhere('b.slug = :branch', { branch });

    const [members, total] = await qb
      .orderBy('m.createdAt', 'ASC')
      .addOrderBy('m.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      data: members.map(toMemberResponse),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
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
      const member = await this.findMember(manager, access, userSlug);
      const oldRole = assertCanManage(access, actorUserId, member);
      if (oldRole === newRole) return toMemberResponse(member);

      if (
        !access.isPlatformAdmin &&
        SHOP_ROLE_RANK[newRole] >= actorRank(access)
      ) {
        throw new ForbiddenException(
          'มอบบทบาทได้เฉพาะบทบาทที่อยู่ในระดับต่ำกว่าตัวเอง',
        );
      }
      if (oldRole === 'shop_owner') {
        // The role is per user, so every shop they are in must keep an owner.
        await assertNotLastOwner(
          repo,
          await shopIdsOf(repo, member.userId),
          member.userId,
        );
      }

      await manager
        .getRepository(User)
        .update(member.userId, { role: newRole });
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

  // Sets users.status, so a suspended user is suspended in every shop.
  async changeStatus(
    access: ShopAccess,
    actorUserId: string,
    userSlug: string,
    status: 'active' | 'suspended',
  ): Promise<ShopMemberResponse> {
    return this.dataSource.transaction(async (manager) => {
      const member = await this.findMember(manager, access, userSlug);
      assertCanManage(access, actorUserId, member);
      const oldStatus = member.user!.status;
      if (oldStatus === 'pending') {
        throw new BadRequestException(
          'บัญชียังไม่ได้ยืนยันคำเชิญ — ส่งคำเชิญใหม่หรือนำออกจากร้านแทน',
        );
      }
      if (oldStatus === status) return toMemberResponse(member);

      await manager.getRepository(User).update(member.userId, { status });
      await this.audit.record(
        {
          actorUserId,
          shopId: access.shop.id,
          action: 'shop_member.change_status',
          targetId: member.userId,
          details: { from: oldStatus, to: status },
        },
        manager,
      );
      return toMemberResponse({
        ...member,
        user: { ...member.user!, status },
      });
    });
  }

  // Removes the membership in this shop only; the user account stays.
  async remove(
    access: ShopAccess,
    actorUserId: string,
    userSlug: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ShopMember);
      const member = await this.findMember(manager, access, userSlug);
      const role = assertCanManage(access, actorUserId, member);
      if (role === 'shop_owner') {
        await assertNotLastOwner(repo, [access.shop.id], member.userId);
      }

      // Never activated: drop the account too, so the email can be invited
      // again. Its membership and invitations go with it (CASCADE).
      if (member.user!.status === 'pending') {
        await manager.getRepository(User).delete(member.userId);
      } else {
        await repo.delete(member.id);
      }
      await this.audit.record(
        {
          actorUserId,
          shopId: access.shop.id,
          action: 'shop_member.remove',
          targetId: member.userId,
          details: { role, branch: member.branch!.slug },
        },
        manager,
      );
    });
  }

  private async findMember(
    manager: EntityManager,
    access: ShopAccess,
    userSlug: string,
  ): Promise<ShopMember> {
    const member = await manager.getRepository(ShopMember).findOne({
      where: { shopId: access.shop.id, user: { slug: userSlug } },
      relations: { user: true, branch: true },
    });
    if (!member) throw new NotFoundException(MEMBER_NOT_FOUND);
    return member;
  }
}

function actorRank(access: ShopAccess): number {
  return isShopRole(access.role) ? SHOP_ROLE_RANK[access.role] : 0;
}

// Nobody acts on themselves, on a platform admin, or (unless they are a
// platform admin) on someone at or above their own rank. Returns the target's
// role.
function assertCanManage(
  access: ShopAccess,
  actorUserId: string,
  member: ShopMember,
): ShopRole {
  if (member.userId === actorUserId) {
    throw new BadRequestException('จัดการบัญชีของตัวเองจากหน้านี้ไม่ได้');
  }
  const role = member.user!.role;
  if (!isShopRole(role)) {
    throw new ForbiddenException('จัดการบัญชีผู้ดูแลระบบไม่ได้');
  }
  if (!access.isPlatformAdmin && SHOP_ROLE_RANK[role] >= actorRank(access)) {
    throw new ForbiddenException(
      'จัดการได้เฉพาะผู้ใช้ที่อยู่ในระดับต่ำกว่าตัวเอง',
    );
  }
  return role;
}
