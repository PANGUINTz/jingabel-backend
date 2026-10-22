import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { generateString } from '../common/utils/generate-string.js';
import { USER_SLUG_LENGTH, User } from './user.entity.js';

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
  async create(input: CreateUserInput): Promise<User> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.users.save(
          this.users.create({
            ...input,
            email: normalizeEmail(input.email),
            slug: generateString(USER_SLUG_LENGTH),
          }),
        );
      } catch (error) {
        if (attempt >= SLUG_ATTEMPTS || !isSlugCollision(error)) throw error;
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

  async changePassword(id: string, body: ChangePasswordInput) {
    const user = await this.findById(id);
    if (!user) throw new UnauthorizedException();
    try {
      return this.users.update(id, body)
    } catch (error) {
      throw new InternalServerErrorException(error)
    }
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
