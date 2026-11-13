import type { MigrationInterface, QueryRunner } from 'typeorm';

// users.role holds the RBAC role names again ('admin' | 'shop_owner' |
// 'branch_manager' | 'employee') instead of the platform-only 'user' that
// AddShopRbac introduced. shop_members stays the per-shop source of truth;
// users.role mirrors the role a user signed up / was invited with.
export class ShopRolesOnUsers1794600000000 implements MigrationInterface {
  name = 'ShopRolesOnUsers1794600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "CHK_users_role"`,
    );
    // Map each 'user' to their highest built-in role across their memberships.
    await queryRunner.query(`
      UPDATE "users" u SET "role" = COALESCE((
        SELECT r."key" FROM "shop_members" m
        JOIN "shop_roles" r ON r."id" = m."role_id"
        WHERE m."user_id" = u."id" AND r."key" IS NOT NULL
        ORDER BY CASE r."key"
          WHEN 'shop_owner' THEN 1
          WHEN 'branch_manager' THEN 2
          ELSE 3
        END
        LIMIT 1
      ), 'employee')
      WHERE "role" = 'user'
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ADD CONSTRAINT "CHK_users_role"
        CHECK ("role" IN ('admin', 'shop_owner', 'branch_manager', 'employee'))
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'shop_owner'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "CHK_users_role"`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "role" = 'user' WHERE "role" <> 'admin'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CHK_users_role" CHECK ("role" IN ('admin', 'user'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user'`,
    );
  }
}
