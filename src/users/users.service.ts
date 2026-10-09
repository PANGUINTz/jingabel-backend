import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity.js';

export type CreateUserInput = Pick<
  User,
  'email' | 'fullName' | 'passwordHash' | 'role' | 'isEmployee'
>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email: normalizeEmail(email) });
  }

  // Rejects with a unique-violation QueryFailedError if the email is taken.
  create(input: CreateUserInput): Promise<User> {
    return this.users.save(
      this.users.create({ ...input, email: normalizeEmail(input.email) }),
    );
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
