import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthFlow1761230000000 implements MigrationInterface {
  name = 'AuthFlow1761230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_users" ADD "token_version" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(`ALTER TABLE "admin_users" ADD "last_login_at" timestamptz`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admin_users" DROP COLUMN "last_login_at"`);
    await queryRunner.query(`ALTER TABLE "admin_users" DROP COLUMN "token_version"`);
  }
}
