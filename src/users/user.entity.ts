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

@Entity('users')
@Check(
  'CHK_users_role',
  `"role" IN (${USER_ROLES.map((role) => `'${role}'`).join(', ')})`,
)
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

export type PublicUser = Omit<User, 'passwordHash'>;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}
