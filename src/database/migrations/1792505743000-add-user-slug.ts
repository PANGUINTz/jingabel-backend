import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserSlug1792505743000 implements MigrationInterface {
  name = 'AddUserSlug1792505743000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "slug" character varying(10)`,
    );
    // Backfill existing rows. New rows get their slug from the app
    // (crypto-random); random() is fine for this one-off. The WHERE clause
    // correlates the subquery so each row gets its own value.
    await queryRunner.query(`
      UPDATE "users" SET "slug" = (
        SELECT string_agg(
          substr(
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
            1 + floor(random() * 62)::int,
            1
          ),
          ''
        )
        FROM generate_series(1, 10)
        WHERE "users"."id" IS NOT NULL
      )
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "slug" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_users_slug" UNIQUE ("slug")`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CHK_users_slug" CHECK ("slug" ~ '^[A-Za-z0-9]{10}$')`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "slug"`);
  }
}
