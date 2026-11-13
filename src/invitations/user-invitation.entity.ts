import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Shop } from '../shops/entities/shop.entity.js';
import { User } from '../users/user.entity.js';

// One emailed invitation link. Only the SHA-256 of the token is stored, so a
// database leak doesn't hand out working links.
@Entity('user_invitations')
@Index('IDX_user_invitations_user', ['userId'])
export class UserInvitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_user_invitations_user',
  })
  user?: User;

  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'shop_id',
    foreignKeyConstraintName: 'FK_user_invitations_shop',
  })
  shop?: Shop;

  // Kept without a foreign key so the record survives the inviter's deletion.
  @Column({ name: 'invited_by', type: 'uuid' })
  invitedBy: string;

  @Column({
    name: 'token_hash',
    type: 'varchar',
    length: 64,
    unique: true,
  })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
