import {
  CreateDateColumn,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/user.entity.js';
import { ShopBranch } from './shop-branch.entity.js';
import { Shop } from './shop.entity.js';

// A user's membership in one shop, at one of its branches. A user can belong
// to several shops; their role is users.role, the same in each of them.
@Entity('shop_members')
@Unique('UQ_shop_members_shop_user', ['shopId', 'userId'])
@Index('IDX_shop_members_user', ['userId'])
@Index('IDX_shop_members_branch', ['branchId'])
export class ShopMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'shop_id',
    foreignKeyConstraintName: 'FK_shop_members_shop',
  })
  shop?: Shop;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_shop_members_user',
  })
  user?: User;

  // The branch the member works at. Must belong to the same shop (enforced by
  // the services that set it).
  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  // RESTRICT: a branch can't be deleted while it still has members.
  @ManyToOne(() => ShopBranch, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'branch_id',
    foreignKeyConstraintName: 'FK_shop_members_branch',
  })
  branch?: ShopBranch;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
