import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Shop } from './shop.entity.js';

export const SHOP_BRANCH_SLUG_LENGTH = 10;

// Every shop gets this branch when it is created; it can be renamed.
export const DEFAULT_BRANCH_NAME = 'สาขาหลัก';

@Entity('shop_branches')
@Unique('UQ_shop_branches_shop_name', ['shopId', 'name'])
@Index('IDX_shop_branches_shop', ['shopId'])
@Check(
  'CHK_shop_branches_slug',
  `"slug" ~ '^[A-Za-z0-9]{${SHOP_BRANCH_SLUG_LENGTH}}$'`,
)
export class ShopBranch {
  // Internal only — refer to a branch from outside (URLs, responses) by `slug`.
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: SHOP_BRANCH_SLUG_LENGTH, unique: true })
  slug: string;

  @Column({ name: 'shop_id', type: 'uuid' })
  shopId: string;

  @ManyToOne(() => Shop, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'shop_id',
    foreignKeyConstraintName: 'FK_shop_branches_shop',
  })
  shop?: Shop;

  @Column({ type: 'varchar', length: 60 })
  name: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
