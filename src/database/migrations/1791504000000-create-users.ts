import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1791504000000 implements MigrationInterface {
  name = 'CreateUsers1791504000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(255) NOT NULL,
        "full_name" character varying(80) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "role" character varying(32) NOT NULL,
        "is_employee" boolean NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "CHK_users_role"
          CHECK ("role" IN ('shop_owner', 'branch_manager', 'employee', 'admin'))
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
