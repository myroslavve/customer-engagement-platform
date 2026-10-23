import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminApi1761220000000 implements MigrationInterface {
  name = 'AdminApi1761220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "admin_users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
        "email" text NOT NULL,
        "password_hash" text NOT NULL,
        "role" text NOT NULL DEFAULT 'admin',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_admin_users_account_email" UNIQUE ("account_id", "email")
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_admin_users_email_lower" ON "admin_users" (LOWER("email"))`,
    );
    await queryRunner.query(`
      CREATE TABLE "api_keys" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "key_prefix" text NOT NULL,
        "key_hash" text NOT NULL UNIQUE,
        "revoked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(`
      CREATE TABLE "templates" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "subject" text NOT NULL,
        "body" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_templates_account_name" UNIQUE ("account_id", "name")
      )`);
    await queryRunner.query(`
      CREATE TABLE "audiences" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "rule" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_audiences_account_name" UNIQUE ("account_id", "name")
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audiences"`);
    await queryRunner.query(`DROP TABLE "templates"`);
    await queryRunner.query(`DROP TABLE "api_keys"`);
    await queryRunner.query(`DROP INDEX "uq_admin_users_email_lower"`);
    await queryRunner.query(`DROP TABLE "admin_users"`);
  }
}
