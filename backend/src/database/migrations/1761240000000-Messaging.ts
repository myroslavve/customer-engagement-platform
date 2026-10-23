import { MigrationInterface, QueryRunner } from 'typeorm';

/** Requires the templates table from AdminApi1761220000000. */
export class Messaging1761240000000 implements MigrationInterface {
  name = 'Messaging1761240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "message_status" AS ENUM ('queued', 'sending', 'sent', 'failed', 'skipped')`,
    );
    await queryRunner.query(`ALTER TABLE "profiles" ADD "unsubscribed_at" timestamptz`);
    await queryRunner.query(`
      CREATE TABLE "messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL CONSTRAINT "fk_messages_account_id" REFERENCES "accounts"("id"),
        "run_id" uuid NOT NULL CONSTRAINT "fk_messages_run_id" REFERENCES "workflow_runs"("id"),
        "node_id" text NOT NULL,
        "profile_id" uuid NOT NULL CONSTRAINT "fk_messages_profile_id" REFERENCES "profiles"("id"),
        "template_id" uuid CONSTRAINT "fk_messages_template_id" REFERENCES "templates"("id") ON DELETE SET NULL,
        "to_email" text,
        "subject" text,
        "variables" jsonb NOT NULL,
        "status" "message_status" NOT NULL DEFAULT 'queued',
        "provider_message_id" text,
        "error" text,
        "attempts" int NOT NULL DEFAULT 0,
        "sent_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_messages_run_node" UNIQUE ("run_id", "node_id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_messages_account_created" ON "messages" ("account_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_messages_profile_created" ON "messages" ("profile_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "unsubscribed_at"`);
    await queryRunner.query(`DROP TYPE "message_status"`);
  }
}
