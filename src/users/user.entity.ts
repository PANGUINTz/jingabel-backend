import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const USER_ROLES = [
  'shop_owner',
  'branch_manager',
  'employee',
  'admin',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_SLUG_LENGTH = 10;

@Entity('users')
@Check(
  'CHK_users_role',
  `"role" IN (${USER_ROLES.map((role) => `'${role}'`).join(', ')})`,
)
@Check('CHK_users_slug', `"slug" ~ '^[A-Za-z0-9]{${USER_SLUG_LENGTH}}$'`)
export class User {
  // Internal only — never sent to clients; use `slug` to refer to a user
  // from outside (URLs, responses).
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: USER_SLUG_LENGTH, unique: true })
  slug: string;

  // Always stored lowercased (see UsersService), so the unique index is
  // effectively case-insensitive.
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'full_name', type: 'varchar', length: 80 })
  fullName: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 32 })
  role: UserRole;

  // false only for self-registered Shop Owners; managers/employees are invited.
  @Column({ name: 'is_employee', type: 'boolean' })
  isEmployee: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

export type PublicUser = Omit<User, 'id' | 'passwordHash'>;

export function toPublicUser(user: User): PublicUser {
  const { id: _id, passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}
