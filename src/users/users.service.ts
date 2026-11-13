import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  QueryFailedError,
  type EntityManager,
  Repository,
} from 'typeorm';
import { AuditService } from '../audit/audit.service.js';
import { escapeLike } from '../common/utils/escape-like.js';
import { generateString } from '../common/utils/generate-string.js';
import { ShopMember } from '../shops/entities/shop-member.entity.js';
import { assertNotLastOwner, shopIdsOf } from '../shops/last-owner.js';
import { UserSessionsService } from '../user_sessions/user_sessions.service.js';
import {
  USER_SLUG_LENGTH,
  User,
  toPublicUser,
  type PublicUser,
} from './user.entity.js';
import { PaginationDto, UpdateUserDto } from './dto/user.response.js';

const USER_NOT_FOUND = 'ไม่พบผู้ใช้นี้';

// 62^10 possible slugs, so a collision is practically impossible — but the
// unique constraint is the real guarantee, so retry a few times if it fires.
const SLUG_ATTEMPTS = 3;
const SLUG_UNIQUE_CONSTRAINT = 'UQ_users_slug';

export type CreateUserInput = Pick<
  User,
  'email' | 'fullName' | 'passwordHash' | 'role'
> &
  Partial<Pick<User, 'status'>>;
export type UpdateUserInput = Pick<User, 'email' | 'fullName'>;

export type ChangePasswordInput = Pick<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly sessions: UserSessionsService,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  findBySlug(slug: string): Promise<User | null> {
    return this.users.findOneBy({ slug });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email: normalizeEmail(email) });
  }

  // Rejects with a unique-violation QueryFailedError if the email is taken.
  // Inside a transaction (`manager` given) a failed INSERT aborts the whole
  // transaction, so the slug-collision retry only applies outside one.
  async create(input: CreateUserInput, manager?: EntityManager): Promise<User> {
    const users = manager?.getRepository(User) ?? this.users;
    const attempts = manager ? 1 : SLUG_ATTEMPTS;
    for (let attempt = 1; ; attempt++) {
      try {
        return await users.save(
          users.create({
            ...input,
            email: normalizeEmail(input.email),
            slug: generateString(USER_SLUG_LENGTH),
          }),
        );
      } catch (error) {
        if (attempt >= attempts || !isSlugCollision(error)) throw error;
      }
    }
  }
  async update(id: string, body: UpdateUserInput) {
    const user = await this.findById(id);
    if (!user) throw new UnauthorizedException();
    return this.users.update(id, body);
  }

  async changePassword(id: string, body: ChangePasswordInput) {
    const user = await this.findById(id);
    if (!user) throw new UnauthorizedException();
    return this.users.update(id, body);
  }

  // Platform admin edits a user (PATCH /users/:slug). users.role applies in
  // every shop the user belongs to, so demoting a shop_owner must leave each
  // of those shops another owner. Audited; suspending signs out every device.
  async adminUpdate(
    actorUserId: string,
    slug: string,
    dto: UpdateUserDto,
  ): Promise<PublicUser> {
    const updated = await this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const user = await users.findOne({
        where: { slug },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException(USER_NOT_FOUND);

      const changes: Partial<Pick<User, 'fullName' | 'role' | 'status'>> = {};
      if (dto.fullName !== undefined && dto.fullName !== user.fullName) {
        changes.fullName = dto.fullName;
      }
      if (dto.role !== undefined && dto.role !== user.role) {
        changes.role = dto.role;
      }
      if (dto.status !== undefined && dto.status !== user.status) {
        changes.status = dto.status;
      }
      if (Object.keys(changes).length === 0) return user;

      if ((changes.role || changes.status) && user.id === actorUserId) {
        throw new ForbiddenException('เปลี่ยนบทบาทหรือสถานะของตัวเองไม่ได้');
      }
      if (changes.status && user.status === 'pending') {
        throw new BadRequestException(
          'บัญชียังไม่ได้ยืนยันคำเชิญ — ให้ร้านส่งคำเชิญใหม่หรือลบบัญชีแทน',
        );
      }
      if (changes.role && user.role === 'shop_owner') {
        const members = manager.getRepository(ShopMember);
        await assertNotLastOwner(
          members,
          await shopIdsOf(members, user.id),
          user.id,
        );
      }

      await users.update(user.id, changes);
      await this.audit.record(
        {
          actorUserId,
          shopId: null,
          action: 'user.update',
          targetId: user.id,
          details: Object.fromEntries(
            Object.entries(changes).map(([key, to]) => [
              key,
              { from: user[key as keyof typeof changes], to },
            ]),
          ),
        },
        manager,
      );
      return { ...user, ...changes };
    });
    if (updated.status === 'suspended') await this.sessions.revokeAll(slug);
    return toPublicUser(updated);
  }

  // Platform admin deletes an account (DELETE /users/:slug). Memberships,
  // invitations and reset links go with it (CASCADE); a shop's last owner
  // can't be deleted.
  async adminDelete(actorUserId: string, slug: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const user = await users.findOne({
        where: { slug },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException(USER_NOT_FOUND);
      if (user.id === actorUserId) {
        throw new ForbiddenException('ลบบัญชีของตัวเองไม่ได้');
      }
      if (user.role === 'shop_owner') {
        const members = manager.getRepository(ShopMember);
        await assertNotLastOwner(
          members,
          await shopIdsOf(members, user.id),
          user.id,
        );
      }

      await this.audit.record(
        {
          actorUserId,
          shopId: null,
          action: 'user.delete',
          targetId: user.id,
          details: { email: user.email, role: user.role },
        },
        manager,
      );
      await users.delete(user.id);
    });
    // user_sessions has no FK to users, so revoke explicitly.
    await this.sessions.revokeAll(slug);
  }

  async usersList(opt: PaginationDto) {
    const { page, limit, search, status, role } = opt;

    const qb = this.users.createQueryBuilder('user');
    qb.select([
      'user.email',
      'user.fullName',
      'user.role',
      'user.slug',
      'user.status',
      'user.createdAt',
    ]);
    if (search?.trim()) {
      qb.andWhere(
        '(user.full_name ILIKE :search OR user.email ILIKE :search)',
        { search: `%${escapeLike(search.trim())}%` },
      );
    }
    if (status?.trim()) {
      qb.andWhere('(user.status = :status)', { status: status });
    }
    if (role?.trim()) {
      qb.andWhere('(user.role = :role)', { role: role });
    }

    qb.orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }
}

function isSlugCollision(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { constraint?: string }).constraint ===
      SLUG_UNIQUE_CONSTRAINT
  );
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
