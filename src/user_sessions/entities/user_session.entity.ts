import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('user_sessions')
export class UserSession {
  // Internal only — never sent to clients; use `slug` to refer to a user
  // from outside (URLs, responses).
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'user_slug', type: 'varchar' })
  userSlug: string;

  @Column({ name: 'refresh_token', type: 'varchar', unique: true })
  refreshToken: string;

  @Column({ name: 'device_name', type: 'varchar', length: 255, nullable: true })
  deviceName: string;

  @Column({ name: 'device_type', type: 'varchar', length: 255, nullable: true })
  deviceType: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent: string;

  @Column({ name: 'ip_address', type: 'varchar', length: 255, nullable: true })
  ipAddress: string;

  @Column({ name: 'location', type: 'varchar', length: 255, nullable: true })
  location: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'last_active', type: 'timestamptz' })
  lastActiveAt: Date;

  @Column({ name: 'expired_at', type: 'timestamptz' })
  expiredAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
