import { MigrationInterface, QueryRunner } from 'typeorm';

export class RunSteps1761230000000 implements MigrationInterface {
  name = 'RunSteps1761230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "run_step_status" AS ENUM ('completed', 'failed')`);
    await queryRunner.query(`
      CREATE TABLE "run_steps" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "run_id" uuid NOT NULL CONSTRAINT "fk_run_steps_run_id" REFERENCES "workflow_runs"("id"),
        "job_id" text NOT NULL,
        "node_id" text NOT NULL,
        "node_type" text,
        "cause" text NOT NULL,
        "status" "run_step_status" NOT NULL,
        "output" jsonb,
        "error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_run_steps_job_id" UNIQUE ("job_id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_run_steps_run_created" ON "run_steps" ("run_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "run_steps"`);
    await queryRunner.query(`DROP TYPE "run_step_status"`);
  }
}
