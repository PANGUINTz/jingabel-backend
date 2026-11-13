import type { MigrationInterface, QueryRunner } from 'typeorm';

// Roles are fixed and live only in users.role ('admin' | 'shop_owner' |
// 'branch_manager' | 'employee'); shops can no longer define their own.
// shop_members keeps only who belongs to which shop. ShopRolesOnUsers already
// copied each user's highest membership role into users.role.
// IF EXISTS: with synchronize on, a dev database may already lack role_id.
export class DropShopRoles1794700000000 implements MigrationInterface {
  name = 'DropShopRoles1794700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "shop_members" DROP CONSTRAINT IF EXISTS "FK_shop_members_role"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shop_members" DROP COLUMN IF EXISTS "role_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "shop_roles"`);
  }

  // Custom roles are gone for good; memberships come back with the built-in
  // role matching users.role (an admin who is a member becomes an employee).
  async down(queryRunner: QueryRunner): Promise<void> {
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
      INSERT INTO "shop_roles" ("key", "name") VALUES
        ('shop_owner', 'Shop Owner'),
        ('branch_manager', 'Branch Manager'),
        ('employee', 'Employee')
    `);
    await queryRunner.query(
      `ALTER TABLE "shop_members" ADD COLUMN "role_id" uuid`,
    );
    await queryRunner.query(`
      UPDATE "shop_members" m SET "role_id" = r."id"
      FROM "users" u, "shop_roles" r
      WHERE u."id" = m."user_id" AND r."shop_id" IS NULL
        AND r."key" = CASE WHEN u."role" = 'admin' THEN 'employee' ELSE u."role" END
    `);
    await queryRunner.query(
      `ALTER TABLE "shop_members" ALTER COLUMN "role_id" SET NOT NULL`,
    );
    await queryRunner.query(`
      ALTER TABLE "shop_members" ADD CONSTRAINT "FK_shop_members_role"
        FOREIGN KEY ("role_id") REFERENCES "shop_roles"("id") ON DELETE RESTRICT
    `);
  }
}
