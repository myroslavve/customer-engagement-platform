import { MigrationInterface, QueryRunner } from 'typeorm';

type EnumColumn = { table: string; type: string; values: string[]; default?: string };

/** Every PG enum column of the schema; the values are the TypeScript enums at the time of the change. */
const COLUMNS: EnumColumn[] = [
  {
    table: 'workflows',
    type: 'workflow_status',
    values: ['draft', 'active', 'paused'],
    default: 'draft',
  },
  {
    table: 'workflow_runs',
    type: 'workflow_run_status',
    values: ['running', 'waiting', 'completed', 'failed', 'cancelled'],
  },
  { table: 'run_steps', type: 'run_step_status', values: ['completed', 'failed'] },
  {
    table: 'messages',
    type: 'message_status',
    values: ['queued', 'sending', 'sent', 'failed', 'skipped'],
    default: 'queued',
  },
];

const LIVE_RUN_INDEX = 'uq_workflow_runs_live_per_profile';

/**
 * Status columns become varchar: a new status is a code change only, no ALTER TYPE. The partial
 * unique index on live runs compares against the enum type, so it is rebuilt around the change.
 */
export class StatusVarchar1761260000000 implements MigrationInterface {
  name = 'StatusVarchar1761260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "${LIVE_RUN_INDEX}"`);
    for (const column of COLUMNS) {
      await queryRunner.query(`ALTER TABLE "${column.table}" ALTER COLUMN "status" DROP DEFAULT`);
      await queryRunner.query(
        `ALTER TABLE "${column.table}" ALTER COLUMN "status" TYPE varchar USING "status"::text`,
      );
      if (column.default) {
        await queryRunner.query(
          `ALTER TABLE "${column.table}" ALTER COLUMN "status" SET DEFAULT '${column.default}'`,
        );
      }
      await queryRunner.query(`DROP TYPE "${column.type}"`);
    }
    await queryRunner.query(
      `CREATE UNIQUE INDEX "${LIVE_RUN_INDEX}" ON "workflow_runs" ("workflow_id", "profile_id")
       WHERE "status" IN ('running', 'waiting')`,
    );
  }

  /** Fails if a row holds a status the old enum did not have. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "${LIVE_RUN_INDEX}"`);
    for (const column of COLUMNS) {
      const values = column.values.map((value) => `'${value}'`).join(', ');
      await queryRunner.query(`CREATE TYPE "${column.type}" AS ENUM (${values})`);
      await queryRunner.query(`ALTER TABLE "${column.table}" ALTER COLUMN "status" DROP DEFAULT`);
      await queryRunner.query(
        `ALTER TABLE "${column.table}" ALTER COLUMN "status" TYPE "${column.type}" USING "status"::"${column.type}"`,
      );
      if (column.default) {
        await queryRunner.query(
          `ALTER TABLE "${column.table}" ALTER COLUMN "status" SET DEFAULT '${column.default}'`,
        );
      }
    }
    await queryRunner.query(
      `CREATE UNIQUE INDEX "${LIVE_RUN_INDEX}" ON "workflow_runs" ("workflow_id", "profile_id")
       WHERE "status" IN ('running', 'waiting')`,
    );
  }
}
