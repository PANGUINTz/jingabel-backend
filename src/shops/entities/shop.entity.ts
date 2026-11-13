import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export const SHOP_SLUG_LENGTH = 10;

@Entity('shops')
@Check('CHK_shops_slug', `"slug" ~ '^[A-Za-z0-9]{${SHOP_SLUG_LENGTH}}$'`)
export class Shop {
  // Internal only — refer to a shop from outside (URLs, responses) by `slug`.
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: SHOP_SLUG_LENGTH, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 60 })
  name: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
