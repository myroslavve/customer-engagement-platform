import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1761200000000 implements MigrationInterface {
  name = 'InitialSchema1761200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "workflow_status" AS ENUM ('draft', 'active', 'paused')`);
    await queryRunner.query(
      `CREATE TYPE "workflow_run_status" AS ENUM ('running', 'waiting', 'completed', 'failed', 'cancelled')`,
    );

    await queryRunner.query(`
      CREATE TABLE "accounts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE "profiles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL CONSTRAINT "fk_profiles_account_id" REFERENCES "accounts"("id"),
        "external_id" text NOT NULL,
        "email" text,
        "traits" jsonb NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_profiles_account_external" UNIQUE ("account_id", "external_id")
      )`);

    await queryRunner.query(`
      CREATE TABLE "events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL CONSTRAINT "fk_events_account_id" REFERENCES "accounts"("id"),
        "profile_id" uuid NOT NULL CONSTRAINT "fk_events_profile_id" REFERENCES "profiles"("id"),
        "name" text NOT NULL,
        "properties" jsonb NOT NULL DEFAULT '{}',
        "message_id" text,
        "occurred_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_events_account_message" ON "events" ("account_id", "message_id") WHERE "message_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_events_profile_occurred" ON "events" ("profile_id", "occurred_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "workflows" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL CONSTRAINT "fk_workflows_account_id" REFERENCES "accounts"("id"),
        "name" text NOT NULL,
        "status" "workflow_status" NOT NULL DEFAULT 'draft',
        "published_version_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE "workflow_versions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workflow_id" uuid NOT NULL CONSTRAINT "fk_workflow_versions_workflow_id" REFERENCES "workflows"("id"),
        "version" int NOT NULL,
        "trigger_event_name" text NOT NULL,
        "definition" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_workflow_versions_workflow_version" UNIQUE ("workflow_id", "version")
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_workflow_versions_trigger_event" ON "workflow_versions" ("trigger_event_name")`,
    );
    await queryRunner.query(
      `ALTER TABLE "workflows" ADD CONSTRAINT "fk_workflows_published_version_id" FOREIGN KEY ("published_version_id") REFERENCES "workflow_versions"("id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "workflow_runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "account_id" uuid NOT NULL CONSTRAINT "fk_workflow_runs_account_id" REFERENCES "accounts"("id"),
        "workflow_id" uuid NOT NULL CONSTRAINT "fk_workflow_runs_workflow_id" REFERENCES "workflows"("id"),
        "workflow_version_id" uuid NOT NULL CONSTRAINT "fk_workflow_runs_workflow_version_id" REFERENCES "workflow_versions"("id"),
        "profile_id" uuid NOT NULL CONSTRAINT "fk_workflow_runs_profile_id" REFERENCES "profiles"("id"),
        "trigger_event_id" uuid NOT NULL CONSTRAINT "fk_workflow_runs_trigger_event_id" REFERENCES "events"("id"),
        "status" "workflow_run_status" NOT NULL,
        "current_node_id" text,
        "waiting_for_event" text,
        "wait_until" timestamptz,
        "claim_key" text,
        "context" jsonb NOT NULL DEFAULT '{}',
        "finished_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_workflow_runs_version_trigger_event" UNIQUE ("workflow_version_id", "trigger_event_id")
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_workflow_runs_live_per_profile" ON "workflow_runs" ("workflow_id", "profile_id") WHERE "status" IN ('running', 'waiting')`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_workflow_runs_profile_status" ON "workflow_runs" ("profile_id", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "workflow_runs"`);
    await queryRunner.query(
      `ALTER TABLE "workflows" DROP CONSTRAINT "fk_workflows_published_version_id"`,
    );
    await queryRunner.query(`DROP TABLE "workflow_versions"`);
    await queryRunner.query(`DROP TABLE "workflows"`);
    await queryRunner.query(`DROP TABLE "events"`);
    await queryRunner.query(`DROP TABLE "profiles"`);
    await queryRunner.query(`DROP TABLE "accounts"`);
    await queryRunner.query(`DROP TYPE "workflow_run_status"`);
    await queryRunner.query(`DROP TYPE "workflow_status"`);
  }
}
