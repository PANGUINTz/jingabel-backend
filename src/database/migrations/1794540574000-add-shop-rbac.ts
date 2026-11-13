import type { MigrationInterface, QueryRunner } from 'typeorm';
import { generateString } from '../../common/utils/generate-string.js';

// Shops + shop-scoped RBAC. users.role becomes a platform role ('admin' |
// 'user'); a user's role inside a shop now lives in shop_members.
export class AddShopRbac1794540574000 implements MigrationInterface {
  name = 'AddShopRbac1794540574000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "shops" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "slug" character varying(10) NOT NULL,
        "name" character varying(60) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shops_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_shops_slug" UNIQUE ("slug"),
        CONSTRAINT "CHK_shops_slug" CHECK ("slug" ~ '^[A-Za-z0-9]{10}$')
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "shop_roles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shop_id" uuid,
        "key" character varying(32),
        "name" character varying(60) NOT NULL,
        "permissions" text array NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shop_roles_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_shop_roles_shop" FOREIGN KEY ("shop_id")
          REFERENCES "shops"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_shop_roles_system_key" ON "shop_roles" ("key") WHERE "shop_id" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_shop_roles_shop_name" ON "shop_roles" ("shop_id", "name") WHERE "shop_id" IS NOT NULL`,
    );
    await queryRunner.query(`
      CREATE TABLE "shop_members" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shop_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shop_members_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_shop_members_shop_user" UNIQUE ("shop_id", "user_id"),
        CONSTRAINT "FK_shop_members_shop" FOREIGN KEY ("shop_id")
          REFERENCES "shops"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_shop_members_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_shop_members_role" FOREIGN KEY ("role_id")
          REFERENCES "shop_roles"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_shop_members_user" ON "shop_members" ("user_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" BIGSERIAL NOT NULL,
        "actor_user_id" uuid NOT NULL,
        "shop_id" uuid,
        "action" character varying(64) NOT NULL,
        "target_id" character varying(64),
        "details" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_shop_created" ON "audit_logs" ("shop_id", "created_at")`,
    );

    await queryRunner.query(`
      INSERT INTO "shop_roles" ("key", "name") VALUES
        ('shop_owner', 'Shop Owner'),
        ('branch_manager', 'Branch Manager'),
        ('employee', 'Employee')
    `);

    // Existing shop owners registered before shops existed: give each one a
    // shop (they can rename it) and make them its owner.
    const owners: { id: string; full_name: string }[] = await queryRunner.query(
      `SELECT "id", "full_name" FROM "users" WHERE "role" = 'shop_owner'`,
    );
    for (const owner of owners) {
      const [shop]: { id: string }[] = await queryRunner.query(
        `INSERT INTO "shops" ("slug", "name") VALUES ($1, $2) RETURNING "id"`,
        [generateString(10), `ร้านของ ${owner.full_name}`.slice(0, 60)],
      );
      await queryRunner.query(
        `INSERT INTO "shop_members" ("shop_id", "user_id", "role_id")
         SELECT $1, $2, "id" FROM "shop_roles"
         WHERE "key" = 'shop_owner' AND "shop_id" IS NULL`,
        [shop.id, owner.id],
      );
    }

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

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "CHK_users_role"`,
    );
    // Best effort: anyone who owns a shop goes back to shop_owner, every other
    // non-admin to employee.
    await queryRunner.query(`
      UPDATE "users" u SET "role" = CASE
        WHEN EXISTS (
          SELECT 1 FROM "shop_members" m
          JOIN "shop_roles" r ON r."id" = m."role_id"
          WHERE m."user_id" = u."id" AND r."key" = 'shop_owner'
        ) THEN 'shop_owner'
        ELSE 'employee'
      END
      WHERE "role" = 'user'
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ADD CONSTRAINT "CHK_users_role"
        CHECK ("role" IN ('shop_owner', 'branch_manager', 'employee', 'admin'))
    `);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "shop_members"`);
    await queryRunner.query(`DROP TABLE "shop_roles"`);
    await queryRunner.query(`DROP TABLE "shops"`);
  }
}
