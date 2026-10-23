import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminApi1761220000000 implements MigrationInterface {
  name = 'AdminApi1761220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
    if (adminEmail || adminPasswordHash) {
      if (!adminEmail || !adminPasswordHash) {
        throw new Error(
          'ADMIN_EMAIL and ADMIN_PASSWORD_HASH must be provided together to bootstrap an admin user',
        );
      }
      if (
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail) ||
        !/^\$2[aby]\$(0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/.test(adminPasswordHash)
      ) {
        throw new Error('ADMIN_EMAIL or ADMIN_PASSWORD_HASH is invalid');
      }
    }
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

    if (!adminEmail && !adminPasswordHash) return;

    const existing = (await queryRunner.query(
      `SELECT account_id FROM "admin_users" WHERE LOWER(email) = $1`,
      [adminEmail],
    )) as Array<{ account_id: string }>;
    if (existing[0]) return;

    const accountName = process.env.ADMIN_ACCOUNT_NAME?.trim() || 'Default account';
    const accounts = (await queryRunner.query(
      `INSERT INTO "accounts" ("name") VALUES ($1) RETURNING "id"`,
      [accountName],
    )) as Array<{ id: string }>;
    await queryRunner.query(
      `INSERT INTO "admin_users" ("account_id", "email", "password_hash")
       VALUES ($1, $2, $3)`,
      [accounts[0].id, adminEmail, adminPasswordHash],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audiences"`);
    await queryRunner.query(`DROP TABLE "templates"`);
    await queryRunner.query(`DROP TABLE "api_keys"`);
    await queryRunner.query(`DROP INDEX "uq_admin_users_email_lower"`);
    await queryRunner.query(`DROP TABLE "admin_users"`);
  }
}
