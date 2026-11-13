import { Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, type EntityManager, Repository } from 'typeorm';
import { generateString } from '../common/utils/generate-string.js';
import { USER_SLUG_LENGTH, User, toPublicUser } from './user.entity.js';
import { PaginationDto, UpdateUserDto } from './dto/user.response.js';

// 62^10 possible slugs, so a collision is practically impossible — but the
// unique constraint is the real guarantee, so retry a few times if it fires.
const SLUG_ATTEMPTS = 3;
const SLUG_UNIQUE_CONSTRAINT = 'UQ_users_slug';

export type CreateUserInput = Pick<
  User,
  'email' | 'fullName' | 'passwordHash' | 'role' | 'isEmployee'
>;
export type UpdateUserInput = Pick<
  User,
  'email' | 'fullName'
>;

export type ChangePasswordInput = Pick<
  User,
  'passwordHash'
>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
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
    try {
      return this.users.update(id, body)
    } catch (error) {
      throw new InternalServerErrorException(error)
    }
  }

  async deleteUser(slug: string) {
    const user = await this.findBySlug(slug);
    if (!user) throw new NotFoundException('user not found');
    try {
      return this.users.delete(user.id)
    } catch (error) {
      throw new InternalServerErrorException(error)
    }
  }

  async updateUserBySlug(slug: string, body: UpdateUserDto) {
    const user = await this.findBySlug(slug);
    // Not 401: the frontend treats 401 as an expired session and logs the admin out.
    if (!user) throw new NotFoundException('user not found');
    try {
      return this.users.update({ slug: slug }, body)
    } catch (error) {
      throw new InternalServerErrorException(error)
    }
  }

  async changePassword(id: string, body: ChangePasswordInput) {
    const user = await this.findById(id);
    if (!user) throw new UnauthorizedException();
    try {
      return this.users.update(id, body)
    } catch (error) {
      throw new InternalServerErrorException(error)
    }
  }

  async usersList(opt: PaginationDto) {
    const {page, limit, shop, search, status, branch, role} = opt

    const qb = this.users.createQueryBuilder('user')
    qb.select([
      'user.email',
      'user.fullName',
      'user.role',
      'user.isEmployee',
      'user.slug',
      'user.status',
      'user.createdAt',
    ])
    if(search?.trim()) {
      qb.andWhere('(user.full_name ILIKE :search OR user.email ILIKE :search)', { search: `%${search.trim()}%` })
    }
    if(status?.trim()) {
      qb.andWhere('(user.status = :status)', { status: status })
    }
    if(role?.trim()) {
      qb.andWhere('(user.role = :role)', { role: role })
    }

    qb.orderBy('user.createdAt', 'DESC')
    .skip((page - 1) * limit)
    .take(limit)

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
